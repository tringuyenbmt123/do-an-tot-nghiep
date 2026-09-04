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
//         - Graceful Shutdown an toàn
// ==============================================================================

package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
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
	flag.Parse()

	fmt.Print(banner)

	// 1. Tải cấu hình Agent
	cfg, err := config.LoadConfig(*configPath)
	if err != nil {
		log.Fatalf("[FATAL] Không thể tải cấu hình: %v", err)
	}

	log.Printf("[AGENT] 📌 Agent ID: %s", cfg.AgentID)
	log.Printf("[AGENT] 💻 Hostname: %s (%s, IP: %s)", cfg.Hostname, cfg.OSType, cfg.IPAddress)
	log.Printf("[AGENT] 🌐 Target Server: %s (Protocol: %s)", cfg.ServerURL, cfg.Protocol)
	log.Printf("[AGENT] ⏱️  Heartbeat: %ds | Metric Interval: %ds | Buffer: %d items",
		cfg.HeartbeatIntervalSec, cfg.MetricIntervalSec, cfg.BufferSize)

	// 2. Thiết lập Context & Bắt tín hiệu ngắt OS (SIGINT, SIGTERM)
	ctx, cancel := context.WithCancel(context.Background())
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	// 3. Khởi tạo In-Memory Buffer với Backpressure
	eventBuffer := streamer.NewEventBuffer(cfg.BufferSize)

	// 4. Khởi tạo Metric Collector
	metricCollector := collector.NewMetricCollector(cfg, eventBuffer.Channel())

	// 5. Khởi tạo Command Executor
	commandExecutor := executor.NewCommandExecutor(cfg, metricCollector, eventBuffer.Channel())

	// 6. Khởi tạo Log Tailer (fsnotify)
	logTailer, err := tailer.NewLogTailer(cfg, eventBuffer.Channel())
	if err != nil {
		log.Printf("[WARN] Không thể khởi tạo fsnotify LogTailer: %v", err)
	}

	// 7. Khởi tạo gRPC Streamer
	grpcStreamer := streamer.NewGRPCStreamer(cfg, eventBuffer, commandExecutor, metricCollector)

	// 8. Chạy đồng thời các thành phần
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

	log.Println("[AGENT] ✅ SOC/EDR Agent đã hoạt động đầy đủ tính năng.")

	// 9. Chờ tín hiệu dừng
	<-sigChan
	log.Println("\n[AGENT] 🛑 Nhận tín hiệu tắt Agent. Đang tiến hành Graceful Shutdown...")
	cancel()

	// Chờ tất cả goroutines hoàn tất dọn dẹp
	wg.Wait()
	log.Println("[AGENT] 👋 Agent đã dừng an toàn. Hẹn gặp lại!")
}
