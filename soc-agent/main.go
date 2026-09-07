// ==============================================================================
// SOC/EDR All-in-One - Endpoint Agent
// File: main.go
// Mô tả: Endpoint Detection & Response (EDR) Agent viết bằng Golang:
//         - Footprint cực nhẹ (CPU < 1%, RAM < 20MB)
//         - gRPC Bidirectional Streaming (StreamEvents) + Heartbeat
//         - Real-time System Metrics Collector (1s Ticker)
//         - Event-Driven Log Tailer (fsnotify)
//         - Active Response Command Execution (Kill Process, Block IP, Forensic)
//         - Memory Buffer với Backpressure Policy
//         - Hỗ trợ chạy dưới dạng Windows Service tự động cùng hệ thống
// ==============================================================================

package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"sync"
	"syscall"

	"soc-agent/collector"
	"soc-agent/config"
	"soc-agent/executor"
	"soc-agent/fim"
	"soc-agent/monitor"
	"soc-agent/streamer"
	"soc-agent/tailer"
)

const banner = `
==============================================================================
   ____ ___   ____     _                    _   
  / ___/ _ \ / ___|   / \   __ _  ___ _ __ | |_ 
  \___ \ | | | |     / _ \ / _` + "`" + ` |/ _ \ '_ \| __|
   ___) | |_| | |___ / ___ \ (_| |  __/ | | | |_ 
  |____/\___/ \____/_/   \_\__, |\___|_| |_|\__|
                           |___/                
  Unified SOC/EDR Endpoint Detection & Response Agent
==============================================================================
`

func main() {
	configPath := flag.String("config", "config.json", "Đường dẫn tới file config.json")
	serviceCmd := flag.String("service", "", "Quản lý Windows Service: install | uninstall | start | stop")
	flag.Parse()

	// Luôn đổi CWD về thư mục chứa file .exe để đọc đúng config.json và ghi agent.log
	if exePath, err := os.Executable(); err == nil {
		_ = os.Chdir(filepath.Dir(exePath))
	}

	// Cấu hình ghi log ra file agent.log song song với Console
	logFile, err := os.OpenFile("agent.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err == nil {
		defer logFile.Close()
		log.SetOutput(io.MultiWriter(os.Stdout, logFile))
	}

	// Xử lý các lệnh quản lý Windows Service nếu có cờ -service
	if *serviceCmd != "" {
		var err error
		switch *serviceCmd {
		case "install":
			err = installService()
		case "uninstall":
			err = uninstallService()
		case "start":
			err = startService()
		case "stop":
			err = stopService()
		default:
			log.Fatalf("Lệnh service không hợp lệ: '%s'. Sử dụng: install | uninstall | start | stop", *serviceCmd)
		}
		if err != nil {
			log.Fatalf("[SERVICE] ❌ Thất bại: %v", err)
		}
		return
	}

	// Kiểm tra xem có đang được gọi bởi Windows Service Control Manager không
	isSvc, err := isWindowsService()
	if err != nil {
		log.Printf("[WARN] Không thể kiểm tra trạng thái Windows Service: %v", err)
	}

	if isSvc {
		log.Println("[SERVICE] 🚀 Đang khởi động SOC Agent dưới dạng Windows Service...")

		var cancelFunc context.CancelFunc
		var wg sync.WaitGroup

		err = runAsWindowsService(
			func() {
				// Start agent logic
				ctx, cancel := context.WithCancel(context.Background())
				cancelFunc = cancel
				wg.Add(1)
				go func() {
					defer wg.Done()
					runAgent(ctx, *configPath)
				}()
			},
			func() {
				// Stop agent logic
				log.Println("[SERVICE] 🛑 Nhận lệnh dừng Windows Service...")
				if cancelFunc != nil {
					cancelFunc()
				}
				wg.Wait()
				log.Println("[SERVICE] 👋 Windows Service đã dừng hoàn toàn.")
			},
		)
		if err != nil {
			log.Printf("[SERVICE] ❌ Lỗi chạy Windows Service: %v", err)
		}
		return
	}

	// Chạy dạng Interactive Console thông thường
	fmt.Print(banner)

	ctx, cancel := context.WithCancel(context.Background())
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-sigChan
		log.Println("\n[AGENT] 🛑 Nhận tín hiệu tắt Agent. Đang tiến hành Graceful Shutdown...")
		cancel()
	}()

	runAgent(ctx, *configPath)
	log.Println("[AGENT] 👋 Agent đã dừng an toàn. Hẹn gặp lại!")
}

