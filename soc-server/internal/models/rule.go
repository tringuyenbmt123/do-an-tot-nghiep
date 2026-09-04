// ==============================================================================
// Package models - GORM Model: Rule
// File: internal/models/rule.go
// Mô tả: Bảng `rules` lưu trữ Detection Rules cho Rule Engine.
//         Rules có thể được tải từ file YAML hoặc tạo trực tiếp qua API.
//         Hỗ trợ hot-reload: thêm/sửa rule mà không cần restart server.
// ==============================================================================

package models

import (
	"time"

	"gorm.io/gorm"
)

// Rule - GORM model cho bảng `rules`
// Mỗi Rule định nghĩa một pattern để phát hiện mối đe dọa
type Rule struct {
	// ID - Khóa chính dạng VARCHAR (thay vì UUID), dùng ID ngắn gọn dễ nhớ
	// Ví dụ: "RULE-001", "PS-SUSPICIOUS-01", "RANSOMWARE-VSS-01"
	ID string `gorm:"type:varchar(100);primaryKey" json:"id"`

	// Name - Tên mô tả Rule (ví dụ: "Phát hiện PowerShell thực thi lệnh mã hóa")
	Name string `gorm:"type:varchar(500);not null" json:"name"`

	// Severity - Mức độ nghiêm trọng khi Rule khớp: critical, high, medium, low
	Severity string `gorm:"type:varchar(20);not null;index" json:"severity"`

	// EventType - Loại event mà Rule này áp dụng
	// Ví dụ: "sysmon_process_create", "sysmon_network_connect"
	EventType string `gorm:"type:varchar(100);not null;index" json:"event_type"`

	// Conditions - Điều kiện match dưới dạng JSONB
	// Cấu trúc: [{"field": "process_name", "operator": "equals", "value": "powershell.exe"},
	//            {"field": "command_line", "operator": "contains", "value": "-EncodedCommand"}]
	Conditions string `gorm:"type:json;not null" json:"conditions"`

	// MITRETactic - MITRE ATT&CK Tactic (ví dụ: "Execution", "Defense Evasion")
	MITRETactic string `gorm:"type:varchar(100)" json:"mitre_tactic"`

	// MITRETechniqueID - MITRE ATT&CK Technique ID (ví dụ: "T1059.001")
	MITRETechniqueID string `gorm:"type:varchar(20)" json:"mitre_technique_id"`

	// Description - Mô tả chi tiết Rule và lý do cần giám sát
	Description string `gorm:"type:text" json:"description"`

	// IsActive - Bật/tắt Rule mà không cần xóa
	// Admin có thể disable Rule tạm thời nếu gây nhiều False Positive
	IsActive bool `gorm:"default:true;index" json:"is_active"`

	// Source - Nguồn gốc Rule: "yaml_file", "database", "api_created"
	Source string `gorm:"type:varchar(50);default:'database'" json:"source"`

	// Timestamps
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

// TableName - Chỉ định tên bảng
func (Rule) TableName() string {
	return "rules"
}

// RuleCondition - Struct parse từ JSONB conditions
// Mỗi condition là 1 điều kiện kiểm tra trên log event
type RuleCondition struct {
	// Field - Tên trường trong log cần kiểm tra
	// Ví dụ: "process_name", "command_line", "dst_ip", "file_hash"
	Field string `json:"field" yaml:"field"`

	// Operator - Toán tử so sánh: "equals", "contains", "regex", "in", "not_equals"
	Operator string `json:"operator" yaml:"operator"`

	// Value - Giá trị cần so khớp
	Value string `json:"value" yaml:"value"`
}

// RuleYAML - Struct để parse Rule từ file YAML
// Sử dụng khi load rules từ thư mục configs/rules/*.yaml
type RuleYAML struct {
	ID               string          `yaml:"id"`
	Name             string          `yaml:"name"`
	Severity         string          `yaml:"severity"`
	EventType        string          `yaml:"event_type"`
	Description      string          `yaml:"description"`
	MITRETactic      string          `yaml:"mitre_tactic"`
	MITRETechniqueID string          `yaml:"mitre_technique_id"`
	IsActive         bool            `yaml:"is_active"`
	Conditions       []RuleCondition `yaml:"conditions"`
}
