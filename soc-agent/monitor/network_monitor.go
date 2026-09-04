package monitor

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"soc-agent/config"
	pb "soc-agent/proto"

	netutil "github.com/shirou/gopsutil/v3/net"
)

// NetworkMonitor phát hiện các kết nối mạng mới trên endpoint.
type NetworkMonitor struct {
	cfg       *config.AgentConfig
	eventChan chan<- *pb.EventRequest
}

func NewNetworkMonitor(cfg *config.AgentConfig, eventChan chan<- *pb.EventRequest) *NetworkMonitor {
	return &NetworkMonitor{cfg: cfg, eventChan: eventChan}
}

func (m *NetworkMonitor) Start(ctx context.Context) {
	interval := time.Duration(m.cfg.NetworkPollIntervalSec) * time.Second
	if interval <= 0 {
		interval = 10 * time.Second
	}
	previous := m.snapshot()
	log.Printf("[NETWORK] Network Monitor đã khởi chạy (Interval: %s)", interval)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			log.Println("[NETWORK] Network Monitor đã dừng.")
			return
		case <-ticker.C:
			current := m.snapshot()
			for connection := range current {
				if !previous[connection] {
					m.emit(connection)
				}
			}
			previous = current
		}
	}
}

func (m *NetworkMonitor) snapshot() map[string]bool {
	result := make(map[string]bool)
	connections, err := netutil.Connections("all")
	if err != nil {
		return result
	}
	for _, connection := range connections {
		key := fmt.Sprintf("%d:%s:%d:%s:%d", connection.Type, connection.Laddr.IP, connection.Laddr.Port, connection.Raddr.IP, connection.Raddr.Port)
		result[key] = true
	}
	return result
}

func (m *NetworkMonitor) emit(connection string) {
	raw, _ := json.Marshal(map[string]interface{}{
		"action":     "connection_opened",
		"connection": connection,
		"timestamp":  time.Now().Format(time.RFC3339),
	})
	request := &pb.EventRequest{
		AgentId: m.cfg.AgentID, EventType: "network_connection", Hostname: m.cfg.Hostname,
		IpAddress: m.cfg.IPAddress, RawPayload: string(raw), Timestamp: time.Now().UnixMilli(),
		Metadata: map[string]string{"severity": "low"},
	}
	select {
	case m.eventChan <- request:
	default:
		log.Printf("[NETWORK] Bỏ qua event vì buffer đầy")
	}
}
