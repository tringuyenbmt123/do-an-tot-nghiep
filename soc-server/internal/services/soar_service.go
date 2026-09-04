// ==============================================================================
// Package services - SOAR Service
// File: internal/services/soar_service.go
// Mô tả: Quản lý tích hợp với n8n SOAR (Webhook Dispatch & Callback).
//         DispatchToN8N: Bắn webhook khi có Alert mới.
//         HandleCallback: Xử lý kết quả trả về từ n8n (AI analysis / HITL).
// ==============================================================================

package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"soc-server/internal/config"
	"soc-server/internal/models"
)

// SOARService - Service xử lý tích hợp n8n SOAR
type SOARService struct {
	config       *config.SOARConfig
	caseService  *CaseService
	auditService *AuditService
	httpClient   *http.Client
}

// NewSOARService - Khởi tạo SOARService
func NewSOARService(cfg *config.SOARConfig, caseService *CaseService, auditService *AuditService) *SOARService {
	return &SOARService{
		config:       cfg,
		caseService:  caseService,
		auditService: auditService,
		httpClient: &http.Client{
			Timeout: time.Duration(cfg.WebhookTimeoutSecs) * time.Second,
		},
	}
}

// ==============================================================================
// GỬI WEBHOOK ĐI (OUTBOUND)
// ==============================================================================

// N8NWebhookPayload - Payload chuẩn hóa gửi sang n8n khi có Alert mới
type N8NWebhookPayload struct {
	AlertID     string `json:"alert_id"`
	AgentID     string `json:"agent_id"`
	EventType   string `json:"event_type"`
	Severity    string `json:"severity"`
	Title       string `json:"title"`
	Description string `json:"description"`
	RawPayload  string `json:"raw_payload"`
	Timestamp   string `json:"timestamp"`
}

// DispatchToN8N - Hàm bắn Webhook sang n8n (chạy non-blocking goroutine)
func (s *SOARService) DispatchToN8N(alert *models.Alert) {
	if !s.config.Enabled || s.config.N8NWebhookURL == "" || !shouldDispatchToN8N(alert) {
		return // SOAR integration bị tắt
	}

	payload := N8NWebhookPayload{
		AlertID:     alert.ID,
		AgentID:     alert.AgentID,
		EventType:   string(alert.EventType),
		Severity:    string(alert.Severity),
		Title:       alert.Title,
		Description: alert.Description,
		RawPayload:  alert.RawPayload,
		Timestamp:   alert.CreatedAt.Format(time.RFC3339),
	}

	payloadBytes, _ := json.Marshal(payload)

	// Retry logic đơn giản
	go func() {
		for i := 1; i <= s.config.MaxRetries; i++ {
			req, err := http.NewRequest("POST", s.config.N8NWebhookURL, bytes.NewBuffer(payloadBytes))
			if err != nil {
				log.Printf("[SOAR] ❌ Lỗi tạo webhook request: %v", err)
				return
			}
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-SOC-Source", "SOC-Server")

			resp, err := s.httpClient.Do(req)
			if err == nil {
				resp.Body.Close()
				if resp.StatusCode >= 200 && resp.StatusCode < 300 {
					log.Printf("[SOAR] ✅ Đã dispatch Alert '%s' sang n8n thành công", alert.ID)

					// Ghi Audit Log: Bắn webhook thành công
					s.auditService.LogAction(
						"soar_webhook_dispatched",
						models.AuditSourceSOAR,
						models.ActionLogOnly,
						"soar_dispatcher",
						fmt.Sprintf("Sent payload to n8n for analysis"),
						"", alert.ID, alert.AgentID,
					)
					return // Thành công, thoát khỏi vòng lặp
				}
				log.Printf("[SOAR] ⚠️ Webhook trả về status code: %d", resp.StatusCode)
			} else {
				log.Printf("[SOAR] ⚠️ Lỗi gọi webhook n8n (lần %d/%d): %v", i, s.config.MaxRetries, err)
			}

			// Đợi trước khi retry
			if i < s.config.MaxRetries {
				time.Sleep(time.Duration(i*2) * time.Second) // Exponential backoff: 2s, 4s, 6s
			}
		}
		log.Printf("[SOAR] ❌ Đã thử %d lần nhưng không thể dispatch Alert '%s' sang n8n", s.config.MaxRetries, alert.ID)
	}()
}

