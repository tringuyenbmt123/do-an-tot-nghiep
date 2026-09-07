// ==============================================================================
// Package config - Quản lý cấu hình ứng dụng
// File: internal/config/config.go
// Mô tả: Đọc và parse file config.yaml thành struct Go.
//         Hỗ trợ override bằng biến môi trường (Environment Variables).
// ==============================================================================

package config

import (
	"fmt"
	"os"
	"strconv"

	"gopkg.in/yaml.v3"
)

// AppConfig - Struct chính chứa toàn bộ cấu hình ứng dụng
type AppConfig struct {
	Server    ServerConfig    `yaml:"server"`
	Database  DatabaseConfig  `yaml:"database"`
	Redis     RedisConfig     `yaml:"redis"`
	MTLS      MTLSConfig      `yaml:"mtls"`
	Rules     RulesConfig     `yaml:"rules"`
	SOAR      SOARConfig      `yaml:"soar"`
	Heartbeat HeartbeatConfig `yaml:"heartbeat"`
	Alert     AlertConfig     `yaml:"alert"`
}

// ServerConfig - Cấu hình cổng REST API và gRPC
type ServerConfig struct {
	RESTPort int `yaml:"rest_port"` // Cổng REST API + WebSocket (mặc định: 8080)
	GRPCPort int `yaml:"grpc_port"` // Cổng gRPC Server cho Agent (mặc định: 50051)
}

// DatabaseConfig - Cấu hình kết nối MySQL
type DatabaseConfig struct {
	Host                   string `yaml:"host"`
	Port                   int    `yaml:"port"`
	User                   string `yaml:"user"`
	Password               string `yaml:"password"`
	DBName                 string `yaml:"dbname"`
	SSLMode                string `yaml:"sslmode"`
	MaxOpenConns           int    `yaml:"max_open_conns"`
	MaxIdleConns           int    `yaml:"max_idle_conns"`
	ConnMaxLifetimeMinutes int    `yaml:"conn_max_lifetime_minutes"`
}

// DSN - Tạo chuỗi kết nối MySQL từ cấu hình
func (d *DatabaseConfig) DSN() string {
	return fmt.Sprintf(
		"%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=True&loc=Local",
		d.User, d.Password, d.Host, d.Port, d.DBName,
	)
}

// RedisConfig - Cấu hình kết nối Redis
type RedisConfig struct {
	Address             string `yaml:"address"`
	Password            string `yaml:"password"`
	DB                  int    `yaml:"db"`
	AgentStatusTTLSecs  int    `yaml:"agent_status_ttl_seconds"` // TTL cache trạng thái agent
}

// MTLSConfig - Đường dẫn chứng chỉ mTLS cho gRPC Server
type MTLSConfig struct {
	Enabled        bool   `yaml:"enabled"`           // Có bật mTLS hay không
	CACertPath     string `yaml:"ca_cert_path"`     // Chứng chỉ CA root
	ServerCertPath string `yaml:"server_cert_path"` // Chứng chỉ Server
	ServerKeyPath  string `yaml:"server_key_path"`  // Khóa riêng Server
}

// RulesConfig - Cấu hình Detection Rules Engine
type RulesConfig struct {
	YAMLDir    string `yaml:"yaml_dir"`      // Thư mục chứa file YAML rules
	LoadFromDB bool   `yaml:"load_from_db"`  // Có tải rules từ DB không
}

// SOARConfig - Cấu hình tích hợp n8n SOAR
type SOARConfig struct {
	N8NWebhookURL        string `yaml:"n8n_webhook_url"`         // URL webhook mặc định (fallback)
	N8NWebhookURLDDoS    string `yaml:"n8n_webhook_url_ddos"`    // URL webhook riêng cho DDoS events
	N8NWebhookURLPhishing string `yaml:"n8n_webhook_url_phishing"` // URL webhook riêng cho Phishing events
	N8NWebhookURLWazuh   string `yaml:"n8n_webhook_url_wazuh"`   // URL webhook riêng cho Wazuh/EDR events
	WebhookTimeoutSecs   int    `yaml:"webhook_timeout_seconds"`
	MaxRetries           int    `yaml:"max_retries"`
	Enabled              bool   `yaml:"enabled"`
	// CallbackSecret - Shared secret để xác thực callback từ n8n.
	// n8n phải gửi header: X-SOC-Callback-Secret: <giá trị này>
	CallbackSecret       string `yaml:"callback_secret"`
}

// AlertConfig - Cấu hình quản lý Alert lifecycle
type AlertConfig struct {
	// RetentionDays - Số ngày giữ lại Alert LOW không match rule trước khi xóa.
	// Alert HIGH/CRITICAL/MEDIUM không bị ảnh hưởng bởi retention này.
	RetentionDays int `yaml:"retention_days"`
}

// HeartbeatConfig - Cấu hình giám sát heartbeat Agent
type HeartbeatConfig struct {
	CheckIntervalSecs    int `yaml:"check_interval_seconds"`    // Tần suất kiểm tra
	OfflineThresholdSecs int `yaml:"offline_threshold_seconds"` // Ngưỡng đánh dấu offline
}

