// ==============================================================================
// Package agent_grpc - gRPC Service Handler
// File: internal/agent_grpc/handler.go
// Mô tả: Implement AgentService gRPC với 2 RPC methods:
//
//   1. StreamEvents (Bidirectional Streaming):
//      - Goroutine 1 (Receiver): Nhận stream Sysmon/Event Log từ Agent
//        → Parse JSON → Gọi RuleEngine.EvaluateLog() → Tạo Alert → Broadcast
//      - Goroutine 2 (Sender): Lắng nghe command channel
//        → Đẩy CommandResponse (KILL_PROCESS, BLOCK_IP) xuống Agent
//
//   2. Heartbeat (Unary):
//      - Cập nhật last_heartbeat_at trong PostgreSQL
//      - Set agent status = "online" trong Redis (với TTL)
// ==============================================================================

package agent_grpc

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"time"

	pb "soc-server/internal/generated/proto"
	"soc-server/internal/models"
	"soc-server/internal/rules"
	"soc-server/pkg/database"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// AlertCallback - Function type để gọi callback khi có Alert mới
// Cho phép handler thông báo cho các module khác (WebSocket broadcast, SOAR dispatch)
type AlertCallback func(alert *models.Alert)

// AgentServiceHandler - Implement AgentServiceServer interface từ protobuf
type AgentServiceHandler struct {
	pb.UnimplementedAgentServiceServer // Embed default implementation

	db          *gorm.DB              // PostgreSQL connection
	redis       *database.RedisClient // Redis client
	ruleEngine  *rules.RuleEngine     // Detection Rule Engine
	connManager *ConnectionManager    // Connection Manager
	onNewAlert  AlertCallback         // Callback khi có Alert mới
}

// NewAgentServiceHandler - Khởi tạo handler với tất cả dependencies
func NewAgentServiceHandler(
	db *gorm.DB,
	redis *database.RedisClient,
	ruleEngine *rules.RuleEngine,
	connManager *ConnectionManager,
	onNewAlert AlertCallback,
) *AgentServiceHandler {
	return &AgentServiceHandler{
		db:          db,
		redis:       redis,
		ruleEngine:  ruleEngine,
		connManager: connManager,
		onNewAlert:  onNewAlert,
	}
}

// ==============================================================================
// StreamEvents - Bidirectional Streaming RPC
//
// Luồng xử lý:
//
//	Agent ──stream EventRequest──→ Server (Goroutine Receiver)
//	                                 ↓ EvaluateLog()
//	                                 ↓ Match? → Create Alert → Broadcast
//	Agent ←──stream CommandResponse── Server (Goroutine Sender)
//	                                 ↑ Lắng nghe CmdChan
//
// ==============================================================================
func (h *AgentServiceHandler) StreamEvents(stream pb.AgentService_StreamEventsServer) error {
	// Tạo connection mới cho Agent
	conn := &ActiveConnection{
		Stream:  stream,
		CmdChan: make(chan *pb.CommandResponse, 100), // Buffer 100 commands
		Done:    make(chan struct{}),
	}

	// Biến flag để biết đã register chưa
	registered := false
	var agentID string

	// ===== Goroutine 1: Receiver - Nhận events từ Agent =====
	// Goroutine này chạy trong main goroutine của StreamEvents
	// Khi stream đóng (Agent disconnect), hàm sẽ return
	defer func() {
		if registered {
			h.connManager.Unregister(agentID)
			// Cập nhật trạng thái Agent offline trong Redis
			ctx := context.Background()
			_ = h.redis.SetAgentOffline(ctx, agentID)
			// Cập nhật trong database
			h.db.Model(&models.Agent{}).Where("id = ?", agentID).Update("status", "offline")
			log.Printf("[STREAM] 🔴 Agent '%s' đã ngắt kết nối stream", agentID)
		}
	}()

	// ===== Goroutine 2: Sender - Đẩy commands xuống Agent =====
	// Goroutine riêng lắng nghe channel CmdChan và gửi qua stream
	go func() {
		for {
			select {
			case cmd := <-conn.CmdChan:
				// Gửi command xuống Agent qua gRPC stream
				if err := stream.Send(cmd); err != nil {
					log.Printf("[STREAM] ❌ Lỗi gửi command xuống Agent '%s': %v", agentID, err)
					return
				}
				log.Printf("[STREAM] 📤 Đã gửi command '%s' xuống Agent '%s'",
					cmd.CommandType.String(), agentID)
			case <-conn.Done:
				// Kết nối đã đóng, dừng goroutine sender
				return
			}
		}
	}()

	// ===== Main Loop: Nhận events từ Agent stream =====
	for {
		// Nhận EventRequest từ Agent (blocking)
		event, err := stream.Recv()
		if err == io.EOF {
			log.Printf("[STREAM] Agent '%s' đã đóng stream (EOF)", agentID)
			return nil
		}
		if err != nil {
			log.Printf("[STREAM] ❌ Lỗi nhận event từ Agent '%s': %v", agentID, err)
			return err
		}

		// Lần nhận đầu tiên: Register Agent connection
		if !registered {
			agentID = event.AgentId
			conn.AgentID = agentID
			conn.Hostname = event.Hostname
			conn.IPAddress = event.IpAddress

			// Đăng ký connection vào Connection Manager
			h.connManager.Register(conn)
			registered = true

			// Cập nhật trạng thái Agent online
			ctx := context.Background()
			_ = h.redis.SetAgentOnline(ctx, agentID)
			var agent models.Agent
			result := h.db.Where("id = ?", agentID).First(&agent)
			switch result.Error {
			case nil:
				h.db.Model(&agent).Updates(map[string]interface{}{
					"status":     "online",
					"ip_address": event.IpAddress,
					"hostname":   event.Hostname,
				})
			case gorm.ErrRecordNotFound:
				h.db.Create(&models.Agent{
					ID:        agentID,
					Hostname:  event.Hostname,
					IPAddress: event.IpAddress,
					Status:    "online",
				})
			default:
				log.Printf("[STREAM] ⚠️ Không thể lưu Agent '%s': %v", agentID, result.Error)
			}

			log.Printf("[STREAM] 🟢 Agent '%s' (%s) đã bắt đầu stream events", agentID, event.Hostname)
		}

		// ===== Xử lý Event: Parse JSON → Evaluate Rule =====
		h.processEvent(event, agentID)
	}
}

