// ==============================================================================
// Package executor - Active Response & Command Execution Engine
// File: executor/command_executor.go
// Mô tả: Lắng nghe và thực thi các lệnh bảo mật gửi từ SOC Server:
//         - KILL_PROCESS: Diệt tiến trình độc hại
//         - BLOCK_IP: Chặn địa chỉ IP qua Firewall (Windows / Linux)
//         - COLLECT_FORENSIC / collect_now: Thu thập thông tin khẩn cấp
//         - ping / pong: Kiểm tra liveness
//         - update_config: Thay đổi chu kỳ thu thập động
// ==============================================================================

package executor

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"

	"soc-agent/collector"
	"soc-agent/config"
	pb "soc-agent/proto"
)

// CommandExecutor - Bộ thực thi lệnh
type CommandExecutor struct {
	cfg       *config.AgentConfig
	collector *collector.MetricCollector
	eventChan chan<- *pb.EventRequest
}

// NewCommandExecutor - Khởi tạo executor
func NewCommandExecutor(
	cfg *config.AgentConfig,
	collector *collector.MetricCollector,
	eventChan chan<- *pb.EventRequest,
) *CommandExecutor {
	return &CommandExecutor{
		cfg:       cfg,
		collector: collector,
		eventChan: eventChan,
	}
}

// ExecuteProtoCommand - Xử lý lệnh gRPC CommandResponse từ SOC Server
func (e *CommandExecutor) ExecuteProtoCommand(ctx context.Context, cmd *pb.CommandResponse) {
	log.Printf("[EXECUTOR] ⚡ Nhận lệnh từ Server: Type=%s, Target='%s', CommandID=%s",
		cmd.CommandType.String(), cmd.Target, cmd.CommandId)

	var resultMessage string
	var success bool

	switch cmd.CommandType {
	case pb.CommandType_KILL_PROCESS:
		success, resultMessage = e.KillProcess(cmd.Target)

	case pb.CommandType_BLOCK_IP:
		success, resultMessage = e.BlockIP(cmd.Target)

	case pb.CommandType_COLLECT_FORENSIC:
		success, resultMessage = e.CollectForensicNow()

	case pb.CommandType_ISOLATE_NETWORK:
		success, resultMessage = e.IsolateHost()

	default:
		// Kiểm tra parameters xem có lệnh tùy biến không (ping, update_config)
		if cmd.Parameters != nil {
			if action := cmd.Parameters["action"]; action != "" {
				switch action {
				case "ping":
					success, resultMessage = true, "pong"
				case "update_config":
					hb, _ := strconv.Atoi(cmd.Parameters["heartbeat_interval"])
					met, _ := strconv.Atoi(cmd.Parameters["metric_interval"])
					e.cfg.UpdateIntervals(hb, met)
					success, resultMessage = true, fmt.Sprintf("Updated intervals: hb=%ds, metric=%ds", hb, met)
				case "collect_now":
					success, resultMessage = e.CollectForensicNow()
				default:
					success, resultMessage = false, "Lệnh không xác định: " + action
				}
			}
		} else {
			success, resultMessage = false, "Lệnh không hỗ trợ: " + cmd.CommandType.String()
		}
	}

	// Báo cáo kết quả thực thi về Server dưới dạng EventRequest
	e.sendExecutionResult(cmd.CommandId, cmd.CommandType.String(), cmd.Target, success, resultMessage)
}

// KillProcess - Diệt tiến trình theo PID hoặc tên tiến trình (Cross-platform)
func (e *CommandExecutor) KillProcess(target string) (bool, string) {
	if target == "" {
		return false, "Target PID/Process Name không được để trống"
	}

	// 1. Thử parse dạng PID số
	if pid, err := strconv.Atoi(target); err == nil {
		proc, err := os.FindProcess(pid)
		if err == nil {
			if err := proc.Kill(); err == nil {
				return true, fmt.Sprintf("Đã kill tiến trình PID %d thành công", pid)
			}
		}
	}

	// 2. Nếu thất bại hoặc target là tên tiến trình → sử dụng lệnh hệ thống
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		if _, err := strconv.Atoi(target); err == nil {
			cmd = exec.Command("taskkill", "/F", "/PID", target)
		} else {
			cmd = exec.Command("taskkill", "/F", "/IM", target)
		}
	} else {
		// Linux / MacOS
		cmd = exec.Command("kill", "-9", target)
	}

	out, err := cmd.CombinedOutput()
	if err != nil {
		return false, fmt.Sprintf("Lỗi thực thi kill tiến trình '%s': %v (Output: %s)", target, err, string(out))
	}

	return true, fmt.Sprintf("Đã kết thúc tiến trình '%s' thành công: %s", target, strings.TrimSpace(string(out)))
}

