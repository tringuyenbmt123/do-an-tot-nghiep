package models

import (
	"time"

	"gorm.io/gorm"
)

// User - Đại diện cho người dùng hệ thống (Analyst, Admin)
type User struct {
	ID           string         `gorm:"type:varchar(36);primary_key" json:"id"`
	Username     string         `gorm:"type:varchar(100);uniqueIndex;not null" json:"username"`
	PasswordHash string         `gorm:"type:varchar(255);not null" json:"-"` // Không trả về JSON
	Email        string         `gorm:"type:varchar(100);uniqueIndex" json:"email"`
	Role         string         `gorm:"type:varchar(50);default:'analyst'" json:"role"` // admin, analyst
	IsActive     bool           `gorm:"default:true" json:"is_active"`
	LastLoginAt  *time.Time     `json:"last_login_at"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`
}
