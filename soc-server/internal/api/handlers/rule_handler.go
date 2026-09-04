package handlers

import (
	"net/http"
	"strconv"

	"soc-server/internal/models"
	"soc-server/internal/services"

	"github.com/gin-gonic/gin"
)

type RuleHandler struct {
	ruleService *services.RuleService
}

func NewRuleHandler(ruleService *services.RuleService) *RuleHandler {
	return &RuleHandler{ruleService: ruleService}
}

func (h *RuleHandler) GetRules(c *gin.Context) {
	rules, err := h.ruleService.GetAllRules()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rules})
}

func (h *RuleHandler) CreateRule(c *gin.Context) {
	var req models.Rule
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu rule không hợp lệ"})
		return
	}
	if req.ID == "" {
		req.ID = "RULE-" + strconv.FormatInt(int64(len(req.Name)+1), 10)
	}
	if req.Severity == "" {
		req.Severity = "medium"
	}
	if req.EventType == "" {
		req.EventType = "custom_event"
	}
	if err := h.ruleService.CreateRule(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, req)
}

func (h *RuleHandler) UpdateRule(c *gin.Context) {
	id := c.Param("id")
	var req models.Rule
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu rule không hợp lệ"})
		return
	}
	if req.ID == "" {
		req.ID = id
	}
	if err := h.ruleService.UpdateRule(id, &req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Cập nhật rule thành công"})
}

func (h *RuleHandler) ToggleRule(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		IsActive bool `json:"is_active"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ"})
		return
	}
	if err := h.ruleService.ToggleRule(id, req.IsActive); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Cập nhật trạng thái rule thành công"})
}

func (h *RuleHandler) DeleteRule(c *gin.Context) {
	id := c.Param("id")
	if err := h.ruleService.DeleteRule(id); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Xóa rule thành công"})
}