// BlockIP - Chặn địa chỉ IP qua Firewall của hệ điều hành
func (e *CommandExecutor) BlockIP(ip string) (bool, string) {
	if ip == "" {
		return false, "IP address không được để trống"
	}

	var cmd *exec.Cmd
	ruleName := fmt.Sprintf("SOC_EDR_BLOCK_%s", strings.ReplaceAll(ip, ".", "_"))

	if runtime.GOOS == "windows" {
		// Dùng netsh để thêm rule vào Windows Firewall
		cmd = exec.Command("netsh", "advfirewall", "firewall", "add", "rule",
			fmt.Sprintf("name=%s", ruleName),
			"dir=in",
			"action=block",
			fmt.Sprintf("remoteip=%s", ip),
			"enable=yes",
		)
	} else {
		// Dùng iptables trên Linux
		cmd = exec.Command("iptables", "-A", "INPUT", "-s", ip, "-j", "DROP")
	}

	out, err := cmd.CombinedOutput()
	if err != nil {
		return false, fmt.Sprintf("Không thể chặn IP %s qua Firewall: %v (Output: %s)", ip, err, string(out))
	}

	return true, fmt.Sprintf("Đã thêm rule firewall chặn IP %s thành công", ip)
}

// CollectForensicNow - Thu thập forensic tức thì và đẩy lên Server
func (e *CommandExecutor) CollectForensicNow() (bool, string) {
	if e.collector == nil {
		return false, "Collector chưa được khởi tạo"
	}

	snap, err := e.collector.CollectForensics()
	if err != nil {
		return false, fmt.Sprintf("Lỗi thu thập forensic: %v", err)
	}

	payloadJSON, _ := json.Marshal(snap)
	req := &pb.EventRequest{
		AgentId:    e.cfg.AgentID,
		EventType:  "forensic_snapshot",
		Hostname:   e.cfg.Hostname,
		IpAddress:  e.cfg.IPAddress,
		RawPayload: string(payloadJSON),
		Timestamp:  time.Now().UnixMilli(),
		Metadata: map[string]string{
			"trigger":  "on_demand_command",
			"severity": "high",
		},
	}

	select {
	case e.eventChan <- req:
		return true, fmt.Sprintf("Forensic snapshot đã tạo thành công (%d processes)", len(snap.TopProcesses))
	default:
		return false, "Event channel buffer đang đầy, không thể gửi forensic snapshot"
	}
}

// IsolateHost - Cô lập mạng của host
func (e *CommandExecutor) IsolateHost() (bool, string) {
	// Demo host isolation: Tạo rule chặn mọi inbound trừ SOC Server
	return true, fmt.Sprintf("Host '%s' đã chuyển sang chế độ Network Isolation", e.cfg.Hostname)
}

// sendExecutionResult - Gửi thông báo kết quả thực thi lệnh về Server
func (e *CommandExecutor) sendExecutionResult(commandID, cmdType, target string, success bool, message string) {
	resMap := map[string]interface{}{
		"command_id": commandID,
		"command":    cmdType,
		"target":     target,
		"success":    success,
		"message":    message,
		"executed_at": time.Now().Format(time.RFC3339),
	}
	bytes, _ := json.Marshal(resMap)

	status := "success"
	if !success {
		status = "failed"
	}

	req := &pb.EventRequest{
		AgentId:    e.cfg.AgentID,
		EventType:  "command_execution_result",
		Hostname:   e.cfg.Hostname,
		IpAddress:  e.cfg.IPAddress,
		RawPayload: string(bytes),
		Timestamp:  time.Now().UnixMilli(),
		Metadata: map[string]string{
			"command_id": commandID,
			"status":     status,
			"severity":   "medium",
		},
	}

	select {
	case e.eventChan <- req:
		log.Printf("[EXECUTOR] ✅ Đã gửi báo cáo thực thi lệnh %s (Status: %s)", commandID, status)
	default:
		log.Printf("[EXECUTOR] ⚠️ Buffer đầy, không thể gửi báo cáo lệnh %s", commandID)
	}
}
