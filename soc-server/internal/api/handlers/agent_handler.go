package handlers

import (
	"net/http"
	"strconv"

	"soc-server/internal/services"

	"github.com/gin-gonic/gin"
)

type AgentHandler struct {
	agentService *services.AgentService
}

func NewAgentHandler(agentService *services.AgentService) *AgentHandler {
	return &AgentHandler{agentService: agentService}
}

func (h *AgentHandler) GetAgents(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	
	status := c.Query("status")

	agents, total, err := h.agentService.GetAllAgents(page, limit, status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":  agents,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

func (h *AgentHandler) KillProcess(c *gin.Context) {
	agentID := c.Param("id")
	var req struct {
		PID int `json:"pid" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Thiếu PID"})
		return
	}

	// Trong thực tế, gọi Active Response qua gRPC/WebSocket xuống Agent
	// Ở đây giả lập thành công
	c.JSON(http.StatusOK, gin.H{
		"success": true, 
		"message": "Đã gửi lệnh Kill Process " + strconv.Itoa(req.PID) + " tới Agent " + agentID,
	})
}

func (h *AgentHandler) BlockIP(c *gin.Context) {
	agentID := c.Param("id")
	var req struct {
		IP string `json:"ip" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Thiếu địa chỉ IP"})
		return
	}

	// Giả lập Active Response
	c.JSON(http.StatusOK, gin.H{
		"success": true, 
		"message": "Đã gửi lệnh Block IP " + req.IP + " tới Agent " + agentID,
	})
}
