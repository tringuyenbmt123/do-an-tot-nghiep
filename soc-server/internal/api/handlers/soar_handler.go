// ==============================================================================
// Package handlers - SOAR Handler
// File: internal/api/handlers/soar_handler.go
// Mô tả: Endpoint nhận Callback (Webhook) từ n8n SOAR trả về Server.
//         Kích hoạt lệnh Active Response (KILL_PROCESS, BLOCK_IP) xuống Agent
//         nếu AI/HITL quyết định hành động.
// ==============================================================================

package handlers

import (
	"log"
	"net/http"
	"time"

	"soc-server/internal/agent_grpc"
	pb "soc-server/internal/generated/proto"
	"soc-server/internal/models"
	"soc-server/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// callbackSecretHeader - Tên header n8n phải gửi kèm để xác thực
const callbackSecretHeader = "X-SOC-Callback-Secret"

// SOARHandler - Handler xử lý SOAR API
type SOARHandler struct {
	soarService    *services.SOARService
	connManager    *agent_grpc.ConnectionManager
	alertService   *services.AlertService
	callbackSecret string // Shared secret xác thực callback từ n8n
}

// NewSOARHandler - Khởi tạo SOARHandler
func NewSOARHandler(soar *services.SOARService, cm *agent_grpc.ConnectionManager, alert *services.AlertService, callbackSecret string) *SOARHandler {
	return &SOARHandler{
		soarService:    soar,
		connManager:    cm,
		alertService:   alert,
		callbackSecret: callbackSecret,
	}
}

// HandleN8NCallback - POST /api/v1/soar/callback
// Nhận kết quả phân tích AI hoặc phê duyệt HITL từ n8n
//
// Bảo mật: Yêu cầu header X-SOC-Callback-Secret khớp với callback_secret trong config.
// n8n phải cấu hình thêm header này trong node HTTP Request của workflow.
func (h *SOARHandler) HandleN8NCallback(c *gin.Context) {
	// ===== Xác thực Shared Secret =====
	if h.callbackSecret != "" {
		receivedSecret := c.GetHeader(callbackSecretHeader)
		if receivedSecret != h.callbackSecret {
			log.Printf("[SOAR HANDLER] 🚫 Callback bị từ chối: Secret không hợp lệ (IP: %s)", c.ClientIP())
			// Trả về 401 nhưng không tiết lộ lý do cụ thể (tránh information leakage)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}
	}

	var payload services.SOARCallbackPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Payload JSON không hợp lệ: " + err.Error()})
		return
	}

	// 1. Chuyển payload xuống tầng Service xử lý (tạo Case, ghi Audit)
	auditAction, target, err := h.soarService.HandleCallback(payload)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Lỗi xử lý callback: " + err.Error()})
		return
	}

	// 2. Nếu action là loại can thiệp (Active Response), tìm Agent và đẩy lệnh qua gRPC mTLS
	if auditAction == models.ActionKillProcess || auditAction == models.ActionBlockIP || auditAction == models.ActionBlockURL {
		
		// Tìm AgentID liên quan đến Alert này
		alert, err := h.alertService.GetAlertByID(payload.AlertID)
		if err != nil {
			log.Printf("[SOAR HANDLER] ⚠️ Không tìm thấy Alert '%s' để gửi lệnh phản ứng", payload.AlertID)
			c.JSON(http.StatusOK, gin.H{"message": "Đã ghi nhận, nhưng không tìm thấy Agent để thực thi lệnh"})
			return
		}
		
		agentID := alert.AgentID

		// Chuẩn bị CommandResponse theo protobuf
		cmdType := pb.CommandType_COMMAND_NONE
		switch auditAction {
		case models.ActionKillProcess:
			cmdType = pb.CommandType_KILL_PROCESS
		case models.ActionBlockIP:
			cmdType = pb.CommandType_BLOCK_IP
		case models.ActionBlockURL:
			cmdType = pb.CommandType_BLOCK_URL
		}

		cmd := &pb.CommandResponse{
			CommandId:   uuid.New().String(),
			CommandType: cmdType,
			Target:      target, // PID hoặc IP address
			Timestamp:   time.Now().UnixMilli(),
			Parameters: map[string]string{
				"reason":    payload.AIReason,
				"alert_id":  payload.AlertID,
				"issued_by": "n8n_soar_automation",
			},
		}

		// Gọi ConnectionManager để đẩy lệnh xuống luồng gRPC của Agent
		if err := h.connManager.SendCommand(agentID, cmd); err != nil {
			log.Printf("[SOAR HANDLER] ❌ Lỗi gửi lệnh %s xuống Agent '%s': %v", cmdType.String(), agentID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Không thể gửi lệnh xuống Agent (có thể offline)"})
			return
		}

		log.Printf("[SOAR HANDLER] ⚡ Đã ra lệnh %s (target: %s) xuống Agent '%s' thành công", cmdType.String(), target, agentID)
	}

	c.JSON(http.StatusOK, gin.H{"message": "Callback processed successfully", "action_taken": auditAction})
}
