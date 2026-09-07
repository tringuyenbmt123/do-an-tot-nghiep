// ==============================================================================
// Package services - Alert Service
// File: internal/services/alert_service.go
// Mô tả: Business logic cho Alert management.
//         Cung cấp các thao tác CRUD, filter, và lifecycle transitions.
// ==============================================================================

package services

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"soc-server/internal/models"
	"soc-server/pkg/database"

	"gorm.io/gorm"
)

// AlertService - Service xử lý business logic cho Alerts
type AlertService struct {
	db    *gorm.DB
	redis *database.RedisClient
}

func stringPointer(value string) *string {
	return &value
}

// DefaultAgents returns a small set of demo agents so the dashboard looks populated immediately.
func DefaultAgents() []models.Agent {
	return []models.Agent{
		{
			ID:                  "agent-demo-win-01",
			Hostname:            "WIN-CLIENT-01",
			IPAddress:           "10.0.0.21",
			OSType:              "windows",
			Status:              "online",
			LastHeartbeatAt:     &[]time.Time{time.Now().Add(-2 * time.Minute)}[0],
			MTLSCertFingerprint: stringPointer("demo-win-01-cert"),
			AgentVersion:        "1.4.2",
		},
		{
			ID:                  "agent-demo-linux-01",
			Hostname:            "LINUX-SRV-07",
			IPAddress:           "10.0.0.42",
			OSType:              "linux",
			Status:              "online",
			LastHeartbeatAt:     &[]time.Time{time.Now().Add(-3 * time.Minute)}[0],
			MTLSCertFingerprint: stringPointer("demo-linux-01-cert"),
			AgentVersion:        "1.4.2",
		},
	}
}

// DefaultAlerts returns demo SOC alerts for first-run dashboard rendering.
func DefaultAlerts() []models.Alert {
	return []models.Alert{
		{
			ID:               "alert-demo-001",
			AgentID:          "agent-demo-win-01",
			RuleID:           "RULE-POWERSHELL-ENCODED",
			EventType:        models.EventSuspiciousProcess,
			Severity:         models.SeverityHigh,
			Status:           models.AlertStatusNew,
			Title:            "PowerShell encoded command execution",
			Description:      "PowerShell executed an encoded payload with suspicious flags commonly used by malware loaders.",
			MITRETactic:      "Execution",
			MITRETechniqueID: "T1059.001",
			RawPayload:       `{"process_name":"powershell.exe","command_line":"powershell -EncodedCommand JABjAGwAaQBlAG4...","host":"WIN-CLIENT-01"}`,
		},
		{
			ID:               "alert-demo-002",
			AgentID:          "agent-demo-linux-01",
			RuleID:           "RULE-RANSOMWARE-VSS",
			EventType:        models.EventNetworkAnomaly,
			Severity:         models.SeverityCritical,
			Status:           models.AlertStatusInProgress,
			Title:            "Shadow copy deletion attempt",
			Description:      "Endpoint attempted to delete local shadow copies in a pattern consistent with ransomware behavior.",
			MITRETactic:      "Impact",
			MITRETechniqueID: "T1490",
			RawPayload:       `{"process_name":"vssadmin.exe","command_line":"vssadmin.exe shadow delete /all /quiet","host":"LINUX-SRV-07"}`,
		},
		{
			ID:               "alert-demo-003",
			AgentID:          "agent-demo-win-01",
			RuleID:           "RULE-NETWORK-C2",
			EventType:        models.EventNetworkAnomaly,
			Severity:         models.SeverityMedium,
			Status:           models.AlertStatusResolved,
			Title:            "Outbound suspicious connection",
			Description:      "New outbound TCP connection to an external IP outside the known internal subnets.",
			MITRETactic:      "Command and Control",
			MITRETechniqueID: "T1071",
			RawPayload:       `{"dst_ip":"185.220.101.182","protocol":"tcp","host":"WIN-CLIENT-01"}`,
		},
	}
}

// NewAlertService - Khởi tạo AlertService
func NewAlertService(db *gorm.DB, redis *database.RedisClient) *AlertService {
	return &AlertService{db: db, redis: redis}
}

// GetAllAlerts - Lấy danh sách tất cả alerts với phân trang
// Hỗ trợ filter theo severity, status, event_type, agent_id
func (s *AlertService) GetAllAlerts(page, pageSize int, filters map[string]string) ([]models.Alert, int64, error) {
	var alerts []models.Alert
	var total int64

	query := s.db.Model(&models.Alert{})
	// system_metric là telemetry định kỳ, không phải security alert trên dashboard.
	query = query.Where("event_type <> ?", "system_metric")

	// Áp dụng filters
	if severity, ok := filters["severity"]; ok && severity != "" {
		query = query.Where("severity = ?", severity)
	}
	if status, ok := filters["status"]; ok && status != "" {
		query = query.Where("status = ?", status)
	}
	if eventType, ok := filters["event_type"]; ok && eventType != "" {
		query = query.Where("event_type = ?", eventType)
	}
	if agentID, ok := filters["agent_id"]; ok && agentID != "" {
		query = query.Where("agent_id = ?", agentID)
	}

	// Đếm tổng số records
	query.Count(&total)

	// Phân trang và sắp xếp theo thời gian mới nhất
	offset := (page - 1) * pageSize
	err := query.Order("created_at DESC").
		Offset(offset).Limit(pageSize).
		Preload("Agent"). // Preload thông tin Agent
		Find(&alerts).Error

	return alerts, total, err
}

