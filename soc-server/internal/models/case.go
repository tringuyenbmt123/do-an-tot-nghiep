// ==============================================================================
// Package models - GORM Model: Case
// File: internal/models/case.go
// Mô tả: Bảng `cases` quản lý các vụ việc bảo mật (Security Incidents).
//         Thay thế chức năng TheHive trong kiến trúc SOC truyền thống.
//         Mỗi Case có thể được tạo từ 1 hoặc nhiều Alert liên quan.
// ==============================================================================

package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// CaseStatus - Enum trạng thái vòng đời của Case
type CaseStatus string

const (
	CaseStatusNew        CaseStatus = "New"        // Mới tạo, chưa phân tích
	CaseStatusInProgress CaseStatus = "InProgress" // Đang được analyst điều tra
	CaseStatusClosed     CaseStatus = "Closed"     // Đã xử lý và đóng
	CaseStatusRejected   CaseStatus = "Rejected"   // Từ chối (False Positive)
)

// Case - GORM model cho bảng `cases`
// Đại diện cho một vụ việc bảo mật cần điều tra và xử lý
type Case struct {
	// ID - Khóa chính UUID
	ID string `gorm:"size:36;primaryKey" json:"id"`

	// AlertID - FK liên kết tới Alert gốc đã sinh ra Case này
	AlertID string `gorm:"size:36;index" json:"alert_id"`

	// Title - Tiêu đề vụ việc (ví dụ: "Ransomware Activity Detected on WS-01")
	Title string `gorm:"type:varchar(500);not null" json:"title"`

	// Description - Mô tả chi tiết vụ việc, hỗ trợ Markdown
	// Analyst có thể ghi chú quá trình điều tra vào đây
	Description string `gorm:"type:text" json:"description"`

	// SeverityNum - Mức độ nghiêm trọng dạng số (1=Critical, 2=High, 3=Medium, 4=Low)
	// Dùng số để dễ sort và filter trên Dashboard
	SeverityNum int `gorm:"type:integer;default:3;index" json:"severity_num"`

	// Status - Trạng thái vòng đời Case
	Status CaseStatus `gorm:"type:varchar(30);default:'New';index" json:"status"`

	// AssignedTo - Username/email của analyst được giao phụ trách Case
	AssignedTo string `gorm:"type:varchar(255)" json:"assigned_to"`

	// Tags - Nhãn phân loại dạng JSONB array (ví dụ: ["ransomware", "apt", "internal"])
	// Cho phép gắn nhiều tags để filter và search linh hoạt
	Tags string `gorm:"type:json" json:"tags"`

	// SOARStatus - Trạng thái xử lý SOAR (pending, ai_analyzing, human_review, completed)
	SOARStatus string `gorm:"type:varchar(50);default:'pending'" json:"soar_status"`

	// AIReason - Lý do/kết luận từ AI analysis (nếu có)
	AIReason string `gorm:"type:text" json:"ai_reason"`

	// HumanApprovedBy - Người đã phê duyệt qua Telegram HITL (nếu có)
	HumanApprovedBy string `gorm:"type:varchar(255)" json:"human_approved_by"`

	// Confidence - Độ tin cậy của kết quả phân tích (0.0 - 1.0)
	Confidence float64 `gorm:"type:decimal(5,4);default:0" json:"confidence"`

	// Timestamps
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`

	// Relations
	Alert *Alert `gorm:"foreignKey:AlertID" json:"alert,omitempty"`
}

// TableName - Chỉ định tên bảng
func (Case) TableName() string {
	return "cases"
}

// BeforeCreate - Tự động sinh UUID
func (c *Case) BeforeCreate(tx *gorm.DB) error {
	if c.ID == "" {
		c.ID = uuid.New().String()
	}
	if c.Status == "" {
		c.Status = CaseStatusNew
	}
	return nil
}