// LoadConfig - Đọc file config.yaml và parse thành AppConfig struct
// Hỗ trợ override bằng biến môi trường với prefix SOC_
// Ví dụ: SOC_DB_HOST=192.168.1.100 sẽ override database.host
func LoadConfig(filePath string) (*AppConfig, error) {
	// Đọc file cấu hình YAML
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("không thể đọc file cấu hình '%s': %w", filePath, err)
	}

	// Parse YAML thành struct
	cfg := &AppConfig{}
	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("lỗi parse YAML cấu hình: %w", err)
	}

	// Override bằng biến môi trường (nếu có)
	applyEnvOverrides(cfg)

	// Thiết lập giá trị mặc định cho các trường chưa được cấu hình
	applyDefaults(cfg)

	return cfg, nil
}

// applyEnvOverrides - Override cấu hình bằng biến môi trường
// Ưu tiên: Environment Variable > config.yaml
func applyEnvOverrides(cfg *AppConfig) {
	// Override PostgreSQL
	if v := os.Getenv("SOC_DB_HOST"); v != "" {
		cfg.Database.Host = v
	}
	if v := os.Getenv("SOC_DB_PORT"); v != "" {
		if port, err := strconv.Atoi(v); err == nil {
			cfg.Database.Port = port
		}
	}
	if v := os.Getenv("SOC_DB_USER"); v != "" {
		cfg.Database.User = v
	}
	if v := os.Getenv("SOC_DB_PASSWORD"); v != "" {
		cfg.Database.Password = v
	}
	if v := os.Getenv("SOC_DB_NAME"); v != "" {
		cfg.Database.DBName = v
	}

	// Override Redis
	if v := os.Getenv("SOC_REDIS_ADDRESS"); v != "" {
		cfg.Redis.Address = v
	}
	if v := os.Getenv("SOC_REDIS_PASSWORD"); v != "" {
		cfg.Redis.Password = v
	}

	// Override n8n SOAR
	if v := os.Getenv("SOC_N8N_WEBHOOK_URL"); v != "" {
		cfg.SOAR.N8NWebhookURL = v
	}
	if v := os.Getenv("SOC_N8N_WEBHOOK_URL_DDOS"); v != "" {
		cfg.SOAR.N8NWebhookURLDDoS = v
	}
	if v := os.Getenv("SOC_N8N_WEBHOOK_URL_PHISHING"); v != "" {
		cfg.SOAR.N8NWebhookURLPhishing = v
	}
	if v := os.Getenv("SOC_N8N_WEBHOOK_URL_WAZUH"); v != "" {
		cfg.SOAR.N8NWebhookURLWazuh = v
	}
	if v := os.Getenv("SOC_SOAR_CALLBACK_SECRET"); v != "" {
		cfg.SOAR.CallbackSecret = v
	}

	// Override Server ports
	if v := os.Getenv("SOC_REST_PORT"); v != "" {
		if port, err := strconv.Atoi(v); err == nil {
			cfg.Server.RESTPort = port
		}
	}
	if v := os.Getenv("SOC_GRPC_PORT"); v != "" {
		if port, err := strconv.Atoi(v); err == nil {
			cfg.Server.GRPCPort = port
		}
	}
}

// applyDefaults - Thiết lập giá trị mặc định cho các trường chưa được cấu hình
func applyDefaults(cfg *AppConfig) {
	if cfg.Server.RESTPort == 0 {
		cfg.Server.RESTPort = 8080
	}
	if cfg.Server.GRPCPort == 0 {
		cfg.Server.GRPCPort = 50051
	}
	if cfg.Database.MaxOpenConns == 0 {
		cfg.Database.MaxOpenConns = 25
	}
	if cfg.Database.MaxIdleConns == 0 {
		cfg.Database.MaxIdleConns = 10
	}
	if cfg.Database.ConnMaxLifetimeMinutes == 0 {
		cfg.Database.ConnMaxLifetimeMinutes = 30
	}
	if cfg.Redis.AgentStatusTTLSecs == 0 {
		cfg.Redis.AgentStatusTTLSecs = 60
	}
	if cfg.SOAR.WebhookTimeoutSecs == 0 {
		cfg.SOAR.WebhookTimeoutSecs = 10
	}
	if cfg.SOAR.MaxRetries == 0 {
		cfg.SOAR.MaxRetries = 3
	}
	if cfg.Heartbeat.CheckIntervalSecs == 0 {
		cfg.Heartbeat.CheckIntervalSecs = 30
	}
	if cfg.Heartbeat.OfflineThresholdSecs == 0 {
		cfg.Heartbeat.OfflineThresholdSecs = 90
	}
	if !cfg.MTLS.Enabled && cfg.MTLS.CACertPath == "" && cfg.MTLS.ServerCertPath == "" && cfg.MTLS.ServerKeyPath == "" {
		cfg.MTLS.Enabled = false
	}
	// Mặc định giữ LOW alerts 7 ngày trước khi xóa
	if cfg.Alert.RetentionDays == 0 {
		cfg.Alert.RetentionDays = 7
	}
}
