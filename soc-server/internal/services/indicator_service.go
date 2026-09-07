// ==============================================================================
// Package services - Indicator Service (IOCs)
// File: internal/services/indicator_service.go
// Mô tả: Business logic cho Indicator (IOC) management. Thay thế MISP.
// ==============================================================================

package services

import (
	"time"

	"soc-server/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// DefaultIndicators returns a few starter IOC samples so the SOC dashboard is populated immediately.
func DefaultIndicators() []models.Indicator {
	return []models.Indicator{
		{
			ID:          uuid.New().String(),
			Type:        models.IOCType("ip-src"),
			Value:       "185.220.101.182",
			Category:    "c2_server",
			Source:      "osint",
			MITRETactic: "Command and Control",
			RiskScore:   88,
			Description: "Known malicious IP used in phishing and command-and-control activity.",
			IsActive:    true,
		},
		{
			ID:          uuid.New().String(),
			Type:        models.IOCType("domain"),
			Value:       "login-secure-update.com",
			Category:    "phishing",
			Source:      "analyst",
			MITRETactic: "Phishing",
			RiskScore:   91,
			Description: "Phishing domain used in credential harvesting campaigns.",
			IsActive:    true,
		},
		{
			ID:          uuid.New().String(),
			Type:        models.IOCType("sha256"),
			Value:       "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
			Category:    "malware",
			Source:      "internal",
			MITRETactic: "Execution",
			RiskScore:   94,
			Description: "Known malicious payload hash observed in test environment.",
			IsActive:    true,
		},
	}
}

// IndicatorService - Service xử lý business logic cho IOCs
type IndicatorService struct {
	db *gorm.DB
}

// NewIndicatorService - Khởi tạo IndicatorService
func NewIndicatorService(db *gorm.DB) *IndicatorService {
	return &IndicatorService{db: db}
}

// GetAllIndicators - Lấy danh sách IOCs
func (s *IndicatorService) GetAllIndicators(page, pageSize int, iocType string) ([]models.Indicator, int64, error) {
	var indicators []models.Indicator
	var total int64

	query := s.db.Model(&models.Indicator{})
	if iocType != "" {
		query = query.Where("type = ?", iocType)
	}

	query.Count(&total)

	offset := (page - 1) * pageSize
	err := query.Order("created_at DESC").
		Offset(offset).Limit(pageSize).
		Find(&indicators).Error

	return indicators, total, err
}

// SearchIndicatorsCompat performs the value/type lookup used by the legacy
// MISP-shaped n8n node, but searches the SOC App indicators table.
func (s *IndicatorService) SearchIndicatorsCompat(iocType, value string, limit int) ([]models.Indicator, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 1000 {
		limit = 1000
	}

	query := s.db.Model(&models.Indicator{}).Where("is_active = ?", true)
	if iocType != "" {
		query = query.Where("type = ?", iocType)
	}
	if value != "" {
		query = query.Where("value = ?", value)
	}

	var indicators []models.Indicator
	err := query.Order("created_at DESC").Limit(limit).Find(&indicators).Error
	return indicators, err
}

// CreateIndicator - Thêm IOC mới
func (s *IndicatorService) CreateIndicator(indicator *models.Indicator) error {
	indicator.ID = uuid.New().String()
	if indicator.RiskScore == 0 {
		indicator.RiskScore = 50
	}
	return s.db.Create(indicator).Error
}

func (s *IndicatorService) UpdateIndicator(id string, indicator *models.Indicator) error {
	if indicator == nil {
		return nil
	}
	if indicator.ID == "" {
		indicator.ID = id
	}
	result := s.db.Model(&models.Indicator{}).Where("id = ?", id).Updates(map[string]interface{}{
		"type":               indicator.Type,
		"value":              indicator.Value,
		"category":           indicator.Category,
		"source":             indicator.Source,
		"mitre_tactic":       indicator.MITRETactic,
		"mitre_technique_id": indicator.MITRETechniqueID,
		"risk_score":         indicator.RiskScore,
		"description":        indicator.Description,
		"is_active":          indicator.IsActive,
	})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (s *IndicatorService) DeleteIndicator(id string) error {
	result := s.db.Where("id = ?", id).Delete(&models.Indicator{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// SearchIndicatorValue - Tra cứu nhanh xem 1 giá trị (IP/Hash) có phải là IOC không
func (s *IndicatorService) SearchIndicatorValue(value string) (*models.Indicator, bool) {
	var indicator models.Indicator
	err := s.db.Where("value = ? AND is_active = ?", value, true).First(&indicator).Error
	if err != nil {
		return nil, false // Không tìm thấy hoặc đã lỗi/hết hạn
	}

	// Kiểm tra xem đã hết hạn chưa (nếu có set expires_at)
	if indicator.ExpiresAt != nil && time.Now().After(*indicator.ExpiresAt) {
		// Tự động disable nếu hết hạn
		s.db.Model(&indicator).Update("is_active", false)
		return nil, false
	}

	return &indicator, true
}
