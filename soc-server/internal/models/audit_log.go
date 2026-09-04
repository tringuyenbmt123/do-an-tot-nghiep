// ==============================================================================
// Package models - GORM Model: AuditLog
// File: internal/models/audit_log.go
// Mô tả: Bảng `audit_logs` ghi lại toàn bộ hành động trong hệ thống SOC.
//         Dùng cho tab Audit Logs trên Frontend, giúp truy vết ai đã làm gì,
//         khi nào, và kết quả ra sao (bao gồm cả hành động tự động từ AI/SOAR).
// ==============================================================================

package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// AuditSource - Enum nguồn gốc hành động
type AuditSource string

const (
	AuditSourceRuleBased AuditSource = "Rule-based"  // Hành động tự động từ Rule Engine
	AuditSourceAI        AuditSource = "AI"          // Hành động từ AI analysis (Ollama)
	AuditSourceHumanHITL AuditSource = "Human-HITL"  // Hành động từ con người qua Telegram
	AuditSourceManual    AuditSource = "Manual"      // Hành động thủ công từ analyst trên UI
	AuditSourceSOAR      AuditSource = "SOAR"        // Hành động từ n8n automation
)

// AuditAction - Enum loại hành động đã thực hiện
type AuditAction string

const (
	ActionBlockIP       AuditAction = "block_ip"       // Chặn địa chỉ IP
	ActionKillProcess   AuditAction = "kill_process"    // Kết thúc tiến trình
	ActionBlockURL      AuditAction = "block_url"       // Chặn URL/Domain
	ActionQuarantineFile AuditAction = "quarantine_file" // Cách ly file
	ActionLogOnly       AuditAction = "log_only"        // Chỉ ghi log, không hành động
	ActionIsolateNetwork AuditAction = "isolate_network" // Cô lập mạng Endpoint
	ActionCreateCase    AuditAction = "create_case"     // Tạo Case từ Alert
	ActionUpdateCase    AuditAction = "update_case"     // Cập nhật Case
	ActionCloseCase     AuditAction = "close_case"      // Đóng Case
)

// AuditLog - GORM model cho bảng `audit_logs`
// Ghi lại mọi hành động quan trọng trong hệ thống SOC
type AuditLog struct {
	// ID - Khóa chính UUID
	ID string `gorm:"size:36;primaryKey" json:"id"`

	// EventType - Loại sự kiện audit (ví dụ: "alert_created", "case_updated",
	// "active_response_sent", "soar_callback_received")
	EventType string `gorm:"type:varchar(100);not null;index" json:"event_type"`

	// Source - Nguồn gốc hành động: Rule-based, AI, Human-HITL, Manual, SOAR
	Source AuditSource `gorm:"type:varchar(50);not null;index" json:"source"`

	// ActionTaken - Hành động cụ thể đã thực hiện
	ActionTaken AuditAction `gorm:"type:varchar(50);not null;index" json:"action_taken"`

	// Confidence - Độ tin cậy của hành động (0.0 - 1.0)
	// AI trả về confidence khi phân tích, Human-HITL mặc định 1.0
	Confidence float64 `gorm:"type:decimal(5,4);default:0" json:"confidence"`

	// Actor - Người/hệ thống thực hiện hành động
	// Ví dụ: "rule_engine", "ollama_ai", "admin@soc.local", "telegram:john_doe"
	Actor string `gorm:"type:varchar(255);not null" json:"actor"`

	// PayloadSummary - Tóm tắt thông tin liên quan dưới dạng JSONB
	// Chứa context: alert_id, case_id, agent_id, target_ip, process_name...
	PayloadSummary string `gorm:"type:json" json:"payload_summary"`

	// RelatedAlertID - ID Alert liên quan (nếu có)
	RelatedAlertID string `gorm:"size:36;index" json:"related_alert_id,omitempty"`

	// RelatedCaseID - ID Case liên quan (nếu có)
	RelatedCaseID string `gorm:"size:36;index" json:"related_case_id,omitempty"`

	// RelatedAgentID - ID Agent liên quan (nếu có)
	RelatedAgentID string `gorm:"size:36;index" json:"related_agent_id,omitempty"`

	// Timestamps
	CreatedAt time.Time `json:"created_at"`
}

// TableName - Chỉ định tên bảng
func (AuditLog) TableName() string {
	return "audit_logs"
}

// BeforeCreate - Tự động sinh UUID
func (a *AuditLog) BeforeCreate(tx *gorm.DB) error {
	if a.ID == "" {
		a.ID = uuid.New().String()
	}
	return nil
}