// GetAlertByID - Lấy alert theo ID
func (s *AlertService) GetAlertByID(id string) (*models.Alert, error) {
	var alert models.Alert
	err := s.db.Preload("Agent").First(&alert, "id = ?", id).Error
	if err != nil {
		return nil, fmt.Errorf("không tìm thấy Alert '%s': %w", id, err)
	}
	return &alert, nil
}

// CreateAlert - Tạo alert mới
func (s *AlertService) CreateAlert(alert *models.Alert) error {
	return s.db.Create(alert).Error
}

// UpdateAlertStatus - Cập nhật trạng thái Alert (dùng nội bộ)
func (s *AlertService) UpdateAlertStatus(id string, status models.AlertStatus) error {
	result := s.db.Model(&models.Alert{}).Where("id = ?", id).Update("status", status)
	if result.RowsAffected == 0 {
		return fmt.Errorf("không tìm thấy Alert '%s'", id)
	}
	return result.Error
}

// UpdateAlertStatusWithContext - Cập nhật trạng thái + context từ n8n SOAR
// Description: kết quả xử lý SOAR (markdown)
// Tags: nhãn phân loại (ai-decision, auto-blocked, soar...)
func (s *AlertService) UpdateAlertStatusWithContext(id string, status models.AlertStatus, description string, tags []string) error {
	updates := map[string]interface{}{
		"status": status,
	}
	if description != "" {
		updates["description"] = description
	}
	// Tags lưu dưới dạng JSON string trong description nếu model chưa có cột tags riêng
	// Nếu bạn muốn lưu tags riêng, thêm cột tags VARCHAR vào model Alert

	result := s.db.Model(&models.Alert{}).Where("id = ?", id).Updates(updates)
	if result.RowsAffected == 0 {
		return fmt.Errorf("không tìm thấy Alert '%s'", id)
	}
	return result.Error
}

