// ==============================================================================
// Package models - GORM Model: Agent
// File: internal/models/agent.go
// Mô tả: Bảng `agents` lưu thông tin các Endpoint đã cài EDR Agent.
//         Mỗi Agent kết nối về Server qua gRPC/mTLS với chứng chỉ số riêng.
// ==============================================================================

package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Agent - GORM model cho bảng `agents`
// Mỗi record đại diện cho 1 Endpoint (máy tính) đã cài đặt EDR Agent
type Agent struct {
	// ID - Khóa chính UUID, tự động sinh khi tạo mới
	ID string `gorm:"size:36;primaryKey" json:"id"`

	// Hostname - Tên máy tính của Endpoint (ví dụ: "WORKSTATION-01")
	Hostname string `gorm:"type:varchar(255);not null;index" json:"hostname"`

	// IPAddress - Địa chỉ IP hiện tại của Endpoint
	IPAddress string `gorm:"type:varchar(45);not null" json:"ip_address"`

	// OSType - Hệ điều hành: "windows", "linux", "macos"
	OSType string `gorm:"type:varchar(50);not null" json:"os_type"`

	// Status - Trạng thái hiện tại: "online" hoặc "offline"
	// Được cập nhật dựa trên heartbeat và Redis cache
	Status string `gorm:"type:varchar(20);default:'offline';index" json:"status"`

	// LastHeartbeatAt - Thời điểm nhận heartbeat gần nhất từ Agent
	// Nếu quá lâu không nhận → đánh dấu Agent offline
	LastHeartbeatAt *time.Time `gorm:"type:datetime\(3\)" json:"last_heartbeat_at"`

	// MTLSCertFingerprint - SHA256 fingerprint của chứng chỉ mTLS Client
	// Dùng để xác thực Agent khi kết nối gRPC
	MTLSCertFingerprint *string `gorm:"type:varchar(255);uniqueIndex" json:"mtls_cert_fingerprint"`

	// AgentVersion - Phiên bản Agent đang chạy trên Endpoint
	AgentVersion string `gorm:"type:varchar(50)" json:"agent_version"`

	// Timestamps chuẩn GORM
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

// TableName - Chỉ định tên bảng trong PostgreSQL
func (Agent) TableName() string {
	return "agents"
}

// BeforeCreate - GORM Hook: Tự động sinh UUID trước khi INSERT
func (a *Agent) BeforeCreate(tx *gorm.DB) error {
	if a.ID == "" {
		a.ID = uuid.New().String()
	}
	return nil
}
