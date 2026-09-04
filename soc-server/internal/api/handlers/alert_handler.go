// ==============================================================================
// Package handlers - Alert Handler
// File: internal/api/handlers/alert_handler.go
// Mô tả: Cung cấp REST API cho Dashboard Frontend để truy xuất, lọc và cập nhật Alert.
// ==============================================================================

package handlers

import (
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
func (h *AlertHandler) UpdateAlertStatus(c *gin.Context) {
	id := c.Param("id")
	
	var payload struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ"})
		return
	}

	err := h.alertService.UpdateAlertStatus(id, models.AlertStatus(payload.Status))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Cập nhật thành công"})
}
