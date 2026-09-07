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

// SearchMISPCompat - POST /api/v1/indicators/restSearch
// Giữ contract request/response cũ của MISP nhưng chỉ đọc dữ liệu SOC App.
func (h *IndicatorHandler) SearchMISPCompat(c *gin.Context) {
	var request struct {
		ReturnFormat string `json:"returnFormat"`
		Limit        int    `json:"limit"`
		Type         string `json:"type"`
		Value        string `json:"value"`
		Tag          string `json:"tag"`
		Timestamp    string `json:"timestamp"`
	}

	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu tìm Indicator không hợp lệ: " + err.Error()})
		return
	}

	indicators, err := h.indicatorService.SearchIndicatorsCompat(request.Type, request.Value, request.Limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	attributes := make([]gin.H, 0, len(indicators))
	for _, indicator := range indicators {
		attributes = append(attributes, gin.H{
			"id":         indicator.ID,
			"type":       indicator.Type,
			"category":   indicator.Category,
			"value":      indicator.Value,
			"comment":    indicator.Description,
			"to_ids":     indicator.IsActive,
			"risk_score": indicator.RiskScore,
			"source":     indicator.Source,
			"tag":        request.Tag,
		})
	}

	response := make([]gin.H, 0, len(indicators))
	if len(indicators) > 0 {
		for _, indicator := range indicators {
			response = append(response, gin.H{
				"Event": gin.H{
					"id":        indicator.ID,
					"uuid":      indicator.ID,
					"info":      indicator.Description,
					"timestamp": indicator.CreatedAt.Unix(),
					"Attribute": attributes,
				},
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"response": response,
		"meta": gin.H{
			"source":    "soc-app-indicators",
			"type":      request.Type,
			"value":     request.Value,
			"timestamp": request.Timestamp,
		},
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