// runAgent - Khởi chạy toàn bộ các tác vụ của Agent
func runAgent(ctx context.Context, configPath string) {
	// 1. Tải cấu hình Agent
	cfg, err := config.LoadConfig(configPath)
	if err != nil {
		log.Printf("[FATAL] Không thể tải cấu hình từ '%s': %v", configPath, err)
		return
	}

	log.Printf("[AGENT] 📌 Agent ID: %s", cfg.AgentID)
	log.Printf("[AGENT] 💻 Hostname: %s (%s, IP: %s)", cfg.Hostname, cfg.OSType, cfg.IPAddress)
	log.Printf("[AGENT] 🌐 Target Server: %s (Protocol: %s)", cfg.ServerURL, cfg.Protocol)
	log.Printf("[AGENT] ⏱️  Heartbeat: %ds | Metric Interval: %ds | Buffer: %d items",
		cfg.HeartbeatIntervalSec, cfg.MetricIntervalSec, cfg.BufferSize)

	// 2. Khởi tạo In-Memory Buffer với Backpressure
	eventBuffer := streamer.NewEventBuffer(cfg.BufferSize)

	// 3. Khởi tạo Metric Collector
	metricCollector := collector.NewMetricCollector(cfg, eventBuffer.Channel())

	// 4. Khởi tạo Command Executor
	commandExecutor := executor.NewCommandExecutor(cfg, metricCollector, eventBuffer.Channel())

	// 5. Khởi tạo Log Tailer (fsnotify)
	logTailer, err := tailer.NewLogTailer(cfg, eventBuffer.Channel())
	if err != nil {
		log.Printf("[WARN] Không thể khởi tạo fsnotify LogTailer: %v", err)
	}

	// 6. Khởi tạo gRPC Streamer
	grpcStreamer := streamer.NewGRPCStreamer(cfg, eventBuffer, commandExecutor, metricCollector)

	// 7. Chạy đồng thời các thành phần
	var wg sync.WaitGroup

	// Metric Collector
	if cfg.MetricsEnabled {
		wg.Add(1)
		go func() {
			defer wg.Done()
			metricCollector.Start(ctx)
		}()
	}

	// Log Tailer
	if cfg.LogTailerEnabled && logTailer != nil {
		wg.Add(1)
		go func() {
			defer wg.Done()
			logTailer.Start(ctx)
		}()
	}

	// FIM Watcher
	var fimWatcher *fim.Watcher
	if cfg.FIMEnabled {
		fimWatcher, err = fim.NewWatcher(cfg, eventBuffer.Channel())
		if err != nil {
			log.Printf("[WARN] Không thể khởi tạo FIM Watcher: %v", err)
		}
	}
	if fimWatcher != nil {
		wg.Add(1)
		go func() {
			defer wg.Done()
			fimWatcher.Start(ctx)
		}()
	}

	if cfg.ProcessMonitorEnabled {
		processMonitor := monitor.NewProcessMonitor(cfg, eventBuffer.Channel())
		wg.Add(1)
		go func() {
			defer wg.Done()
			processMonitor.Start(ctx)
		}()
	}
	if cfg.NetworkMonitorEnabled {
		networkMonitor := monitor.NewNetworkMonitor(cfg, eventBuffer.Channel())
		wg.Add(1)
		go func() {
			defer wg.Done()
			networkMonitor.Start(ctx)
		}()
	}

	// gRPC Streamer
	wg.Add(1)
	go func() {
		defer wg.Done()
		grpcStreamer.Start(ctx)
	}()

	log.Println("[AGENT] ✅ SOC/EDR Agent đang chạy đầy đủ tính năng...")

	// Chờ context bị hủy (tín hiệu ngắt từ main hoặc service stop)
	<-ctx.Done()

	// Chờ tất cả goroutines hoàn tất dọn dẹp
	wg.Wait()
}
