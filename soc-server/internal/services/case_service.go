// ==============================================================================
// Package services - Case Service
// File: internal/services/case_service.go
// Mô tả: Business logic cho Case management (Incident Response).
//         Thay thế TheHive. Cung cấp CRUD, thay đổi trạng thái, assign analyst.
// ==============================================================================

package services

import (
	"fmt"
	"log"
	"time"

	"soc-server/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// CaseService - Service xử lý business logic cho Cases
type CaseService struct {
	db          *gorm.DB
	auditService *AuditService
}

// NewCaseService - Khởi tạo CaseService
func NewCaseService(db *gorm.DB, auditService *AuditService) *CaseService {
	return &CaseService{
		db:           db,
		auditService: auditService,
	}
}

// GetAllCases - Lấy danh sách cases với phân trang và filter
func (s *CaseService) GetAllCases(page, pageSize int, filters map[string]string) ([]models.Case, int64, error) {
	var cases []models.Case
	var total int64

	query := s.db.Model(&models.Case{})

	// Áp dụng filters
	if status, ok := filters["status"]; ok && status != "" {
		query = query.Where("status = ?", status)
	}
	if assignedTo, ok := filters["assigned_to"]; ok && assignedTo != "" {
		query = query.Where("assigned_to = ?", assignedTo)
	}

	// Đếm tổng số records
	query.Count(&total)

	// Phân trang và sắp xếp
	offset := (page - 1) * pageSize
	err := query.Order("created_at DESC").
		Offset(offset).Limit(pageSize).
		Preload("Alert"). // Preload thông tin Alert gốc
		Find(&cases).Error

	return cases, total, err
}

// GetCaseByID - Lấy case chi tiết theo ID
func (s *CaseService) GetCaseByID(id string) (*models.Case, error) {
	var c models.Case
	err := s.db.Preload("Alert.Agent").First(&c, "id = ?", id).Error
	if err != nil {
		return nil, fmt.Errorf("không tìm thấy Case '%s': %w", id, err)
	}
	return &c, nil
}

// CreateCaseFromAlert - Tạo Case mới từ một Alert
func (s *CaseService) CreateCaseFromAlert(alertID string, title, description string, assignedTo string) (*models.Case, error) {
	// Lấy Alert gốc
	var alert models.Alert
	if err := s.db.First(&alert, "id = ?", alertID).Error; err != nil {
		return nil, fmt.Errorf("không tìm thấy Alert '%s': %w", alertID, err)
	}

	// Chuyển đổi mức độ nghiêm trọng từ string sang int (1-4)
	severityNum := 3 // Medium mặc định
	switch alert.Severity {
	case models.SeverityCritical:
		severityNum = 1
	case models.SeverityHigh:
		severityNum = 2
	case models.SeverityMedium:
		severityNum = 3
	case models.SeverityLow:
		severityNum = 4
	}

	// Tạo Case mới
	newCase := &models.Case{
		ID:          uuid.New().String(),
		AlertID:     alertID,
		Title:       title,
		Description: description,
		SeverityNum: severityNum,
		Status:      models.CaseStatusNew,
		AssignedTo:  assignedTo,
		Tags:        `["escalated"]`,
	}

	// Bọc trong transaction: Tạo Case + Cập nhật Alert status + Ghi Audit Log
	err := s.db.Transaction(func(tx *gorm.DB) error {
		// 1. Lưu Case
		if err := tx.Create(newCase).Error; err != nil {
			return err
		}

		// 2. Cập nhật Alert status thành escalated
		if err := tx.Model(&models.Alert{}).Where("id = ?", alertID).Update("status", models.AlertStatusEscalated).Error; err != nil {
			return err
		}

		// 3. Ghi Audit Log
		auditLog := &models.AuditLog{
			ID:             uuid.New().String(),
			EventType:      "case_created",
			Source:         models.AuditSourceManual,
			ActionTaken:    models.ActionCreateCase,
			Actor:          assignedTo, // Tạm lấy assignedTo làm actor, thực tế lấy từ JWT auth token
			RelatedAlertID: alertID,
			RelatedCaseID:  newCase.ID,
			CreatedAt:      time.Now(),
		}
		if err := tx.Create(auditLog).Error; err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		return nil, fmt.Errorf("lỗi tạo Case: %w", err)
	}

	log.Printf("[CASE SERVICE] Đã tạo Case '%s' từ Alert '%s'", newCase.ID, alertID)
	return newCase, nil
}

// UpdateCaseStatus - Cập nhật trạng thái của Case
func (s *CaseService) UpdateCaseStatus(id string, status models.CaseStatus, actor string) error {
	result := s.db.Model(&models.Case{}).Where("id = ?", id).Update("status", status)
	if result.RowsAffected == 0 {
		return fmt.Errorf("không tìm thấy Case '%s'", id)
	}
	if result.Error != nil {
		return result.Error
	}

	// Ghi Audit Log
	s.auditService.LogAction(
		"case_updated",
		models.AuditSourceManual,
		models.ActionUpdateCase,
		actor,
		fmt.Sprintf("Chuyển trạng thái thành %s", status),
		id, "", "",
	)

	return nil
}
