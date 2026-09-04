package monitor

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"time"

	"soc-agent/config"
	pb "soc-agent/proto"

	"github.com/shirou/gopsutil/v3/process"
)

// ProcessMonitor phát hiện process mới được khởi chạy trên endpoint.
type ProcessMonitor struct {
	cfg       *config.AgentConfig
	eventChan chan<- *pb.EventRequest
}

func NewProcessMonitor(cfg *config.AgentConfig, eventChan chan<- *pb.EventRequest) *ProcessMonitor {
	return &ProcessMonitor{cfg: cfg, eventChan: eventChan}
}

func (m *ProcessMonitor) Start(ctx context.Context) {
	interval := time.Duration(m.cfg.ProcessPollIntervalSec) * time.Second
	if interval <= 0 {
		interval = 5 * time.Second
	}
	previous := m.snapshot()
	log.Printf("[PROCESS] Process Monitor đã khởi chạy (Interval: %s)", interval)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			log.Println("[PROCESS] Process Monitor đã dừng.")
			return
		case <-ticker.C:
			current := m.snapshot()
			for pid, name := range current {
				if _, exists := previous[pid]; !exists {
					m.emit(pid, name)
				}
			}
			previous = current
		}
	}
}

func (m *ProcessMonitor) snapshot() map[int32]string {
	result := make(map[int32]string)
	processes, err := process.Processes()
	if err != nil {
		return result
	}
	for _, currentProcess := range processes {
		name, err := currentProcess.Name()
		if err == nil && !m.excluded(name) {
			result[currentProcess.Pid] = name
		}
	}
	return result
}

func (m *ProcessMonitor) excluded(name string) bool {
	for _, excludedName := range m.cfg.ProcessExcludeNames {
		if strings.EqualFold(name, excludedName) {
			return true
		}
	}
	return false
}

func (m *ProcessMonitor) emit(pid int32, name string) {
	raw, _ := json.Marshal(map[string]interface{}{
		"action":       "process_started",
		"pid":          pid,
		"process_name": name,
		"timestamp":    time.Now().Format(time.RFC3339),
	})
	request := &pb.EventRequest{
		AgentId: m.cfg.AgentID, EventType: "process_start", Hostname: m.cfg.Hostname,
		IpAddress: m.cfg.IPAddress, RawPayload: string(raw), Timestamp: time.Now().UnixMilli(),
		Metadata: map[string]string{"severity": "low", "process_name": name},
	}
	select {
	case m.eventChan <- request:
	default:
		log.Printf("[PROCESS] Bỏ qua event vì buffer đầy: %s", name)
	}
}
