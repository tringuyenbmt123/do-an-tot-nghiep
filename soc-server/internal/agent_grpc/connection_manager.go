// ==============================================================================
// Package agent_grpc - Connection Manager
// File: internal/agent_grpc/connection_manager.go
// Mô tả: Quản lý tất cả kết nối gRPC active từ các Agent.
//         Thread-safe bằng sync.RWMutex vì thao tác đọc (SendCommand, lookup)
//         nhiều hơn ghi (Register, Unregister).
//
// Chức năng chính:
//   - Register/Unregister Agent connections khi stream mở/đóng
//   - SendCommand(): Tra cứu Agent → đẩy lệnh vào channel → stream gửi xuống
//   - GetOnlineAgents(): Liệt kê các Agent đang kết nối
// ==============================================================================

package agent_grpc

import (
	"fmt"
	"log"
	"sync"

	pb "soc-server/internal/generated/proto"
)

// ActiveConnection - Đại diện cho 1 kết nối gRPC active từ Agent
type ActiveConnection struct {
	AgentID    string                          // UUID của Agent
	Hostname   string                          // Hostname Endpoint
	IPAddress  string                          // IP Address
	Stream     pb.AgentService_StreamEventsServer // gRPC bidirectional stream
	CmdChan    chan *pb.CommandResponse          // Channel để đẩy lệnh xuống Agent
	Done       chan struct{}                     // Channel báo hiệu kết nối đã đóng
}

// ConnectionManager - Quản lý tập trung tất cả Agent connections
// Thread-safe: Sử dụng RWMutex cho concurrent read access
type ConnectionManager struct {
	mu          sync.RWMutex                    // Mutex bảo vệ connections map
	connections map[string]*ActiveConnection     // Map: agentID → *ActiveConnection
}

// NewConnectionManager - Khởi tạo Connection Manager mới
func NewConnectionManager() *ConnectionManager {
	return &ConnectionManager{
		connections: make(map[string]*ActiveConnection),
	}
}

// Register - Đăng ký kết nối Agent mới khi stream mở
// Nếu Agent đã có kết nối cũ, đóng kết nối cũ trước (tránh duplicate)
func (cm *ConnectionManager) Register(conn *ActiveConnection) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	// Kiểm tra xem Agent đã có kết nối cũ chưa
	if oldConn, exists := cm.connections[conn.AgentID]; exists {
		log.Printf("[CONN MANAGER] ⚠️ Agent '%s' đã có kết nối cũ, đang đóng kết nối cũ...", conn.AgentID)
		close(oldConn.Done)    // Báo hiệu goroutine cũ dừng lại
	}

	// Đăng ký kết nối mới
	cm.connections[conn.AgentID] = conn
	log.Printf("[CONN MANAGER] ✅ Đã đăng ký Agent '%s' (%s - %s). Tổng: %d agents online",
		conn.AgentID, conn.Hostname, conn.IPAddress, len(cm.connections))
}

// Unregister - Hủy đăng ký khi Agent ngắt kết nối
func (cm *ConnectionManager) Unregister(agentID string) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	if conn, exists := cm.connections[agentID]; exists {
		close(conn.Done) // Đóng channel Done
		delete(cm.connections, agentID)
		log.Printf("[CONN MANAGER] 🔴 Agent '%s' đã ngắt kết nối. Tổng: %d agents online",
			agentID, len(cm.connections))
	}
}

// SendCommand - Gửi lệnh Active Response xuống Agent cụ thể
// Tra cứu Agent theo ID → đẩy command vào channel → goroutine stream gửi xuống
//
// Trả về error nếu Agent không online hoặc channel đầy
func (cm *ConnectionManager) SendCommand(agentID string, cmd *pb.CommandResponse) error {
	cm.mu.RLock()
	conn, exists := cm.connections[agentID]
	cm.mu.RUnlock()

	if !exists {
		return fmt.Errorf("Agent '%s' không online hoặc không có kết nối gRPC active", agentID)
	}

	// Đẩy command vào channel (non-blocking)
	select {
	case conn.CmdChan <- cmd:
		log.Printf("[CONN MANAGER] 📤 Đã gửi lệnh '%s' xuống Agent '%s' (target: %s)",
			cmd.CommandType.String(), agentID, cmd.Target)
		return nil
	default:
		return fmt.Errorf("command channel của Agent '%s' đã đầy, không thể gửi lệnh", agentID)
	}
}

// GetConnection - Lấy ActiveConnection theo Agent ID
func (cm *ConnectionManager) GetConnection(agentID string) (*ActiveConnection, bool) {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	conn, exists := cm.connections[agentID]
	return conn, exists
}

// GetOnlineAgentIDs - Lấy danh sách Agent ID đang online
func (cm *ConnectionManager) GetOnlineAgentIDs() []string {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	ids := make([]string, 0, len(cm.connections))
	for id := range cm.connections {
		ids = append(ids, id)
	}
	return ids
}

// GetOnlineCount - Đếm số Agent đang online
func (cm *ConnectionManager) GetOnlineCount() int {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	return len(cm.connections)
}

// IsAgentConnected - Kiểm tra Agent có đang kết nối gRPC không
func (cm *ConnectionManager) IsAgentConnected(agentID string) bool {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	_, exists := cm.connections[agentID]
	return exists
}
