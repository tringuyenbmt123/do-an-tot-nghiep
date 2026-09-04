// ==============================================================================
// Package api - Middleware
// File: internal/api/middleware.go
// Mô tả: Cung cấp các middleware cho Gin router (CORS, Logging, Recovery)
// ==============================================================================

package api

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// Lấy secret key từ môi trường hoặc dùng mặc định cho dev
func getJWTSecret() []byte {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "super-secret-soc-key-2026"
	}
	return []byte(secret)
}

// CORSMiddleware - Xử lý Cross-Origin Resource Sharing cho Frontend React
func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Trong thực tế cần cấu hình origin cụ thể, ở đây dùng * cho development
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With, X-SOC-Source")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, PATCH, DELETE")

		// Xử lý request preflight OPTIONS
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}

// RequestLogger - Middleware ghi log chi tiết mọi HTTP request
func RequestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		raw := c.Request.URL.RawQuery

		// Xử lý request
		c.Next()

		// Tính toán thông số sau khi xử lý xong
		latency := time.Since(start)
		clientIP := c.ClientIP()
		method := c.Request.Method
		statusCode := c.Writer.Status()

		if raw != "" {
			path = path + "?" + raw
		}

		// Không log các request /ping hoặc websocket liên tục (tránh rác log)
		if path != "/api/v1/ping" && path != "/ws/alerts" {
			log.Printf("[REST API] %3d | %13v | %15s | %-7s %s",
				statusCode,
				latency,
				clientIP,
				method,
				path,
			)
		}
	}
}

// AuthMiddleware - Xác thực JWT Token từ header Authorization
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := strings.TrimSpace(c.GetHeader("Authorization"))
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Thiếu token xác thực (Authorization header)"})
			return
		}

		parts := strings.Fields(authHeader)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Định dạng token không hợp lệ. Phải là Bearer <token>"})
			return
		}

		tokenString := strings.TrimSpace(parts[1])
		if tokenString == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Token rỗng"})
			return
		}

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("phương thức mã hóa không hợp lệ: %v", token.Header["alg"])
			}
			return getJWTSecret(), nil
		})

		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Token không hợp lệ hoặc đã hết hạn"})
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if ok {
			// Lưu user ID và role vào Context để các handler tiếp theo sử dụng
			c.Set("user_id", claims["sub"])
			c.Set("role", claims["role"])
			c.Next()
		} else {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Không thể parse token claims"})
		}
	}
}

