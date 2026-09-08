// ==============================================================================
// Package services - Rule Service
// File: internal/services/rule_service.go
// Mô tả: Business logic cho Detection Rules management.
//         Quản lý Rule trong database và gọi trigger hot-reload Rule Engine.
// ==============================================================================

package services

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"soc-server/internal/models"
	"soc-server/internal/rules"

	"gorm.io/gorm"
)

// DefaultRules returns a set of starter SOC detection rules that are useful for demo and admin usage.
func DefaultRules() []models.Rule {
	return []models.Rule{
		{
			ID:               "RULE-POWERSHELL-ENCODED",
			Name:             "PowerShell Encoded Command Execution",
			Severity:         "high",
			EventType:        "process_creation",
			Conditions:       `[{"field":"process_name","operator":"equals","value":"powershell.exe"},{"field":"command_line","operator":"contains","value":"-EncodedCommand"}]`,
			MITRETactic:      "Execution",
			MITRETechniqueID: "T1059.001",
			Description:      "Detects PowerShell commands executed with encoded payloads, often used for script obfuscation.",
			IsActive:         true,
			Source:           "database",
		},
		{
			ID:               "RULE-RANSOMWARE-VSS",
			Name:             "Ransomware VSS Shadow Delete Activity",
			Severity:         "critical",
			EventType:        "command_execution",
			Conditions:       `[{"field":"process_name","operator":"in","value":"vssadmin.exe"},{"field":"command_line","operator":"contains","value":"shadow delete"}]`,
			MITRETactic:      "Impact",
			MITRETechniqueID: "T1490",
			Description:      "Flags attempts to delete volume shadow copies, a common ransomware behavior.",
			IsActive:         true,
			Source:           "database",
		},
		{
			ID:               "RULE-NETWORK-C2",
			Name:             "Outbound C2 Communication Pattern",
			Severity:         "medium",
			EventType:        "network_connection",
			Conditions:       `[{"field":"dst_ip","operator":"not_equals","value":"10.0.0.0/8"},{"field":"protocol","operator":"equals","value":"tcp"}]`,
			MITRETactic:      "Command and Control",
			MITRETechniqueID: "T1071",
			Description:      "Looks for suspicious outbound connections outside the internal network segmentation.",
			IsActive:         true,
			Source:           "database",
		},
	}
}

// RuleService - Service xử lý business logic cho Detection Rules
type RuleService struct {
	db         *gorm.DB
	ruleEngine *rules.RuleEngine
}

// NewRuleService - Khởi tạo RuleService
func NewRuleService(db *gorm.DB, ruleEngine *rules.RuleEngine) *RuleService {
	return &RuleService{
		db:         db,
		ruleEngine: ruleEngine,
	}
}

// GetAllRules - Lấy toàn bộ danh sách rules từ Database
func (s *RuleService) GetAllRules() ([]models.Rule, error) {
	var dbRules []models.Rule
	err := s.db.Order("created_at DESC").Find(&dbRules).Error
	return dbRules, err
}

// CreateRule - Thêm Rule mới vào database và Hot-reload Engine
func (s *RuleService) CreateRule(rule *models.Rule) error {
	if rule.Source == "" {
		rule.Source = "database"
	}
	if rule.ID == "" {
		rule.ID = fmt.Sprintf("RULE-%d", time.Now().UnixNano())
	}

	// Validate JSONB conditions
	if !isValidJSON(rule.Conditions) {
		return fmt.Errorf("conditions không phải là JSON hợp lệ")
	}

	if err := s.db.Create(rule).Error; err != nil {
		return err
	}

	log.Printf("[RULE SERVICE] Đã tạo Rule mới trong DB: '%s'. Kích hoạt Hot-reload...", rule.ID)
	return s.ruleEngine.ReloadRules()
}

// ToggleRule - Bật/tắt 1 Rule (IsActive) trong DB và Hot-reload
func (s *RuleService) ToggleRule(id string, isActive bool) error {
	result := s.db.Model(&models.Rule{}).Where("id = ?", id).Update("is_active", isActive)
	if result.RowsAffected == 0 {
		return fmt.Errorf("không tìm thấy Rule '%s' trong Database", id)
	}
	if result.Error != nil {
		return result.Error
	}

	log.Printf("[RULE SERVICE] Rule '%s' chuyển trạng thái active=%v. Kích hoạt Hot-reload...", id, isActive)
	return s.ruleEngine.ReloadRules()
}

// UpdateRule - Cập nhật Rule trong DB (nếu chưa có trong DB sẽ tự động tạo mới)
func (s *RuleService) UpdateRule(id string, rule *models.Rule) error {
	if rule == nil {
		return fmt.Errorf("rule không được null")
	}
	if !isValidJSON(rule.Conditions) {
		return fmt.Errorf("conditions không phải là JSON hợp lệ")
	}
	if rule.ID == "" {
		rule.ID = id
	}

	var existing models.Rule
	err := s.db.Where("id = ?", id).First(&existing).Error
	if err != nil {
		// Nếu chưa có trong DB -> tạo mới
		if rule.Source == "" {
			rule.Source = "database"
		}
		if err := s.db.Create(rule).Error; err != nil {
			return err
		}
	} else {
		// Đã có -> Cập nhật
		updates := map[string]interface{}{
			"name":               rule.Name,
			"severity":           rule.Severity,
			"event_type":         rule.EventType,
			"conditions":         rule.Conditions,
			"mitre_tactic":       rule.MITRETactic,
			"mitre_technique_id": rule.MITRETechniqueID,
			"description":        rule.Description,
			"is_active":          rule.IsActive,
		}
		if rule.Source != "" {
			updates["source"] = rule.Source
		}
		if err := s.db.Model(&existing).Updates(updates).Error; err != nil {
			return err
		}
	}

	log.Printf("[RULE SERVICE] Đã cập nhật Rule '%s'. Kích hoạt Hot-reload...", id)
	return s.ruleEngine.ReloadRules()
}

func (s *RuleService) DeleteRule(id string) error {
	result := s.db.Where("id = ?", id).Delete(&models.Rule{})
	if result.RowsAffected == 0 {
		return fmt.Errorf("không tìm thấy Rule '%s' trong DB", id)
	}
	if result.Error != nil {
		return result.Error
	}
	return s.ruleEngine.ReloadRules()
}

// Helper kiểm tra JSON hợp lệ
func isValidJSON(s string) bool {
	var js json.RawMessage
	return json.Unmarshal([]byte(s), &js) == nil
}
