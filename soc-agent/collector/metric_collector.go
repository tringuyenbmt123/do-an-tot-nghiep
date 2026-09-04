// ==============================================================================
// Package collector - Real-time Metric Collector
// File: collector/metric_collector.go
// Mô tả: Thu thập số liệu hệ thống (CPU, RAM, Network I/O, Active Connections)
//         với footprint cực nhẹ (CPU < 1%, RAM < 20MB) bằng gopsutil.
// ==============================================================================

package collector

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"soc-agent/config"
	pb "soc-agent/proto"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/mem"
	netUtil "github.com/shirou/gopsutil/v3/net"
	"github.com/shirou/gopsutil/v3/process"
)

// SystemMetricSnapshot - Struct chứa snapshot toàn diện về tình trạng máy
type SystemMetricSnapshot struct {
	CPUUsagePercent    float64           `json:"cpu_usage_percent"`
	MemoryUsagePercent float64           `json:"memory_usage_percent"`
	MemoryUsedMB       uint64            `json:"memory_used_mb"`
	MemoryTotalMB      uint64            `json:"memory_total_mb"`
	BytesSent          uint64            `json:"bytes_sent"`
	BytesRecv          uint64            `json:"bytes_recv"`
	ActiveConnCount    int               `json:"active_connections_count"`
	TopProcesses       []ProcessSummary  `json:"top_processes,omitempty"`
	Timestamp          int64             `json:"timestamp"`
}

// ProcessSummary - Tóm tắt thông tin các tiến trình tiêu biểu
type ProcessSummary struct {
	PID        int32   `json:"pid"`
	Name       string  `json:"name"`
	CPUPercent float64 `json:"cpu_percent"`
	MemoryMB   uint64  `json:"memory_mb"`
}

// MetricCollector - Bộ thu thập metric định kỳ
type MetricCollector struct {
	cfg        *config.AgentConfig
	eventChan  chan<- *pb.EventRequest
	lastNetIO  *netUtil.IOCountersStat
	mu         sync.Mutex
}

// NewMetricCollector - Khởi tạo collector
func NewMetricCollector(cfg *config.AgentConfig, eventChan chan<- *pb.EventRequest) *MetricCollector {
	return &MetricCollector{
		cfg:       cfg,
		eventChan: eventChan,
	}
}

// Start - Chạy vòng lặp thu thập định kỳ
func (c *MetricCollector) Start(ctx context.Context) {
	log.Printf("[COLLECTOR] 🚀 Metric Collector đã khởi chạy (Interval: %v)", c.cfg.GetMetricInterval())

	for {
		interval := c.cfg.GetMetricInterval()
		select {
		case <-ctx.Done():
			log.Println("[COLLECTOR] 🛑 Metric Collector đã dừng an toàn.")
			return
		case <-time.After(interval):
			c.collectAndSend()
		}
	}
}

// CollectSnapshot - Lấy snapshot metric đầy đủ tức thì (dùng cho lệnh collect_now)
func (c *MetricCollector) CollectSnapshot() (*SystemMetricSnapshot, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	snap := &SystemMetricSnapshot{
		Timestamp: time.Now().UnixMilli(),
	}

	// 1. CPU Usage (0-interval query nhanh)
	cpuPercents, err := cpu.Percent(0, false)
	if err == nil && len(cpuPercents) > 0 {
		snap.CPUUsagePercent = cpuPercents[0]
	}

	// 2. RAM Usage
	vMem, err := mem.VirtualMemory()
	if err == nil {
		snap.MemoryUsagePercent = vMem.UsedPercent
		snap.MemoryUsedMB = vMem.Used / (1024 * 1024)
		snap.MemoryTotalMB = vMem.Total / (1024 * 1024)
	}

	// 3. Network I/O
	netIO, err := netUtil.IOCounters(false)
	if err == nil && len(netIO) > 0 {
		snap.BytesSent = netIO[0].BytesSent
		snap.BytesRecv = netIO[0].BytesRecv
	}

	// 4. Active Connections count
	conns, err := netUtil.Connections("all")
	if err == nil {
		snap.ActiveConnCount = len(conns)
	}

	return snap, nil
}

// CollectForensics - Thu thập danh sách Top 5 tiến trình (Forensic snapshot)
func (c *MetricCollector) CollectForensics() (*SystemMetricSnapshot, error) {
	snap, err := c.CollectSnapshot()
	if err != nil {
		return nil, err
	}

	procs, err := process.Processes()
	if err == nil {
		var list []ProcessSummary
		for _, p := range procs {
			name, _ := p.Name()
			cpuP, _ := p.CPUPercent()
			memInfo, _ := p.MemoryInfo()
			var memMB uint64
			if memInfo != nil {
				memMB = memInfo.RSS / (1024 * 1024)
			}

			if cpuP > 0.1 || memMB > 50 {
				list = append(list, ProcessSummary{
					PID:        p.Pid,
					Name:       name,
					CPUPercent: cpuP,
					MemoryMB:   memMB,
				})
			}
			if len(list) >= 10 {
				break
			}
		}
		snap.TopProcesses = list
	}

	return snap, nil
}

// collectAndSend - Thực thi thu thập và đóng gói thành EventRequest gửi vào Streamer Buffer
func (c *MetricCollector) collectAndSend() {
	snap, err := c.CollectSnapshot()
	if err != nil {
		return
	}

	payloadJSON, err := json.Marshal(snap)
	if err != nil {
		return
	}

	req := &pb.EventRequest{
		AgentId:    c.cfg.AgentID,
		EventType:  "system_metric",
		Hostname:   c.cfg.Hostname,
		IpAddress:  c.cfg.IPAddress,
		RawPayload: string(payloadJSON),
		Timestamp:  snap.Timestamp,
		Metadata: map[string]string{
			"cpu_usage": fmt.Sprintf("%.1f", snap.CPUUsagePercent),
			"mem_usage": fmt.Sprintf("%.1f", snap.MemoryUsagePercent),
			"severity":  "low",
		},
	}

	// Gửi non-blocking vào channel
	select {
	case c.eventChan <- req:
	default:
		// Drop metric if buffer full (Backpressure handling)
	}
}