// shouldDispatchToN8N chỉ đưa alert cần orchestration sang n8n.
// Event nhẹ vẫn được lưu và hiển thị trên dashboard nhưng không làm nhiễu workflow SOAR.
func shouldDispatchToN8N(alert *models.Alert) bool {
	eventType := strings.ToLower(string(alert.EventType))
	switch eventType {
	case "ddos_detected", "phishing_detected", "brute_force", "brute_force_detected",
		"file_integrity", "fim", "fim_detected":
		return true
	}

	return alert.Severity == models.SeverityCritical
}

// ==============================================================================
// NHẬN CALLBACK VỀ (INBOUND)
// ==============================================================================

// SOARCallbackPayload - Payload mà n8n gửi trả về Server sau khi xử lý xong
// Dùng cho Endpoint: POST /api/v1/soar/callback
type SOARCallbackPayload struct {
	AlertID         string  `json:"alert_id"`
	Action          string  `json:"action"`            // kill_process, block_ip, create_case, ignore
	Target          string  `json:"target,omitempty"`  // PID, IP (cần cho action)
	AIReason        string  `json:"ai_reason"`         // Lý do phân tích từ AI Ollama
	Confidence      float64 `json:"confidence"`        // Độ tin cậy (0.0 - 1.0)
	HumanApprovedBy string  `json:"human_approved_by"` // Telegram username của người duyệt (nếu có HITL)
}

// HandleCallback - Xử lý payload callback từ n8n
// Trả về models.AuditAction và target để API handler biết cần đẩy lệnh Active Response không
func (s *SOARService) HandleCallback(payload SOARCallbackPayload) (models.AuditAction, string, error) {
	log.Printf("[SOAR] 📥 Nhận Callback từ n8n cho Alert '%s'. Action: %s", payload.AlertID, payload.Action)

	// Lấy Alert để biết AgentID liên quan
	alert, err := s.caseService.db.Model(&models.Alert{}).Where("id = ?", payload.AlertID).Select("agent_id").Rows()
	var agentID string
	if err == nil && alert.Next() {
		alert.Scan(&agentID)
		alert.Close()
	}

	// 1. Tự động tạo Case nếu n8n quyết định đây là sự cố thực sự
	var caseID string
	if payload.Action != "ignore" {
		title := fmt.Sprintf("SOAR Escalated Alert: %s", payload.AlertID)
		desc := fmt.Sprintf("## AI Analysis Reason\n%s\n\n**Confidence**: %.2f\n**Approved By**: %s",
			payload.AIReason, payload.Confidence, payload.HumanApprovedBy)

		newCase, err := s.caseService.CreateCaseFromAlert(payload.AlertID, title, desc, "soar_automation")
		if err == nil {
			caseID = newCase.ID
			// Cập nhật thêm SOAR context vào Case
			s.caseService.db.Model(&models.Case{}).Where("id = ?", caseID).Updates(map[string]interface{}{
				"soar_status":       "completed",
				"ai_reason":         payload.AIReason,
				"human_approved_by": payload.HumanApprovedBy,
				"confidence":        payload.Confidence,
			})
		}
	}

	// 2. Map action từ n8n sang models.AuditAction
	var auditAction models.AuditAction
	switch payload.Action {
	case "kill_process":
		auditAction = models.ActionKillProcess
	case "block_ip":
		auditAction = models.ActionBlockIP
	case "block_url":
		auditAction = models.ActionBlockURL
	case "create_case":
		auditAction = models.ActionCreateCase
	default:
		auditAction = models.ActionLogOnly
	}

	// 3. Ghi Audit Log cho quyết định của n8n
	source := models.AuditSourceAI
	if payload.HumanApprovedBy != "" {
		source = models.AuditSourceHumanHITL
	}

	s.auditService.LogAction(
		"soar_callback_received",
		source,
		auditAction,
		"n8n_soar_engine",
		fmt.Sprintf("n8n decided: %s. Target: %s. Reason: %s", payload.Action, payload.Target, payload.AIReason),
		caseID, payload.AlertID, agentID,
	)

	// Trả về action và target để tầng Handler quyết định gọi ConnectionManager đẩy lệnh xuống Agent
	return auditAction, payload.Target, nil
}
