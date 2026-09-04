package services

import (
	"soc-server/internal/models"

	"gorm.io/gorm"
)

type SettingService struct {
	db *gorm.DB
}

func NewSettingService(db *gorm.DB) *SettingService {
	return &SettingService{db: db}
}

// GetGlobalSettings - Lấy cấu hình chung
func (s *SettingService) GetGlobalSettings() (*models.SystemSetting, error) {
	var setting models.SystemSetting
	err := s.db.FirstOrCreate(&setting, models.SystemSetting{
		ID:                  "global_config",
		N8nWebhookURL:       "http://localhost:5678/webhook/soc-callback",
		AutoResponseEnabled: false,
		TelegramHITLEnabled: true,
		AIAnalysisEnabled:   true,
	}).Error

	return &setting, err
}

// UpdateGlobalSettings - Cập nhật cấu hình
func (s *SettingService) UpdateGlobalSettings(newSettings *models.SystemSetting) error {
	newSettings.ID = "global_config" // Ép cứng ID
	return s.db.Save(newSettings).Error
}
