package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

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

type RuleRequest struct {
	ID               string      `json:"id"`
	Name             string      `json:"name"`
	Severity         string      `json:"severity"`
	EventType        string      `json:"event_type"`
	Conditions       interface{} `json:"conditions"`
	MITRETactic      string      `json:"mitre_tactic"`
	MITRETechniqueID string      `json:"mitre_technique_id"`
	Description      string      `json:"description"`
	IsActive         *bool       `json:"is_active"`
	Source           string      `json:"source"`
}

func parseRuleRequest(req *RuleRequest) (*models.Rule, error) {
	rule := &models.Rule{
		ID:               req.ID,
		Name:             req.Name,
		Severity:         req.Severity,
		EventType:        req.EventType,
		MITRETactic:      req.MITRETactic,
		MITRETechniqueID: req.MITRETechniqueID,
		Description:      req.Description,
		Source:           req.Source,
	}

	if req.IsActive != nil {
		rule.IsActive = *req.IsActive
	} else {
		rule.IsActive = true
	}

	switch v := req.Conditions.(type) {
	case string:
		rule.Conditions = v
	default:
		condBytes, err := json.Marshal(v)
		if err != nil {
			return nil, err
		}
		rule.Conditions = string(condBytes)
	}

	return rule, nil
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
	var req RuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu rule không hợp lệ: " + err.Error()})
		return
	}

	rule, err := parseRuleRequest(&req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Lỗi parse conditions: " + err.Error()})
		return
	}

	if rule.ID == "" {
		rule.ID = "RULE-" + strconv.FormatInt(time.Now().UnixNano(), 10)
	}
	if rule.Severity == "" {
		rule.Severity = "medium"
	}
	if rule.EventType == "" {
		rule.EventType = "custom_event"
	}

	if err := h.ruleService.CreateRule(rule); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, rule)
}

func (h *RuleHandler) UpdateRule(c *gin.Context) {
	id := c.Param("id")
	var req RuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu rule không hợp lệ: " + err.Error()})
		return
	}

	rule, err := parseRuleRequest(&req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Lỗi parse conditions: " + err.Error()})
		return
	}

	rule.ID = id
	if err := h.ruleService.UpdateRule(id, rule); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Cập nhật rule thành công", "data": rule})
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
