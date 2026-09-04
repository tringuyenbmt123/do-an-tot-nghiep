package main

import (
	"log"

	"soc-server/internal/config"
	"soc-server/internal/models"
	"soc-server/pkg/database"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	// 1. Tải cấu hình
	cfg, err := config.LoadConfig("configs/config.yaml")
	if err != nil {
		log.Fatalf("❌ Lỗi cấu hình: %v", err)
	}

	// 2. Kết nối Database
	db, err := database.InitMySQL(&cfg.Database)
	if err != nil {
		log.Fatalf("❌ Lỗi Database: %v", err)
	}

	log.Println("Đang kiểm tra tài khoản Admin...")

	var count int64
	db.Model(&models.User{}).Where("username = ?", "admin").Count(&count)
	
	if count > 0 {
		log.Println("⚠️ Tài khoản 'admin' đã tồn tại. Không cần seed thêm.")
		return
	}

	// 3. Hash mật khẩu 'admin123'
	hash, err := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
	if err != nil {
		log.Fatalf("❌ Lỗi mã hóa mật khẩu: %v", err)
	}

	// 4. Tạo User
	adminUser := models.User{
		ID:           uuid.New().String(),
		Username:     "admin",
		PasswordHash: string(hash),
		Email:        "admin@soc.local",
		Role:         "admin",
		IsActive:     true,
	}

	if err := db.Create(&adminUser).Error; err != nil {
		log.Fatalf("❌ Lỗi khi tạo Admin user: %v", err)
	}

	log.Println("✅ Đã tạo thành công tài khoản mặc định:")
	log.Println("   Username: admin")
	log.Println("   Password: admin123")
}
