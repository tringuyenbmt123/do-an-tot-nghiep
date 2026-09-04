// ==============================================================================
// Package services - Agent Service
// File: internal/services/agent_service.go
// Mô tả: Business logic cho Agent management (Endpoint).
//         Lấy danh sách Agent, kiểm tra trạng thái Online từ Redis cache.
// ==============================================================================

package services

import (
	"context"
	"fmt"

	"soc-server/internal/models"
	"soc-server/pkg/database"

	"gorm.io/gorm"
)

// AgentService - Service xử lý business logic cho Agents
type AgentService struct {
	db    *gorm.DB
	redis *database.RedisClient
}

// NewAgentService - Khởi tạo AgentService
func NewAgentService(db *gorm.DB, redis *database.RedisClient) *AgentService {
	return &AgentService{db: db, redis: redis}
}

// GetAllAgents - Lấy danh sách Agents, đồng bộ trạng thái thực tế từ Redis
func (s *AgentService) GetAllAgents(page, pageSize int, status string) ([]models.Agent, int64, error) {
	var agents []models.Agent
	var total int64

	query := s.db.Model(&models.Agent{})
	
	if status != "" {
		query = query.Where("status = ?", status)
	}

	query.Count(&total)

	offset := (page - 1) * pageSize
	err := query.Order("last_heartbeat_at DESC").
		Offset(offset).Limit(pageSize).
		Find(&agents).Error

	if err != nil {
		return nil, 0, err
	}

	// Đồng bộ trạng thái thực tế từ Redis
	// Vì đôi khi server tắt đột ngột, DB vẫn lưu "online" nhưng Redis đã hết hạn
	ctx := context.Background()
	for i := range agents {
		isOnline, _ := s.redis.IsAgentOnline(ctx, agents[i].ID)
		if isOnline {
			agents[i].Status = "online"
		} else {
			agents[i].Status = "offline"
		}
	}

	return agents, total, nil
}

// GetAgentByID - Lấy chi tiết 1 Agent
func (s *AgentService) GetAgentByID(id string) (*models.Agent, error) {
	var agent models.Agent
	err := s.db.First(&agent, "id = ?", id).Error
	if err != nil {
		return nil, fmt.Errorf("không tìm thấy Agent '%s': %w", id, err)
	}

	// Cập nhật trạng thái từ Redis
	ctx := context.Background()
	isOnline, _ := s.redis.IsAgentOnline(ctx, id)
	if isOnline {
		agent.Status = "online"
	} else {
		agent.Status = "offline"
	}

	return &agent, nil
}
