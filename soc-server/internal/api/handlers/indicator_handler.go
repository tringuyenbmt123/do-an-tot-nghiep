package handlers

import (
	"net/http"
	"strconv"
	"time"

	"soc-server/internal/models"
	"soc-server/internal/services"

	"github.com/gin-gonic/gin"
)

type IndicatorHandler struct {
	indicatorService *services.IndicatorService
}

func NewIndicatorHandler(indicatorService *services.IndicatorService) *IndicatorHandler {
	return &IndicatorHandler{indicatorService: indicatorService}
}

func (h *IndicatorHandler) GetIndicators(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))

	iocType := c.Query("type")

	indicators, total, err := h.indicatorService.GetAllIndicators(page, limit, iocType)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":  indicators,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

func (h *IndicatorHandler) CreateIndicator(c *gin.Context) {
	var ioc models.Indicator
	if err := c.ShouldBindJSON(&ioc); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ"})
		return
	}

	err := h.indicatorService.CreateIndicator(&ioc)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, ioc)
}

func (h *IndicatorHandler) UpdateIndicator(c *gin.Context) {
	id := c.Param("id")
	var ioc models.Indicator
	if err := c.ShouldBindJSON(&ioc); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ"})
		return
	}
	if err := h.indicatorService.UpdateIndicator(id, &ioc); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Cập nhật blacklist thành công"})
}

func (h *IndicatorHandler) DeleteIndicator(c *gin.Context) {
	id := c.Param("id")
	if err := h.indicatorService.DeleteIndicator(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Xóa blacklist thành công"})
}

func (h *IndicatorHandler) AnalyzeIOC(c *gin.Context) {
	var req struct {
		Type  string `json:"type" binding:"required"`
		Value string `json:"value" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ"})
		return
	}

	// Fake Cortex Analyzer response
	result := gin.H{
		"analyzer":        "Cortex_VirusTotal",
		"type":            req.Type,
		"value":           req.Value,
		"verdict":         "malicious",
		"risk_score":      85,
		"detections":      14,
		"total_engines":   72,
		"tags":            []string{"c2", "malware"},
		"community_score": -50,
		"last_analysis":   time.Now(),
		"details": gin.H{
			"country": "UNKNOWN",
		},
	}

	c.JSON(http.StatusOK, result)
}
