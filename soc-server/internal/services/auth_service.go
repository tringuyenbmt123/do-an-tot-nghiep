package services

import (
	"errors"
	"fmt"
	"time"

	"soc-server/internal/models"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type AuthService struct {
	db        *gorm.DB
	secretKey []byte
}

func NewAuthService(db *gorm.DB, secretKey []byte) *AuthService {
	return &AuthService{
		db:        db,
		secretKey: secretKey,
	}
}

// Login - Kiểm tra user/password và sinh JWT token
func (s *AuthService) Login(username, password string) (string, *models.User, error) {
	var user models.User
	if err := s.db.Where("username = ?", username).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", nil, fmt.Errorf("sai tên đăng nhập hoặc mật khẩu")
		}
		return "", nil, err
	}

	if !user.IsActive {
		return "", nil, fmt.Errorf("tài khoản đã bị khóa")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return "", nil, fmt.Errorf("sai tên đăng nhập hoặc mật khẩu")
	}

	// Update last login
	now := time.Now()
	s.db.Model(&user).Update("last_login_at", &now)

	// Generate JWT
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":  user.ID,
		"role": user.Role,
		"exp":  time.Now().Add(time.Hour * 24).Unix(), // Hết hạn sau 24h
		"iat":  time.Now().Unix(),
	})

	tokenString, err := token.SignedString(s.secretKey)
	if err != nil {
		return "", nil, fmt.Errorf("lỗi khi tạo token: %w", err)
	}

	return tokenString, &user, nil
}
