// ==============================================================================
// Package database - Kết nối Redis
// File: pkg/database/redis.go
// Mô tả: Khởi tạo Redis client, cung cấp các hàm helper quản lý
//         trạng thái Agent (Online/Offline) trong Redis cache.
// ==============================================================================

package database

import (
	"context"
	"fmt"
	"log"
	"time"

	"soc-server/internal/config"

	"github.com/redis/go-redis/v9"
)

// RedisClient - Wrapper xung quanh go-redis client
// Cung cấp các method helper cho việc quản lý trạng thái Agent
type RedisClient struct {
	Client *redis.Client       // Redis client instance gốc
	TTL    time.Duration       // TTL mặc định cho key agent status
}

// InitRedis - Khởi tạo kết nối Redis từ cấu hình
func InitRedis(cfg *config.RedisConfig) (*RedisClient, error) {
	log.Printf("[REDIS] Đang kết nối Redis: %s", cfg.Address)

	// Tạo Redis client với cấu hình
	client := redis.NewClient(&redis.Options{
		Addr:     cfg.Address,
		Password: cfg.Password,
		DB:       cfg.DB,
		// Pool settings mặc định cho performance
		PoolSize:     20,
		MinIdleConns: 5,
	})

	// Kiểm tra kết nối bằng PING command
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("không thể kết nối Redis tại '%s': %w", cfg.Address, err)
	}

	log.Println("[REDIS] ✅ Kết nối Redis thành công!")

	return &RedisClient{
		Client: client,
		TTL:    time.Duration(cfg.AgentStatusTTLSecs) * time.Second,
	}, nil
}

// ==============================================================================
// Các hàm helper quản lý trạng thái Agent trong Redis
// Key format: "agent:status:{agent_id}" → Value: "online" / "offline"
// ==============================================================================

// SetAgentOnline - Đánh dấu Agent là online trong Redis
// TTL tự động hết hạn → nếu Agent không gửi heartbeat thì key sẽ biến mất
func (r *RedisClient) SetAgentOnline(ctx context.Context, agentID string) error {
	key := fmt.Sprintf("agent:status:%s", agentID)
	return r.Client.Set(ctx, key, "online", r.TTL).Err()
}

// SetAgentOffline - Đánh dấu Agent là offline (xóa key khỏi Redis)
func (r *RedisClient) SetAgentOffline(ctx context.Context, agentID string) error {
	key := fmt.Sprintf("agent:status:%s", agentID)
	return r.Client.Del(ctx, key).Err()
}

// IsAgentOnline - Kiểm tra Agent có đang online không
// Trả về true nếu key tồn tại trong Redis (chưa hết TTL)
func (r *RedisClient) IsAgentOnline(ctx context.Context, agentID string) (bool, error) {
	key := fmt.Sprintf("agent:status:%s", agentID)
	result, err := r.Client.Exists(ctx, key).Result()
	if err != nil {
		return false, fmt.Errorf("lỗi kiểm tra trạng thái Agent '%s': %w", agentID, err)
	}
	return result > 0, nil
}

// GetAgentStatus - Lấy trạng thái hiện tại của Agent
// Trả về "online" hoặc "offline"
func (r *RedisClient) GetAgentStatus(ctx context.Context, agentID string) (string, error) {
	key := fmt.Sprintf("agent:status:%s", agentID)
	status, err := r.Client.Get(ctx, key).Result()
	if err == redis.Nil {
		// Key không tồn tại → Agent offline
		return "offline", nil
	}
	if err != nil {
		return "offline", fmt.Errorf("lỗi lấy trạng thái Agent '%s': %w", agentID, err)
	}
	return status, nil
}

// SetAgentHeartbeatData - Lưu thông tin heartbeat chi tiết vào Redis Hash
// Dùng cho Dashboard hiển thị CPU, RAM, version... real-time
func (r *RedisClient) SetAgentHeartbeatData(ctx context.Context, agentID string, data map[string]interface{}) error {
	key := fmt.Sprintf("agent:heartbeat:%s", agentID)
	// Lưu dưới dạng Redis Hash
	if err := r.Client.HSet(ctx, key, data).Err(); err != nil {
		return fmt.Errorf("lỗi lưu heartbeat data cho Agent '%s': %w", agentID, err)
	}
	// Đặt TTL cho hash key
	return r.Client.Expire(ctx, key, r.TTL*2).Err()
}

// Close - Đóng kết nối Redis gracefully
func (r *RedisClient) Close() error {
	return r.Client.Close()
}
