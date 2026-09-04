package handlers

import (
	"net/http"
	"strconv"

	"soc-server/internal/models"
	"soc-server/internal/services"

	"github.com/gin-gonic/gin"
)

type CaseHandler struct {
	caseService *services.CaseService
}

func NewCaseHandler(caseService *services.CaseService) *CaseHandler {
	return &CaseHandler{caseService: caseService}
}

func (h *CaseHandler) GetCases(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	
	filters := map[string]string{
		"status":      c.Query("status"),
		"assigned_to": c.Query("assigned_to"),
	}

	cases, total, err := h.caseService.GetAllCases(page, limit, filters)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":  cases,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

func (h *CaseHandler) GetCaseByID(c *gin.Context) {
	id := c.Param("id")
	caseItem, err := h.caseService.GetCaseByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, caseItem)
}

func (h *CaseHandler) UpdateCaseStatus(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Status models.CaseStatus `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ"})
		return
	}

	actor, _ := c.Get("username")
	if actor == nil {
		actor = "api_user" // fallback
	}

	if err := h.caseService.UpdateCaseStatus(id, req.Status, actor.(string)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}
