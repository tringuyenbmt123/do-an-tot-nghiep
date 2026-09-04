// ==============================================================================
// Package api - REST Router
// File: internal/api/router.go
// Mô tả: Cấu hình Gin Router, đăng ký Middleware, WebSocket, và API endpoints.
// ==============================================================================

package api

import (
	"github.com/gin-gonic/gin"

	"soc-server/internal/api/handlers"
	"soc-server/internal/api/websocket"
)

// SetupRouter - Khởi tạo và cấu hình các route cho HTTP server
func SetupRouter(
	authHandler *handlers.AuthHandler,
	alertHandler *handlers.AlertHandler,
	soarHandler *handlers.SOARHandler,
	caseHandler *handlers.CaseHandler,
	agentHandler *handlers.AgentHandler,
	indicatorHandler *handlers.IndicatorHandler,
	ruleHandler *handlers.RuleHandler,
	auditHandler *handlers.AuditHandler,
	settingHandler *handlers.SettingHandler,
	wsHub *websocket.Hub,
) *gin.Engine {

	// Khởi tạo Gin với chế độ Release nếu cần
	// gin.SetMode(gin.ReleaseMode)

	router := gin.New()

	// 1. Đăng ký Middleware toàn cục
	router.Use(gin.Recovery())
	router.Use(RequestLogger())
	router.Use(CORSMiddleware())

	// 2. Health check / Ping endpoint
	router.GET("/api/v1/ping", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "message": "SOC Server is running"})
	})

	// 3. WebSocket Endpoint
	// Frontend kết nối vào đây: ws://localhost:8080/ws/alerts
	router.GET("/ws/alerts", func(c *gin.Context) {
		wsHub.HandleWebSocket(c.Writer, c.Request)
	})

	// 4. API Group v1
	v1 := router.Group("/api/v1")
	{
		// Public Routes (Không cần Token)
		v1.POST("/auth/login", authHandler.Login)
		v1.POST("/soar/callback", soarHandler.HandleN8NCallback)

		// ----------------------------------------------------
		// 🔒 PROTECTED ROUTES (Yêu cầu JWT Token hợp lệ)
		// ----------------------------------------------------
		protected := v1.Group("")
		protected.Use(AuthMiddleware())
		{
			// Dashboard Stats
			protected.GET("/dashboard/stats", alertHandler.GetAlertStats)

			// Alerts CRUD
			alerts := protected.Group("/alerts")
			{
				alerts.GET("", alertHandler.GetAlerts)
				alerts.PATCH("/:id/status", alertHandler.UpdateAlertStatus)
			}

			// Cases CRUD
			cases := protected.Group("/cases")
			{
				cases.GET("", caseHandler.GetCases)
				cases.GET("/:id", caseHandler.GetCaseByID)
				cases.PATCH("/:id/status", caseHandler.UpdateCaseStatus)
			}

			// Agents CRUD
			agents := protected.Group("/agents")
			{
				agents.GET("", agentHandler.GetAgents)
				agents.POST("/:id/response/kill-process", agentHandler.KillProcess)
				agents.POST("/:id/response/block-ip", agentHandler.BlockIP)
			}

			// Indicators CRUD (blacklist / IOCs)
			indicators := protected.Group("/indicators")
			{
				indicators.GET("", indicatorHandler.GetIndicators)
				indicators.POST("", indicatorHandler.CreateIndicator)
				indicators.PUT("/:id", indicatorHandler.UpdateIndicator)
				indicators.DELETE("/:id", indicatorHandler.DeleteIndicator)
				indicators.POST("/analyze", indicatorHandler.AnalyzeIOC)
			}

			// Audit Logs
			protected.GET("/audit-logs", auditHandler.GetAuditLogs)

			// Rules management (custom SOC detection rules)
			rules := protected.Group("/rules")
			{
				rules.GET("", ruleHandler.GetRules)
				rules.POST("", ruleHandler.CreateRule)
				rules.PUT("/:id", ruleHandler.UpdateRule)
				rules.PATCH("/:id/toggle", ruleHandler.ToggleRule)
				rules.DELETE("/:id", ruleHandler.DeleteRule)
			}

			// Settings
			settings := protected.Group("/settings")
			{
				settings.GET("", settingHandler.GetSettings)
				settings.PUT("", settingHandler.SaveSettings)
			}
		}
	}

	return router
}