// processEvent - Xử lý 1 event nhận từ Agent
// Parse raw_payload JSON → Gọi RuleEngine.EvaluateLog() → Tạo Alert nếu match
func (h *AgentServiceHandler) processEvent(event *pb.EventRequest, agentID string) {
	// Parse raw_payload (JSON string) thành map
	var rawLog map[string]interface{}
	if err := json.Unmarshal([]byte(event.RawPayload), &rawLog); err != nil {
		log.Printf("[STREAM] ⚠️ Lỗi parse raw_payload JSON từ Agent '%s': %v", agentID, err)
		// Nếu không parse được JSON, tạo map thủ công từ fields có sẵn
		rawLog = map[string]interface{}{
			"raw_data": event.RawPayload,
		}
	}

	// Bổ sung metadata vào rawLog để Rule Engine có thêm context
	rawLog["event_type"] = event.EventType
	rawLog["hostname"] = event.Hostname
	rawLog["ip_address"] = event.IpAddress
	rawLog["agent_id"] = agentID

	// Metric là telemetry phục vụ biểu đồ/trạng thái Agent, không phải security alert.
	if event.EventType == "system_metric" {
		return
	}
	if event.EventType == "file_integrity" {
		log.Printf("[STREAM] 📁 Nhận FIM event từ Agent '%s': %s", agentID, event.RawPayload)
	}

	// ===== Gọi Rule Engine đánh giá event =====
	alert, matched := h.ruleEngine.EvaluateLog(rawLog, agentID)
	if !matched {
		// Event không nguy hiểm vẫn được lưu để analyst theo dõi trên dashboard.
		rawPayloadJSON, _ := json.Marshal(rawLog)
		alert = &models.Alert{
			ID:          uuid.New().String(),
			AgentID:     agentID,
			RuleID:      "EVENT-OBSERVED",
			EventType:   models.AlertEventType(event.EventType),
			Severity:    models.SeverityLow,
			RawPayload:  string(rawPayloadJSON),
			Status:      models.AlertStatusNew,
			Title:       fmt.Sprintf("[LOW] Event observed: %s", event.EventType),
			Description: "Sự kiện được ghi nhận từ Agent nhưng không khớp detection rule nguy hiểm.",
			CreatedAt:   time.Now(),
		}
	}

	// ===== Rule matched! Lưu Alert vào database =====
	if err := h.db.Create(alert).Error; err != nil {
		log.Printf("[STREAM] ❌ Lỗi lưu Alert vào database: %v", err)
		return
	}

	log.Printf("[STREAM] 🚨 ALERT CREATED: [%s] %s (Agent: %s, Rule: %s)",
		alert.Severity, alert.Title, agentID, alert.RuleID)

	// ===== Ghi Audit Log =====
	payloadSummary, _ := json.Marshal(map[string]string{
		"event_type": string(alert.EventType),
		"rule_id":    alert.RuleID,
		"severity":   string(alert.Severity),
	})
	auditLog := &models.AuditLog{
		ID:             uuid.New().String(),
		EventType:      "alert_created",
		Source:         models.AuditSourceRuleBased,
		ActionTaken:    models.ActionLogOnly,
		Confidence:     1.0,
		Actor:          "rule_engine",
		PayloadSummary: string(payloadSummary),
		RelatedAlertID: alert.ID,
		RelatedAgentID: agentID,
		CreatedAt:      time.Now(),
	}
	h.db.Create(auditLog)

	// ===== Gọi callback thông báo Alert mới =====
	// Callback sẽ: 1) Broadcast WebSocket, 2) Dispatch n8n
	if h.onNewAlert != nil {
		go h.onNewAlert(alert) // Non-blocking: chạy trong goroutine riêng
	}
}

