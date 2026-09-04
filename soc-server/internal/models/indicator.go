// ==============================================================================
// Package models - GORM Model: Indicator (IOC)
// File: internal/models/indicator.go
// Mô tả: Bảng `indicators` lưu trữ Indicators of Compromise (IOCs).
//         Thay thế chức năng MISP trong kiến trúc SOC truyền thống.
//         Chứa các dấu hiệu đe dọa: IP độc hại, domain phishing, hash malware...
// ==============================================================================

package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// IOCType - Enum loại Indicator of Compromise
type IOCType string

const (
	IOCTypeIPSrc   IOCType = "ip-src"   // Địa chỉ IP nguồn độc hại
	IOCTypeIPDst   IOCType = "ip-dst"   // Địa chỉ IP đích độc hại
	IOCTypeDomain  IOCType = "domain"   // Tên miền phishing/C2
	IOCTypeSHA256  IOCType = "sha256"   // Hash SHA256 của file malware
	IOCTypeMD5     IOCType = "md5"      // Hash MD5 của file malware
	IOCTypeURL     IOCType = "url"      // URL độc hại
	IOCTypeEmail   IOCType = "email"    // Địa chỉ email phishing
)

// Indicator - GORM model cho bảng `indicators`
// Mỗi record là một IOC (Indicator of Compromise) dùng để phát hiện mối đe dọa
type Indicator struct {
	// ID - Khóa chính UUID
	ID string `gorm:"size:36;primaryKey" json:"id"`

	// Type - Loại IOC: ip-src, domain, sha256, url, email...
	Type IOCType `gorm:"type:varchar(30);not null;index" json:"type"`

	// Value - Giá trị IOC (ví dụ: "192.168.1.100", "malware.com", "abc123...")
	// Đánh index unique để tránh duplicate
	Value string `gorm:"type:varchar(500);not null;index" json:"value"`

	// Category - Phân loại IOC: "malware", "phishing", "c2_server", "ransomware"
	Category string `gorm:"type:varchar(100);index" json:"category"`

	// Source - Nguồn cung cấp IOC: "internal", "osint", "misp_feed", "analyst"
	Source string `gorm:"type:varchar(100)" json:"source"`

	// MITRETactic - MITRE ATT&CK Tactic liên quan
	MITRETactic string `gorm:"type:varchar(100)" json:"mitre_tactic"`

	// MITRETechniqueID - MITRE ATT&CK Technique ID (ví dụ: "T1566.001")
	MITRETechniqueID string `gorm:"type:varchar(20)" json:"mitre_technique_id"`

	// RiskScore - Điểm đánh giá rủi ro (0-100)
	// 0-25: Low, 26-50: Medium, 51-75: High, 76-100: Critical
	RiskScore int `gorm:"type:integer;default:50" json:"risk_score"`

	// Description - Mô tả thêm về IOC
	Description string `gorm:"type:text" json:"description"`

	// IsActive - IOC còn hiệu lực hay đã hết hạn
	IsActive bool `gorm:"default:true;index" json:"is_active"`

	// ExpiresAt - Thời điểm IOC hết hạn (tùy chọn)
	ExpiresAt *time.Time `gorm:"type:datetime\(3\)" json:"expires_at,omitempty"`

	// Timestamps
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

// TableName - Chỉ định tên bảng
func (Indicator) TableName() string {
	return "indicators"
}

// BeforeCreate - Tự động sinh UUID
func (i *Indicator) BeforeCreate(tx *gorm.DB) error {
	if i.ID == "" {
		i.ID = uuid.New().String()
	}
	return nil
}
