// ==============================================================================
// Package models - GORM Model: Alert
// File: internal/models/alert.go
// Mô tả: Bảng `alerts` lưu các cảnh báo bảo mật được sinh ra bởi Rule Engine
//         khi phát hiện log/event khớp với Detection Rule.
// ==============================================================================

package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// AlertEventType - Enum loại sự kiện Alert
type AlertEventType string

const (
	EventDDoSDetected    AlertEventType = "ddos_detected"     // Phát hiện tấn công DDoS
	EventPhishingDetected AlertEventType = "phishing_detected" // Phát hiện email/URL phishing
	EventWazuhAlert      AlertEventType = "wazuh_alert"       // Alert từ Wazuh integration
	EventMalwareEDR      AlertEventType = "malware_edr"       // Phát hiện malware bởi EDR
	EventSuspiciousProcess AlertEventType = "suspicious_process" // Tiến trình đáng ngờ
	EventNetworkAnomaly  AlertEventType = "network_anomaly"   // Bất thường mạng
	EventFileIntegrity   AlertEventType = "file_integrity"    // Thay đổi file hệ thống
)

// AlertSeverity - Enum mức độ nghiêm trọng của Alert
type AlertSeverity string

const (
	SeverityCritical AlertSeverity = "critical" // Mức 1: Nghiêm trọng nhất
	SeverityHigh     AlertSeverity = "high"     // Mức 2: Cao
	SeverityMedium   AlertSeverity = "medium"   // Mức 3: Trung bình
	SeverityLow      AlertSeverity = "low"      // Mức 4: Thấp
)

// AlertStatus - Enum trạng thái xử lý Alert
type AlertStatus string

const (
	AlertStatusNew        AlertStatus = "new"         // Mới sinh ra, chưa ai xem
	AlertStatusInProgress AlertStatus = "in_progress" // Đang được phân tích
	AlertStatusResolved   AlertStatus = "resolved"    // Đã xử lý xong
	AlertStatusFalsePositive AlertStatus = "false_positive" // Báo nhầm (False Positive)
	AlertStatusEscalated  AlertStatus = "escalated"   // Đã nâng cấp lên Case
)

// Alert - GORM model cho bảng `alerts`
// Mỗi Alert đại diện cho một cảnh báo bảo mật được Detection Engine phát hiện
type Alert struct {
	// ID - Khóa chính UUID
	ID string `gorm:"size:36;primaryKey" json:"id"`

	// AgentID - FK liên kết tới Agent đã gửi event gây ra Alert
	AgentID string `gorm:"size:36;index;not null" json:"agent_id"`

	// RuleID - ID của Detection Rule đã match (liên kết tới bảng rules)
	RuleID string `gorm:"type:varchar(100);index" json:"rule_id"`

	// EventType - Loại sự kiện: ddos_detected, phishing_detected, malware_edr...
	EventType AlertEventType `gorm:"type:varchar(50);not null;index" json:"event_type"`

	// Severity - Mức độ nghiêm trọng: critical, high, medium, low
	Severity AlertSeverity `gorm:"type:varchar(20);not null;index" json:"severity"`

	// RawPayload - Dữ liệu log gốc dạng JSONB (Sysmon event đầy đủ)
	// Lưu trữ nguyên vẹn để analyst có thể xem chi tiết khi điều tra
	RawPayload string `gorm:"type:json" json:"raw_payload"`

	// Status - Trạng thái xử lý Alert hiện tại
	Status AlertStatus `gorm:"type:varchar(30);default:'new';index" json:"status"`

	// Title - Tiêu đề ngắn gọn mô tả Alert (sinh tự động từ Rule name)
	Title string `gorm:"type:varchar(500)" json:"title"`

	// Description - Mô tả chi tiết Alert
	Description string `gorm:"type:text" json:"description"`

	// MITRETactic - MITRE ATT&CK Tactic (ví dụ: "Execution", "Defense Evasion")
	MITRETactic string `gorm:"type:varchar(100)" json:"mitre_tactic"`

	// MITRETechniqueID - MITRE ATT&CK Technique ID (ví dụ: "T1059.001")
	MITRETechniqueID string `gorm:"type:varchar(20)" json:"mitre_technique_id"`

	// Timestamps
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`

	// Relations - Quan hệ với bảng agents (GORM preload)
	Agent *Agent `gorm:"foreignKey:AgentID" json:"agent,omitempty"`
}

// TableName - Chỉ định tên bảng
func (Alert) TableName() string {
	return "alerts"
}

// BeforeCreate - Tự động sinh UUID
func (a *Alert) BeforeCreate(tx *gorm.DB) error {
	if a.ID == "" {
		a.ID = uuid.New().String()
	}
	if a.Status == "" {
		a.Status = AlertStatusNew
	}
	return nil
}