// ==============================================================================
// Heartbeat - Unary RPC
// Agent gửi heartbeat định kỳ (mỗi 30 giây) để báo cáo trạng thái
// ==============================================================================
func (h *AgentServiceHandler) Heartbeat(ctx context.Context, req *pb.HeartbeatRequest) (*pb.HeartbeatResponse, error) {
	log.Printf("[HEARTBEAT] 💓 Nhận heartbeat từ Agent '%s' (%s - %s)",
		req.AgentId, req.Hostname, req.IpAddress)

	now := time.Now()

	// 1. Cập nhật trạng thái Agent trong Redis (với TTL)
	if err := h.redis.SetAgentOnline(ctx, req.AgentId); err != nil {
		log.Printf("[HEARTBEAT] ⚠️ Lỗi cập nhật Redis cho Agent '%s': %v", req.AgentId, err)
	}

	// 2. Lưu thêm heartbeat data vào Redis Hash (CPU, RAM, version)
	heartbeatData := map[string]interface{}{
		"hostname":      req.Hostname,
		"ip_address":    req.IpAddress,
		"os_type":       req.OsType,
		"agent_version": req.AgentVersion,
		"cpu_usage":     req.CpuUsage,
		"memory_usage":  req.MemoryUsage,
		"last_seen":     now.Format(time.RFC3339),
	}
	_ = h.redis.SetAgentHeartbeatData(ctx, req.AgentId, heartbeatData)

	// 3. Cập nhật hoặc tạo mới Agent trong PostgreSQL
	agent := models.Agent{
		ID:              req.AgentId,
		Hostname:        req.Hostname,
		IPAddress:       req.IpAddress,
		OSType:          req.OsType,
		Status:          "online",
		LastHeartbeatAt: &now,
		AgentVersion:    req.AgentVersion,
	}

	// Upsert: Tạo mới nếu chưa tồn tại, cập nhật nếu đã có
	result := h.db.Where("id = ?", req.AgentId).First(&models.Agent{})
	if result.Error == gorm.ErrRecordNotFound {
		// Agent mới → INSERT
		if err := h.db.Create(&agent).Error; err != nil {
			log.Printf("[HEARTBEAT] ❌ Không thể đăng ký Agent '%s': %v", req.AgentId, err)
		} else {
			log.Printf("[HEARTBEAT] 🆕 Agent mới đã đăng ký: '%s' (%s)", req.AgentId, req.Hostname)
		}
	} else {
		// Agent đã tồn tại → UPDATE
		h.db.Model(&models.Agent{}).Where("id = ?", req.AgentId).Updates(map[string]interface{}{
			"hostname":          req.Hostname,
			"ip_address":        req.IpAddress,
			"os_type":           req.OsType,
			"status":            "online",
			"last_heartbeat_at": &now,
			"agent_version":     req.AgentVersion,
		})
	}

	// 4. Trả về response cho Agent
	return &pb.HeartbeatResponse{
		Acknowledged:             true,
		HeartbeatIntervalSeconds: 30, // Agent nên gửi heartbeat mỗi 30 giây
		Message:                  "OK",
	}, nil
}
