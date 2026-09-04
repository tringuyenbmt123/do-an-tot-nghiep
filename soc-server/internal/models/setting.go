package models

import (
	"time"
)

// SystemSetting - Lưu trữ cấu hình động của SOC
type SystemSetting struct {
	ID                  string    `gorm:"type:varchar(50);primary_key" json:"id"` // VD: "global_config"
	N8nWebhookURL       string    `gorm:"type:varchar(255)" json:"n8n_webhook_url"`
	AutoResponseEnabled bool      `gorm:"default:false" json:"auto_response_enabled"`
	TelegramHITLEnabled bool      `gorm:"default:true" json:"telegram_hitl_enabled"`
	AIAnalysisEnabled   bool      `gorm:"default:true" json:"ai_analysis_enabled"`
	UpdatedAt           time.Time `json:"updated_at"`
}
