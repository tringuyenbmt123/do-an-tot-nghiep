// ==============================================================================
// Package config - Quản lý cấu hình cho SOC/EDR Agent
// File: config/config.go
// Mô tả: Đọc cấu hình từ file config.json hoặc Environment Variables,
//         hỗ trợ cập nhật động trong thời gian chạy (Dynamic Runtime Update).
// ==============================================================================

package config

import (
	"encoding/json"
	"fmt"
	"net"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/google/uuid"
)

// AgentConfig - Struct chứa toàn bộ thông tin cấu hình của Agent
type AgentConfig struct {
	mu sync.RWMutex

	// Server connection
	ServerURL      string `json:"server_url"`       // gRPC endpoint (vd: localhost:50051) hoặc WebSocket URL
	Protocol       string `json:"protocol"`         // "grpc" (mặc định) hoặc "websocket"
	AgentID        string `json:"agent_id"`         // UUID hoặc Hostname duy nhất
	AgentSecretKey string `json:"agent_secret_key"` // Token xác thực (Bearer token)

	// Intervals & Timing
	HeartbeatIntervalSec int `json:"heartbeat_interval_seconds"` // Mặc định 5s (hoặc 30s)
	MetricIntervalSec    int `json:"metric_interval_seconds"`    // Mặc định 1s
	MaxBackoffSec        int `json:"max_backoff_seconds"`        // Thời gian chờ retry tối đa (mặc định 30s)

	// Buffering & Backpressure
	BufferSize int `json:"buffer_size"` // Kích thước Ring Buffer trong RAM (mặc định 1000)

	// Log tailing targets
	LogPaths []string `json:"log_paths"` // Danh sách đường dẫn file log cần theo dõi

	// File Integrity Monitoring targets
	FIMEnabled bool     `json:"fim_enabled"`
	FIMPaths   []string `json:"fim_paths"`

	// Optional monitoring modules
	MetricsEnabled         bool     `json:"metrics_enabled"`
	LogTailerEnabled       bool     `json:"log_tailer_enabled"`
	ProcessMonitorEnabled  bool     `json:"process_monitor_enabled"`
	ProcessPollIntervalSec int      `json:"process_poll_interval_seconds"`
	ProcessExcludeNames    []string `json:"process_exclude_names"`
	NetworkMonitorEnabled  bool     `json:"network_monitor_enabled"`
	NetworkPollIntervalSec int      `json:"network_poll_interval_seconds"`

	// mTLS Configuration (Optional)
	MTLSEnabled    bool   `json:"mtls_enabled"`
	CACertPath     string `json:"ca_cert_path"`
	ClientCertPath string `json:"client_cert_path"`
	ClientKeyPath  string `json:"client_key_path"`

	// Local Endpoint Metadata
	Hostname  string `json:"-"`
	IPAddress string `json:"-"`
	OSType    string `json:"-"`
	Version   string `json:"-"`
}

// LoadConfig - Tải cấu hình từ configPath, fallback sang Environment Variables
func LoadConfig(configPath string) (*AgentConfig, error) {
	cfg := &AgentConfig{
		ServerURL:              "localhost:50051",
		Protocol:               "grpc",
		HeartbeatIntervalSec:   5,
		MetricIntervalSec:      1,
		MaxBackoffSec:          30,
		BufferSize:             1000,
		LogPaths:               []string{},
		FIMPaths:               []string{},
		MetricsEnabled:         true,
		LogTailerEnabled:       true,
		ProcessPollIntervalSec: 5,
		NetworkPollIntervalSec: 10,
		Version:                "v1.0.0-enterprise",
	}

	// 1. Đọc file config.json nếu tồn tại
	if configPath != "" {
		if data, err := os.ReadFile(configPath); err == nil {
			if err := json.Unmarshal(data, cfg); err != nil {
				return nil, fmt.Errorf("lỗi parse file cấu hình %s: %w", configPath, err)
			}
		}
	}

	// 2. Override bằng Environment Variables nếu có
	if envServer := os.Getenv("SERVER_URL"); envServer != "" {
		cfg.ServerURL = envServer
	}
	if envProto := os.Getenv("PROTOCOL"); envProto != "" {
		cfg.Protocol = envProto
	}
	if envID := os.Getenv("AGENT_ID"); envID != "" {
		cfg.AgentID = envID
	}
	if envSecret := os.Getenv("AGENT_SECRET_KEY"); envSecret != "" {
		cfg.AgentSecretKey = envSecret
	}
	if envHB := os.Getenv("HEARTBEAT_INTERVAL"); envHB != "" {
		if val, err := strconv.Atoi(envHB); err == nil && val > 0 {
			cfg.HeartbeatIntervalSec = val
		}
	}
	if envMetric := os.Getenv("METRIC_INTERVAL"); envMetric != "" {
		if val, err := strconv.Atoi(envMetric); err == nil && val > 0 {
			cfg.MetricIntervalSec = val
		}
	}

	// 3. Tự động xác định Hostname và IP Local nếu chưa có AgentID
	hostname, err := os.Hostname()
	if err != nil {
		hostname = "endpoint-" + uuid.New().String()[:8]
	}
	cfg.Hostname = hostname

	if cfg.AgentID == "" {
		cfg.AgentID = fmt.Sprintf("agent-%s", hostname)
	}

	cfg.IPAddress = getOutboundIP()
	cfg.OSType = getOSType()

	return cfg, nil
}

// GetHeartbeatInterval - Đọc chu kỳ heartbeat an toàn luồng
func (c *AgentConfig) GetHeartbeatInterval() time.Duration {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return time.Duration(c.HeartbeatIntervalSec) * time.Second
}

// GetMetricInterval - Đọc chu kỳ metric an toàn luồng
func (c *AgentConfig) GetMetricInterval() time.Duration {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return time.Duration(c.MetricIntervalSec) * time.Second
}

// UpdateIntervals - Cập nhật chu kỳ động khi nhận lệnh update_config từ Server
func (c *AgentConfig) UpdateIntervals(hbSec, metricSec int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if hbSec > 0 {
		c.HeartbeatIntervalSec = hbSec
	}
	if metricSec > 0 {
		c.MetricIntervalSec = metricSec
	}
}

// getOutboundIP - Lấy địa chỉ IP chính của máy
func getOutboundIP() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return "127.0.0.1"
	}
	defer conn.Close()

	localAddr := conn.LocalAddr().(*net.UDPAddr)
	return localAddr.IP.String()
}

// getOSType - Nhận diện OS: windows, linux, darwin
func getOSType() string {
	switch os := os.Getenv("GOOS"); os {
	case "windows":
		return "windows"
	case "linux":
		return "linux"
	case "darwin":
		return "macos"
	default:
		// Runtime fallback
		if len(os) > 0 {
			return os
		}
		return "windows"
	}
}
