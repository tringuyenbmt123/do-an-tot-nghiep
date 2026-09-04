// ==============================================================================
// Package database - Kết nối MySQL với GORM
// File: pkg/database/mysql.go
// Mô tả: Khởi tạo GORM connection tới MySQL, cấu hình connection pool,
//         và thực hiện AutoMigrate tất cả GORM models.
// ==============================================================================

package database

import (
	"fmt"
	"log"
	"time"

	"soc-server/internal/config"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// InitMySQL - Khởi tạo kết nối MySQL và cấu hình GORM
// Trả về *gorm.DB instance sẵn sàng sử dụng cho toàn bộ ứng dụng.
func InitMySQL(cfg *config.DatabaseConfig) (*gorm.DB, error) {
	// Tạo chuỗi kết nối DSN từ cấu hình
	dsn := cfg.DSN()
	log.Printf("[DATABASE] Đang kết nối MySQL: host=%s port=%d dbname=%s", cfg.Host, cfg.Port, cfg.DBName)

	// Mở kết nối GORM với MySQL driver
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{
		// Cấu hình logger GORM - hiển thị SQL queries khi debug
		Logger: logger.Default.LogMode(logger.Info),
		// Tắt auto-create foreign key constraints (quản lý thủ công)
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		return nil, fmt.Errorf("không thể kết nối MySQL: %w", err)
	}

	// Lấy underlying *sql.DB để cấu hình connection pool
	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("không thể lấy sql.DB instance: %w", err)
	}

	// Cấu hình Connection Pool:
	// - MaxOpenConns: Số kết nối tối đa mở đồng thời (tránh quá tải DB)
	// - MaxIdleConns: Số kết nối idle giữ sẵn trong pool (tăng performance)
	// - ConnMaxLifetime: Thời gian sống tối đa của một kết nối (tránh stale connections)
	sqlDB.SetMaxOpenConns(cfg.MaxOpenConns)
	sqlDB.SetMaxIdleConns(cfg.MaxIdleConns)
	sqlDB.SetConnMaxLifetime(time.Duration(cfg.ConnMaxLifetimeMinutes) * time.Minute)

	// Kiểm tra kết nối thực sự hoạt động
	if err := sqlDB.Ping(); err != nil {
		return nil, fmt.Errorf("không thể ping MySQL: %w", err)
	}

	log.Println("[DATABASE] ✅ Kết nối MySQL thành công!")
	return db, nil
}

// AutoMigrateAll - Thực hiện AutoMigrate cho tất cả GORM models
// Tạo/cập nhật schema bảng trong PostgreSQL dựa trên struct Go.
// Lưu ý: Hàm này nhận các model interfaces để tránh circular dependency.
func AutoMigrateAll(db *gorm.DB, models ...interface{}) error {
	log.Println("[DATABASE] Đang thực hiện AutoMigrate cho tất cả models...")

	if err := db.AutoMigrate(models...); err != nil {
		return fmt.Errorf("lỗi AutoMigrate: %w", err)
	}

	log.Println("[DATABASE] ✅ AutoMigrate hoàn tất - Tất cả bảng đã sẵn sàng!")
	return nil
}
