// ==============================================================================
// Package rules - Rule Loader
// File: internal/rules/loader.go
// Mô tả: Tải Detection Rules từ 2 nguồn:
//         1. File YAML trong thư mục configs/rules/*.yaml
//         2. Database PostgreSQL (bảng rules)
//         Kết quả merge thành danh sách rules thống nhất cho Rule Engine.
// ==============================================================================

package rules

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"soc-server/internal/models"

	"gopkg.in/yaml.v3"
	"gorm.io/gorm"
)

// LoadedRule - Struct nội bộ chứa Rule đã parse sẵn conditions
// Dùng trong memory của Rule Engine để evaluate nhanh
type LoadedRule struct {
	ID               string                  // ID Rule
	Name             string                  // Tên Rule
	Severity         string                  // Mức độ: critical, high, medium, low
	EventType        string                  // Loại event áp dụng
	Description      string                  // Mô tả chi tiết
	MITRETactic      string                  // MITRE ATT&CK Tactic
	MITRETechniqueID string                  // MITRE ATT&CK Technique ID
	IsActive         bool                    // Trạng thái bật/tắt
	Source           string                  // Nguồn: "yaml_file" hoặc "database"
	Conditions       []models.RuleCondition  // Danh sách điều kiện đã parse
}

// LoadRulesFromYAML - Tải rules từ thư mục chứa file YAML
// Duyệt tất cả file *.yaml trong thư mục, parse mỗi file thành 1 Rule
func LoadRulesFromYAML(yamlDir string) ([]LoadedRule, error) {
	var rules []LoadedRule

	log.Printf("[RULE LOADER] Đang tải rules từ thư mục YAML: %s", yamlDir)

	// Tìm tất cả file .yaml trong thư mục
	pattern := filepath.Join(yamlDir, "*.yaml")
	files, err := filepath.Glob(pattern)
	if err != nil {
		return nil, fmt.Errorf("lỗi tìm file YAML trong '%s': %w", yamlDir, err)
	}

	if len(files) == 0 {
		log.Printf("[RULE LOADER] ⚠️ Không tìm thấy file YAML nào trong '%s'", yamlDir)
		return rules, nil
	}

	// Parse từng file YAML
	for _, filePath := range files {
		rule, err := parseYAMLFile(filePath)
		if err != nil {
			log.Printf("[RULE LOADER] ❌ Lỗi parse file '%s': %v", filePath, err)
			continue // Bỏ qua file lỗi, tiếp tục parse file khác
		}

		rules = append(rules, *rule)
		log.Printf("[RULE LOADER] ✅ Đã tải rule '%s' từ file %s", rule.ID, filepath.Base(filePath))
	}

	log.Printf("[RULE LOADER] Tổng cộng tải được %d rules từ YAML", len(rules))
	return rules, nil
}

// parseYAMLFile - Parse 1 file YAML thành LoadedRule
func parseYAMLFile(filePath string) (*LoadedRule, error) {
	// Đọc nội dung file
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("không thể đọc file: %w", err)
	}

	// Parse YAML thành struct RuleYAML
	var ruleYAML models.RuleYAML
	if err := yaml.Unmarshal(data, &ruleYAML); err != nil {
		return nil, fmt.Errorf("lỗi parse YAML: %w", err)
	}

	// Validate bắt buộc: ID, Name, EventType
	if ruleYAML.ID == "" || ruleYAML.Name == "" || ruleYAML.EventType == "" {
		return nil, fmt.Errorf("rule thiếu trường bắt buộc (id, name, event_type)")
	}

	// Chuyển đổi sang LoadedRule
	return &LoadedRule{
		ID:               ruleYAML.ID,
		Name:             ruleYAML.Name,
		Severity:         ruleYAML.Severity,
		EventType:        ruleYAML.EventType,
		Description:      ruleYAML.Description,
		MITRETactic:      ruleYAML.MITRETactic,
		MITRETechniqueID: ruleYAML.MITRETechniqueID,
		IsActive:         ruleYAML.IsActive,
		Source:           "yaml_file",
		Conditions:       ruleYAML.Conditions,
	}, nil
}

// LoadRulesFromDB - Tải rules từ database PostgreSQL
// Chỉ tải các rules có is_active = true
func LoadRulesFromDB(db *gorm.DB) ([]LoadedRule, error) {
	var dbRules []models.Rule
	var rules []LoadedRule

	log.Println("[RULE LOADER] Đang tải rules từ database...")

	// Query tất cả rules active từ database
	result := db.Where("is_active = ?", true).Find(&dbRules)
	if result.Error != nil {
		return nil, fmt.Errorf("lỗi query rules từ database: %w", result.Error)
	}

	// Parse conditions JSONB thành []RuleCondition cho mỗi rule
	for _, dbRule := range dbRules {
		var conditions []models.RuleCondition
		if dbRule.Conditions != "" && dbRule.Conditions != "[]" {
			if err := json.Unmarshal([]byte(dbRule.Conditions), &conditions); err != nil {
				log.Printf("[RULE LOADER] ❌ Lỗi parse conditions cho rule '%s': %v", dbRule.ID, err)
				continue
			}
		}

		rules = append(rules, LoadedRule{
			ID:               dbRule.ID,
			Name:             dbRule.Name,
			Severity:         dbRule.Severity,
			EventType:        dbRule.EventType,
			Description:      dbRule.Description,
			MITRETactic:      dbRule.MITRETactic,
			MITRETechniqueID: dbRule.MITRETechniqueID,
			IsActive:         dbRule.IsActive,
			Source:           "database",
			Conditions:       conditions,
		})
	}

	log.Printf("[RULE LOADER] Tổng cộng tải được %d rules từ database", len(rules))
	return rules, nil
}