// GetAlertStats - Thống kê alerts cho Dashboard
func (s *AlertService) GetAlertStats() (map[string]interface{}, error) {
	stats := make(map[string]interface{})
	ctx := context.Background()

	// Tổng số alert trong 24h
	start24h := time.Now().Add(-24 * time.Hour)
	var totalAlertsToday int64
	s.db.Model(&models.Alert{}).Where("created_at >= ?", start24h).Count(&totalAlertsToday)
	stats["total_alerts_today"] = totalAlertsToday

	// Alert critical trong 24h
	var criticalAlerts int64
	s.db.Model(&models.Alert{}).Where("severity = ? AND created_at >= ?", models.SeverityCritical, start24h).Count(&criticalAlerts)
	stats["critical_alerts"] = criticalAlerts

	// Tổng agent / online agent
	var agentsTotal int64
	s.db.Model(&models.Agent{}).Count(&agentsTotal)
	stats["agents_total"] = agentsTotal

	agentsOnline := int64(0)
	if s.redis != nil {
		var agentIDs []string
		if err := s.db.Model(&models.Agent{}).Pluck("id", &agentIDs).Error; err == nil {
			for _, agentID := range agentIDs {
				isOnline, err := s.redis.IsAgentOnline(ctx, agentID)
				if err == nil && isOnline {
					agentsOnline++
				}
			}
		}
	} else {
		s.db.Model(&models.Agent{}).Where("status = ?", "online").Count(&agentsOnline)
	}
	stats["agents_online"] = agentsOnline

	// Active cases
	var activeCases int64
	s.db.Model(&models.Case{}).Where("status != ? AND status != ?", models.CaseStatusClosed, models.CaseStatusRejected).Count(&activeCases)
	stats["active_cases"] = activeCases

	// Alert trend last 24h — 1 query duy nhất thay vì 72 queries
	type HourlyRow struct {
		Hour     string
		Severity string
		Count    int64
	}
	var rows []HourlyRow
	start24h2 := time.Now().Add(-24 * time.Hour)

	// MySQL: DATE_FORMAT + GROUP BY để đếm theo giờ xá severity
	s.db.Raw(`
		SELECT DATE_FORMAT(created_at, '%H:00') AS hour,
		       severity,
		       COUNT(*) AS count
		FROM alerts
		WHERE created_at >= ?
		  AND severity IN ('critical','high','medium')
		GROUP BY hour, severity
		ORDER BY hour ASC
	`, start24h2).Scan(&rows)

	// Chuyển kết quả thành map[hour][severity]=count
	hourMap := make(map[string]map[string]int64)
	for _, r := range rows {
		if _, ok := hourMap[r.Hour]; !ok {
			hourMap[r.Hour] = map[string]int64{"critical": 0, "high": 0, "medium": 0}
		}
		hourMap[r.Hour][r.Severity] = r.Count
	}

	// Tạo chuỗi 24 slots theo thứ tự thời gian
	alertTrend := make([]map[string]interface{}, 0, 24)
	for i := 23; i >= 0; i-- {
		hourLabel := time.Now().Add(-time.Duration(i+1) * time.Hour).Truncate(time.Hour).Format("15:00")
		counts := hourMap[hourLabel]
		alertTrend = append(alertTrend, map[string]interface{}{
			"hour":     hourLabel,
			"critical": counts["critical"],
			"high":     counts["high"],
			"medium":   counts["medium"],
		})
	}
	stats["alert_trend"] = alertTrend

	// Severity distribution
	severityMap := map[string]int64{}
	for _, severity := range []models.AlertSeverity{models.SeverityCritical, models.SeverityHigh, models.SeverityMedium, models.SeverityLow} {
		var count int64
		s.db.Model(&models.Alert{}).Where("severity = ?", severity).Count(&count)
		severityMap[string(severity)] = count
	}
	severityDistribution := []map[string]interface{}{
		{"name": "Critical", "value": severityMap[string(models.SeverityCritical)], "color": "#ff3366"},
		{"name": "High", "value": severityMap[string(models.SeverityHigh)], "color": "#ff9900"},
		{"name": "Medium", "value": severityMap[string(models.SeverityMedium)], "color": "#eab308"},
		{"name": "Low", "value": severityMap[string(models.SeverityLow)], "color": "#60a5fa"},
	}
	stats["severity_distribution"] = severityDistribution

	// Top affected agents
	type TopAgent struct {
		Hostname   string
		AlertCount int64
	}
	var topAgents []TopAgent
	s.db.Model(&models.Alert{}).Select("agents.hostname as hostname, count(*) as alert_count").
		Joins("LEFT JOIN agents ON agents.id = alerts.agent_id").
		Group("alerts.agent_id").
		Order("alert_count DESC").
		Limit(5).Scan(&topAgents)
	formattedTopAgents := make([]map[string]interface{}, 0, len(topAgents))
	for _, agent := range topAgents {
		formattedTopAgents = append(formattedTopAgents, map[string]interface{}{
			"hostname":    strings.TrimSpace(agent.Hostname),
			"alert_count": agent.AlertCount,
		})
	}
	stats["top_agents"] = formattedTopAgents

	// Preserve legacy keys used elsewhere in other code
	stats["total"] = totalAlertsToday
	stats["by_severity"] = severityMap
	stats["by_status"] = map[string]int64{"new": 0, "in_progress": 0, "resolved": 0}

	log.Printf("[ALERT SERVICE] Dashboard stats: totalAlertsToday=%d, agentsOnline=%d/%d, activeCases=%d", totalAlertsToday, agentsOnline, agentsTotal, activeCases)
	return stats, nil
}

// ==============================================================================
// StartAlertCleanupJob - Job tự động dọn dẹp Alert cũ (chạy background goroutine)
//
// Logic:
//   - Chạy mỗi 24 giờ một lần
//   - Xóa Alert có severity = 'low' hoặc rule_id = 'EVENT-OBSERVED'
//     nếu created_at cũ hơn retentionDays ngày
//   - Alert HIGH/CRITICAL/MEDIUM được giữ lại vĩnh viễn
//
// Gọi hàm này một lần trong main() với `go alertService.StartAlertCleanupJob(ctx, retentionDays)`
// ==============================================================================
func (s *AlertService) StartAlertCleanupJob(ctx context.Context, retentionDays int) {
	if retentionDays <= 0 {
		retentionDays = 7
	}
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()

	log.Printf("[CLEANUP JOB] 🧹 Khởi động Alert Cleanup Job: xóa LOW alerts cũ hơn %d ngày", retentionDays)

	// Chạy ngay lần đầu khi khởi động
	s.runCleanup(retentionDays)

	for {
		select {
		case <-ticker.C:
			s.runCleanup(retentionDays)
		case <-ctx.Done():
			log.Println("[CLEANUP JOB] Dừng Alert Cleanup Job.")
			return
		}
	}
}

// runCleanup - Thực hiện xóa một lần
func (s *AlertService) runCleanup(retentionDays int) {
	cutoff := time.Now().AddDate(0, 0, -retentionDays)
	result := s.db.Where(
		"(severity = ? OR rule_id = ?) AND created_at < ?",
		string(models.SeverityLow), "EVENT-OBSERVED", cutoff,
	).Delete(&models.Alert{})

	if result.Error != nil {
		log.Printf("[CLEANUP JOB] ❌ Lỗi khi dọn dẹp alert cũ: %v", result.Error)
		return
	}
	if result.RowsAffected > 0 {
		log.Printf("[CLEANUP JOB] ✅ Đã xóa %d LOW/EVENT-OBSERVED alerts cũ hơn %d ngày",
			result.RowsAffected, retentionDays)
	}
}
