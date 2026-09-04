// ==============================================================================
// Package websocket - WebSocket Hub
// File: internal/api/websocket/hub.go
// Mô tả: WebSocket Hub pattern quản lý tất cả WebSocket clients kết nối.
//         Broadcast sự kiện real-time (Alert mới, Case update) tới Frontend.
//
// Pattern:
//   Hub goroutine chạy vĩnh viễn, lắng nghe 3 channels:
//   - RegisterChan: Client mới kết nối → thêm vào map
//   - UnregisterChan: Client ngắt kết nối → xóa khỏi map
//   - BroadcastChan: Có event mới → gửi JSON tới TẤT CẢ clients
//
// Sử dụng:
//   hub := websocket.NewHub()
//   go hub.Run()  // Chạy trong goroutine riêng
//   hub.BroadcastAlert(alert)  // Gọi từ bất kỳ đâu
// ==============================================================================

package websocket

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// ==============================================================================
// Constants & Config
// ==============================================================================

const (
	// Thời gian tối đa chờ ghi message cho client
	writeWait = 10 * time.Second
	// Thời gian tối đa chờ đọc pong từ client
	pongWait = 60 * time.Second
	// Tần suất gửi ping cho client (phải < pongWait)
	pingPeriod = (pongWait * 9) / 10
	// Kích thước tối đa message nhận từ client
	maxMessageSize = 1024
)

// upgrader - Cấu hình upgrade HTTP → WebSocket
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// Cho phép mọi origin kết nối (dev mode - production nên restrict)
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// ==============================================================================
// WebSocket Event Types - Các loại sự kiện broadcast qua WebSocket
// ==============================================================================

// WSEvent - Cấu trúc message gửi qua WebSocket
type WSEvent struct {
	Type    string      `json:"type"`    // Loại sự kiện: "new_alert", "case_update", "agent_status"
	Payload interface{} `json:"payload"` // Dữ liệu kèm theo
	Time    string      `json:"time"`    // Timestamp sự kiện
}

// ==============================================================================
// Client - Đại diện cho 1 WebSocket client đang kết nối
// ==============================================================================

// Client - Mỗi client là 1 frontend browser tab kết nối WebSocket
type Client struct {
	hub  *Hub            // Reference tới Hub
	conn *websocket.Conn  // WebSocket connection
	send chan []byte       // Channel buffer messages cần gửi cho client
}

// ==============================================================================
// Hub - Trung tâm quản lý tất cả WebSocket clients
// ==============================================================================

// Hub - WebSocket Hub quản lý connections và broadcast
type Hub struct {
	mu             sync.RWMutex       // Mutex bảo vệ clients map
	clients        map[*Client]bool    // Map lưu tất cả clients đang kết nối
	RegisterChan   chan *Client         // Channel đăng ký client mới
	UnregisterChan chan *Client         // Channel hủy đăng ký client
	BroadcastChan  chan []byte          // Channel broadcast message tới tất cả clients
}

// NewHub - Khởi tạo Hub mới
func NewHub() *Hub {
	return &Hub{
		clients:        make(map[*Client]bool),
		RegisterChan:   make(chan *Client),
		UnregisterChan: make(chan *Client),
		BroadcastChan:  make(chan []byte, 256), // Buffer 256 messages
	}
}

// Run - Goroutine chính của Hub, chạy vĩnh viễn
// Lắng nghe 3 channels: register, unregister, broadcast
func (h *Hub) Run() {
	log.Println("[WEBSOCKET HUB] 🚀 WebSocket Hub đang chạy...")
	for {
		select {
		case client := <-h.RegisterChan:
			// Client mới kết nối
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			log.Printf("[WEBSOCKET HUB] 🟢 Client mới kết nối. Tổng: %d clients", h.GetClientCount())

		case client := <-h.UnregisterChan:
			// Client ngắt kết nối
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()
			log.Printf("[WEBSOCKET HUB] 🔴 Client ngắt kết nối. Tổng: %d clients", h.GetClientCount())

		case message := <-h.BroadcastChan:
			// Broadcast message tới tất cả clients
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.send <- message:
					// Gửi thành công
				default:
					// Channel đầy → client chậm → ngắt kết nối client
					close(client.send)
					delete(h.clients, client)
				}
			}
			h.mu.RUnlock()
		}
	}
}

// GetClientCount - Đếm số clients đang kết nối
func (h *Hub) GetClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// ==============================================================================
// Broadcast Helper Functions - Gửi sự kiện tới Frontend
// ==============================================================================

// BroadcastJSON - Broadcast một object bất kỳ dưới dạng JSON
func (h *Hub) BroadcastJSON(eventType string, payload interface{}) {
	event := WSEvent{
		Type:    eventType,
		Payload: payload,
		Time:    time.Now().Format(time.RFC3339),
	}

	data, err := json.Marshal(event)
	if err != nil {
		log.Printf("[WEBSOCKET HUB] ❌ Lỗi marshal JSON để broadcast: %v", err)
		return
	}

	h.BroadcastChan <- data
}

// BroadcastAlert - Broadcast Alert mới tới tất cả Frontend clients
func (h *Hub) BroadcastAlert(alert interface{}) {
	h.BroadcastJSON("new_alert", alert)
}

// BroadcastCaseUpdate - Broadcast cập nhật Case tới Frontend
func (h *Hub) BroadcastCaseUpdate(caseData interface{}) {
	h.BroadcastJSON("case_update", caseData)
}

// BroadcastAgentStatus - Broadcast thay đổi trạng thái Agent
func (h *Hub) BroadcastAgentStatus(agentStatus interface{}) {
	h.BroadcastJSON("agent_status", agentStatus)
}

// ==============================================================================
// HandleWebSocket - HTTP Handler upgrade connection lên WebSocket
// Gắn vào Gin router: router.GET("/ws/alerts", hub.HandleWebSocket)
// ==============================================================================

// HandleWebSocket - Xử lý request upgrade HTTP → WebSocket
func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Upgrade HTTP connection lên WebSocket
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WEBSOCKET HUB] ❌ Lỗi upgrade WebSocket: %v", err)
		return
	}

	// Tạo client mới
	client := &Client{
		hub:  h,
		conn: conn,
		send: make(chan []byte, 256),
	}

	// Đăng ký client vào Hub
	h.RegisterChan <- client

	// Khởi chạy 2 goroutines cho client: đọc (readPump) và ghi (writePump)
	go client.writePump()
	go client.readPump()
}

// ==============================================================================
// Client Goroutines
// ==============================================================================

// readPump - Goroutine đọc messages từ WebSocket client
// Chủ yếu để xử lý ping/pong và phát hiện disconnect
func (c *Client) readPump() {
	defer func() {
		c.hub.UnregisterChan <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		// Đọc message từ client (blocking)
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err,
				websocket.CloseGoingAway,
				websocket.CloseAbnormalClosure,
				websocket.CloseNormalClosure,
			) {
				log.Printf("[WEBSOCKET] ⚠️ WebSocket close error: %v", err)
			}
			break
		}
		// Hiện tại không xử lý message từ client
		// Có thể mở rộng để nhận filter/subscription requests
	}
}

// writePump - Goroutine ghi messages xuống WebSocket client
// Nhận messages từ channel send và gửi qua WebSocket
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub đã đóng channel → gửi close message
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			// Gửi message qua WebSocket
			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// Gom thêm messages đang chờ trong channel (batch send)
			n := len(c.send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			// Gửi ping định kỳ để giữ connection alive
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
