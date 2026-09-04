// ==============================================================================
// Package services - Audit Service
// File: internal/services/audit_service.go
// Mô tả: Service chuyên trách ghi log Audit cho toàn bộ hệ thống.
//         Ghi lại mọi hành động (tạo alert, update case, AI phân tích, lệnh mTLS).
// ==============================================================================

package services

import (
	"log"
	"time"

	"soc-server/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// AuditService - Service xử lý business logic cho Audit Logs
type AuditService struct {
	db *gorm.DB
}

// NewAuditService - Khởi tạo AuditService
func NewAuditService(db *gorm.DB) *AuditService {
	return &AuditService{db: db}
}

// LogAction - Ghi nhận một hành động vào bảng audit_logs
// Helper function để các service khác gọi cho tiện
func (s *AuditService) LogAction(
	eventType string,
	source models.AuditSource,
	action models.AuditAction,
	actor string,
	payloadSummary string,
	caseID string,
	alertID string,
	agentID string,
) error {
	auditLog := &models.AuditLog{
		ID:             uuid.New().String(),
		EventType:      eventType,
		Source:         source,
		ActionTaken:    action,
		Actor:          actor,
		PayloadSummary: payloadSummary,
		RelatedCaseID:  caseID,
		RelatedAlertID: alertID,
		RelatedAgentID: agentID,
		CreatedAt:      time.Now(),
	}

	if err := s.db.Create(auditLog).Error; err != nil {
		log.Printf("[AUDIT SERVICE] ❌ Lỗi ghi audit log: %v", err)
		return err
	}

	return nil
}

// GetAuditLogs - Lấy danh sách audit logs với phân trang và filter
func (s *AuditService) GetAuditLogs(page, pageSize int, source, action string) ([]models.AuditLog, int64, error) {
	var logs []models.AuditLog
	var total int64

	query := s.db.Model(&models.AuditLog{})

	if source != "" {
		query = query.Where("source = ?", source)
	}
	if action != "" {
		query = query.Where("action_taken = ?", action)
	}

	query.Count(&total)

	offset := (page - 1) * pageSize
	err := query.Order("created_at DESC").
		Offset(offset).Limit(pageSize).
		Find(&logs).Error

	return logs, total, err
}
