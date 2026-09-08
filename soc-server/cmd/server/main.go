// ==============================================================================
// Command: SOC Server Entry Point
// File: cmd/server/main.go
// Mô tả: Khởi tạo tất cả dependencies (DB, Redis, Rule Engine, Services, Handlers).
//         Khởi chạy đồng thời gRPC Server (mTLS) và REST/WebSocket Server.
//         Xử lý graceful shutdown khi nhận tín hiệu từ OS (SIGINT/SIGTERM).
// ==============================================================================

package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"

	"soc-server/internal/agent_grpc"
	"soc-server/internal/api"
	"soc-server/internal/api/handlers"
	"soc-server/internal/api/websocket"
	"soc-server/internal/config"
	pb "soc-server/internal/generated/proto"
	"soc-server/internal/models"
	"soc-server/internal/rules"
	"soc-server/internal/services"
	"soc-server/pkg/database"
)

func main() {
	log.Println("==================================================")
	log.Println("🛡️  Khởi động SOC/EDR All-in-One Backend Server 🛡️")
	log.Println("==================================================")

	// 1. Tải cấu hình
	cfg, err := config.LoadConfig("configs/config.yaml")
	if err != nil {
		log.Fatalf("❌ Lỗi cấu hình: %v", err)
	}

	// 2. Khởi tạo Database (MySQL)
	db, err := database.InitMySQL(&cfg.Database)
	if err != nil {
		log.Fatalf("❌ Lỗi Database: %v", err)
	}

	// 3. Thực hiện AutoMigrate các bảng
	err = database.AutoMigrateAll(db,
		&models.User{},
		&models.SystemSetting{},
		&models.Agent{},
		&models.Alert{},
		&models.Case{},
		&models.Indicator{},
		&models.Rule{},
		&models.AuditLog{},
	)
	if err != nil {
		log.Fatalf("❌ Lỗi AutoMigrate: %v", err)
	}

	// 4. Khởi tạo Redis (cho trạng thái Agent)
	redisClient, err := database.InitRedis(&cfg.Redis)
	if err != nil {
		log.Fatalf("❌ Lỗi Redis: %v", err)
	}
	defer redisClient.Close()

	// 5. Khởi tạo WebSocket Hub
	wsHub := websocket.NewHub()
	go wsHub.Run() // Chạy Hub trong background

	// 6. Khởi tạo Detection Rule Engine
	ruleEngine, err := rules.NewRuleEngine(db, cfg.Rules.YAMLDir, cfg.Rules.LoadFromDB)
	if err != nil {
		log.Fatalf("❌ Lỗi Rule Engine: %v", err)
	}

	// 7. Khởi tạo Services Layer
	jwtSecret := []byte(os.Getenv("JWT_SECRET"))
	if len(jwtSecret) == 0 {
		jwtSecret = []byte("super-secret-soc-key-2026")
	}

	authService := services.NewAuthService(db, jwtSecret)
	settingService := services.NewSettingService(db)
	auditService := services.NewAuditService(db)
	alertService := services.NewAlertService(db, redisClient)
	agentService := services.NewAgentService(db, redisClient)
	indicatorService := services.NewIndicatorService(db)
	ruleService := services.NewRuleService(db, ruleEngine)
	caseService := services.NewCaseService(db, auditService)
	soarService := services.NewSOARService(&cfg.SOAR, caseService, auditService)

	// 9. Seed default SOC rules from YAML files into Database if not present
	yamlRules, err := rules.LoadRulesFromYAML(cfg.Rules.YAMLDir)
	if err == nil && len(yamlRules) > 0 {
		seededCount := 0
		for _, yr := range yamlRules {
			var exists int64
			db.Model(&models.Rule{}).Where("id = ?", yr.ID).Count(&exists)
			if exists == 0 {
				condBytes, _ := json.Marshal(yr.Conditions)
				dbRule := models.Rule{
					ID:               yr.ID,
					Name:             yr.Name,
					Severity:         yr.Severity,
					EventType:        yr.EventType,
					Conditions:       string(condBytes),
					MITRETactic:      yr.MITRETactic,
					MITRETechniqueID: yr.MITRETechniqueID,
					Description:      yr.Description,
					IsActive:         yr.IsActive,
					Source:           "database",
				}
				if err := db.Create(&dbRule).Error; err == nil {
					seededCount++
				}
			}
		}
		if seededCount > 0 {
			log.Printf("[SEED] ✅ Đã nạp tự động %d rule mẫu từ YAML vào Database", seededCount)
		}
	}

	var ruleCount int64
	if err := db.Model(&models.Rule{}).Count(&ruleCount).Error; err == nil && ruleCount == 0 {
		seedRules := services.DefaultRules()
		for i := range seedRules {
			if err := db.Create(&seedRules[i]).Error; err != nil {
				log.Printf("[SEED] Không thể tạo rule mặc định %s: %v", seedRules[i].ID, err)
			}
		}
		log.Printf("[SEED] Đã tạo %d rule mặc định cho SOC dashboard", len(seedRules))
	}

	// Reload Rule Engine from DB
	ruleEngine.ReloadRules()

	var indicatorCount int64
	if err := db.Model(&models.Indicator{}).Count(&indicatorCount).Error; err == nil && indicatorCount == 0 {
		seedIndicators := services.DefaultIndicators()
		for i := range seedIndicators {
			if err := db.Create(&seedIndicators[i]).Error; err != nil {
				log.Printf("[SEED] Không thể tạo IOC mặc định %s: %v", seedIndicators[i].ID, err)
			}
		}
		log.Printf("[SEED] Đã tạo %d IOC mặc định cho SOC dashboard", len(seedIndicators))
	}

	var agentCount int64
	if err := db.Model(&models.Agent{}).Count(&agentCount).Error; err == nil && agentCount == 0 {
		seedAgents := services.DefaultAgents()
		for i := range seedAgents {
			if err := db.Create(&seedAgents[i]).Error; err != nil {
				log.Printf("[SEED] Không thể tạo agent mặc định %s: %v", seedAgents[i].ID, err)
			}
		}
		log.Printf("[SEED] Đã tạo %d agent mặc định cho SOC dashboard", len(seedAgents))
	}

	var alertCount int64
	if err := db.Model(&models.Alert{}).Count(&alertCount).Error; err == nil && alertCount == 0 {
		seedAlerts := services.DefaultAlerts()
		for i := range seedAlerts {
			if err := db.Create(&seedAlerts[i]).Error; err != nil {
				log.Printf("[SEED] Không thể tạo alert mặc định %s: %v", seedAlerts[i].ID, err)
			}
		}
		log.Printf("[SEED] Đã tạo %d alert mặc định cho SOC dashboard", len(seedAlerts))
	}

	// 10. Khởi tạo gRPC Connection Manager
	connManager := agent_grpc.NewConnectionManager()

	// 9. Khởi tạo gRPC Server & Handler
	grpcServer, err := agent_grpc.NewGRPCServer(cfg)
	if err != nil {
		log.Fatalf("❌ Lỗi tạo gRPC Server: %v", err)
	}

	// Hàm callback: khi có Alert mới từ gRPC → Broadcast WS + Gửi n8n
	onNewAlert := func(alert *models.Alert) {
		wsHub.BroadcastAlert(alert)
		soarService.DispatchToN8N(alert)
	}

	grpcHandler := agent_grpc.NewAgentServiceHandler(
		db,
		redisClient,
		ruleEngine,
		connManager,
		onNewAlert,
	)
	pb.RegisterAgentServiceServer(grpcServer.GetServer(), grpcHandler)

	// 10. Khởi tạo REST API Handlers & Router
	authHandler := handlers.NewAuthHandler(authService)
	alertHandler := handlers.NewAlertHandler(alertService, caseService, soarService)
	soarHandler := handlers.NewSOARHandler(soarService, connManager, alertService, cfg.SOAR.CallbackSecret)
	caseHandler := handlers.NewCaseHandler(caseService)
	agentHandler := handlers.NewAgentHandler(agentService)
	indicatorHandler := handlers.NewIndicatorHandler(indicatorService)
	ruleHandler := handlers.NewRuleHandler(ruleService)
	auditHandler := handlers.NewAuditHandler(auditService)
	settingHandler := handlers.NewSettingHandler(settingService)

	router := api.SetupRouter(
		authHandler,
		alertHandler,
		soarHandler,
		caseHandler,
		agentHandler,
		indicatorHandler,
		ruleHandler,
		auditHandler,
		settingHandler,
		wsHub,
	)

	httpServer := &http.Server{
		Addr:    ":" + strconv.Itoa(cfg.Server.RESTPort),
		Handler: router,
	}

	// 11. Bật goroutine chạy gRPC Server
	go func() {
		if err := grpcServer.Start(); err != nil {
			log.Fatalf("❌ gRPC Server ngưng hoạt động: %v", err)
		}
	}()

	// Khởi động Alert Cleanup Job (xóa LOW alerts cũ sau N ngày)
	go alertService.StartAlertCleanupJob(context.Background(), cfg.Alert.RetentionDays)

	// 12. Bật goroutine chạy REST API Server
	go func() {
		log.Printf("[REST API] 🚀 Server đang lắng nghe trên port :%d", cfg.Server.RESTPort)
		httpServer.Addr = ":8080"
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("❌ REST API Server ngưng hoạt động: %v", err)
		}
	}()

	// 13. Lắng nghe tín hiệu Shutdown (Graceful Shutdown)
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("\n🛑 Nhận tín hiệu tắt Server. Đang tiến hành dọn dẹp...")
	grpcServer.GracefulStop()
	if err := httpServer.Close(); err != nil {
		log.Printf("⚠️ Lỗi đóng HTTP server: %v", err)
	}
	log.Println("✅ Đã dọn dẹp xong. Bye!")
}
