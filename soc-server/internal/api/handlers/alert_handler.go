// ==============================================================================
// Package handlers - Alert Handler
// File: internal/api/handlers/alert_handler.go
// Mô tả: Cung cấp REST API cho Dashboard Frontend để truy xuất, lọc và cập nhật Alert.
// ==============================================================================

package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"soc-server/internal/models"
	"soc-server/internal/services"

	"github.com/gin-gonic/gin"
)

// AlertHandler - Handler cho Alert API
type AlertHandler struct {
	alertService *services.AlertService
}

// NewAlertHandler - Khởi tạo
func NewAlertHandler(s *services.AlertService) *AlertHandler {
	return &AlertHandler{alertService: s}
}

// CreateAlert - POST /api/v1/alerts
// Nhận alert từ n8n hoặc một integration bên ngoài và lưu vào SOC App.
func (h *AlertHandler) CreateAlert(c *gin.Context) {
	var request struct {
		AgentID          string                `json:"agent_id" binding:"required"`
		RuleID           string                `json:"rule_id"`
		EventType        models.AlertEventType `json:"event_type" binding:"required"`
		Severity         models.AlertSeverity  `json:"severity" binding:"required"`
		RawPayload       json.RawMessage       `json:"raw_payload"`
		Status           models.AlertStatus    `json:"status"`
		Title            string                `json:"title"`
		Description      string                `json:"description"`
		MITRETactic      string                `json:"mitre_tactic"`
		MITRETechniqueID string                `json:"mitre_technique_id"`
	}

	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu Alert không hợp lệ: " + err.Error()})
		return
	}

	if !isSupportedAlertSeverity(request.Severity) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "severity phải là critical, high, medium hoặc low"})
		return
	}

	rawPayload := string(request.RawPayload)
	if rawPayload == "" || rawPayload == "null" {
		rawPayload = "{}"
	}

	alert := &models.Alert{
		AgentID:          request.AgentID,
		RuleID:           request.RuleID,
		EventType:        request.EventType,
		Severity:         request.Severity,
		RawPayload:       rawPayload,
		Status:           request.Status,
		Title:            request.Title,
		Description:      request.Description,
		MITRETactic:      request.MITRETactic,
		MITRETechniqueID: request.MITRETechniqueID,
	}

	if err := h.alertService.CreateAlert(alert); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không thể tạo Alert: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, alert)
}

func isSupportedAlertSeverity(severity models.AlertSeverity) bool {
	switch severity {
	case models.SeverityCritical, models.SeverityHigh, models.SeverityMedium, models.SeverityLow:
		return true
	default:
		return false
	}
}

// GetAlerts - GET /api/v1/alerts
// Lấy danh sách Alerts có phân trang và filter
func (h *AlertHandler) GetAlerts(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))

	filters := map[string]string{
		"severity":   c.Query("severity"),
		"status":     c.Query("status"),
		"event_type": c.Query("event_type"),
		"agent_id":   c.Query("agent_id"),
	}

	alerts, total, err := h.alertService.GetAllAlerts(page, pageSize, filters)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Lỗi lấy dữ liệu Alert"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":  alerts,
		"total": total,
		"page":  page,
	})
}

// GetAlertStats - GET /api/v1/dashboard/stats
func (h *AlertHandler) GetAlertStats(c *gin.Context) {
	stats, err := h.alertService.GetAlertStats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Lỗi lấy thống kê"})
		return
	}
	c.JSON(http.StatusOK, stats)
}

// UpdateAlertStatus - PATCH /api/v1/alerts/:id/status
// Nhận thêm description và tags để n8n SOAR có thể cập nhật context sau xử lý.
func (h *AlertHandler) UpdateAlertStatus(c *gin.Context) {
	id := c.Param("id")

	var payload struct {
		Status      string   `json:"status" binding:"required"`
		Description string   `json:"description"`   // SOAR có thể gửi kèm kết quả xử lý
		Tags        []string `json:"tags"`           // SOAR labels: ai-decision, auto-blocked...
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ"})
		return
	}

	err := h.alertService.UpdateAlertStatusWithContext(id, models.AlertStatus(payload.Status), payload.Description, payload.Tags)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Cập nhật thành công"})
}
