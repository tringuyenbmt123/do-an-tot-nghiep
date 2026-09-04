// ==============================================================================
// Package rules - Detection Rule Engine
// File: internal/rules/engine.go
// Mô tả: Bộ máy phát hiện mối đe dọa (Detection Engine).
//         - Giữ danh sách rules trong memory (protected by RWMutex).
//         - Hàm EvaluateLog() đối chiếu mỗi event log với tất cả rules.
//         - Hỗ trợ hot-reload: thêm/sửa rule mà không cần restart server.
//
// Luồng xử lý:
//   gRPC nhận Event → EvaluateLog(rawLog) → Match Rule? → Tạo Alert
// ==============================================================================

package rules

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"soc-server/internal/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// RuleEngine - Bộ máy phát hiện mối đe dọa
// Thread-safe: sử dụng RWMutex vì thao tác đọc (evaluate) nhiều hơn ghi (reload)
type RuleEngine struct {
	mu       sync.RWMutex   // Mutex bảo vệ rules slice
	rules    []LoadedRule    // Danh sách rules đang active trong memory
	db       *gorm.DB       // Database connection (cho reload từ DB)
	yamlDir  string         // Đường dẫn thư mục YAML rules
	loadFromDB bool         // Có tải rules từ DB không
}

// NewRuleEngine - Khởi tạo Rule Engine mới
// Tự động tải rules từ YAML + Database khi khởi tạo
func NewRuleEngine(db *gorm.DB, yamlDir string, loadFromDB bool) (*RuleEngine, error) {
	engine := &RuleEngine{
		db:         db,
		yamlDir:    yamlDir,
		loadFromDB: loadFromDB,
	}

	// Tải rules lần đầu khi khởi động server
	if err := engine.LoadAllRules(); err != nil {
		return nil, fmt.Errorf("lỗi khởi tạo Rule Engine: %w", err)
	}

	return engine, nil
}

// LoadAllRules - Tải toàn bộ rules từ YAML files và Database
// Merge kết quả: rules từ YAML ưu tiên, rules từ DB bổ sung thêm
func (e *RuleEngine) LoadAllRules() error {
	var allRules []LoadedRule

	// 1. Tải rules từ file YAML
	yamlRules, err := LoadRulesFromYAML(e.yamlDir)
	if err != nil {
		log.Printf("[RULE ENGINE] ⚠️ Cảnh báo khi tải YAML rules: %v", err)
	} else {
		allRules = append(allRules, yamlRules...)
	}

	// 2. Tải rules từ Database (nếu được bật)
	if e.loadFromDB && e.db != nil {
		dbRules, err := LoadRulesFromDB(e.db)
		if err != nil {
			log.Printf("[RULE ENGINE] ⚠️ Cảnh báo khi tải DB rules: %v", err)
		} else {
			// Tạo map để kiểm tra trùng ID (YAML rules ưu tiên hơn DB rules)
			existingIDs := make(map[string]bool)
			for _, r := range allRules {
				existingIDs[r.ID] = true
			}
			// Chỉ thêm DB rules nếu ID chưa tồn tại từ YAML
			for _, r := range dbRules {
				if !existingIDs[r.ID] {
					allRules = append(allRules, r)
				}
			}
		}
	}

	// 3. Cập nhật rules trong memory (write lock)
	e.mu.Lock()
	e.rules = allRules
	e.mu.Unlock()

	log.Printf("[RULE ENGINE] ✅ Đã tải tổng cộng %d rules vào memory", len(allRules))
	return nil
}

// ReloadRules - Hot-reload rules mà không cần restart server
// Gọi hàm này khi Admin thêm/sửa/xóa Rule qua API
func (e *RuleEngine) ReloadRules() error {
	log.Println("[RULE ENGINE] 🔄 Đang hot-reload rules...")
	return e.LoadAllRules()
}

// GetActiveRules - Lấy danh sách rules đang active (read-only)
func (e *RuleEngine) GetActiveRules() []LoadedRule {
	e.mu.RLock()
	defer e.mu.RUnlock()

	// Trả về bản copy để tránh race condition
	result := make([]LoadedRule, len(e.rules))
	copy(result, e.rules)
	return result
}

// GetRuleCount - Đếm số rules đang active
func (e *RuleEngine) GetRuleCount() int {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return len(e.rules)
}

// ==============================================================================
// EvaluateLog - Hàm chính: Đối chiếu raw log với tất cả Detection Rules
//
// Tham số:
//   - rawLog: Event log thô từ Agent (đã parse từ JSON thành map)
//     Ví dụ: {"process_name": "powershell.exe", "command_line": "-enc xxx", ...}
//
// Trả về:
//   - *models.Alert: Alert object nếu khớp Rule (nil nếu không khớp)
//   - bool: true nếu có Rule match, false nếu không có
//
// Logic: Duyệt lần lượt qua từng Rule active. Rule nào match TRƯỚC sẽ thắng.
//        Mỗi Rule yêu cầu TẤT CẢ conditions phải thỏa mãn (AND logic).
// ==============================================================================
func (e *RuleEngine) EvaluateLog(rawLog map[string]interface{}, agentID string) (*models.Alert, bool) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	// Duyệt qua từng rule active
	for _, rule := range e.rules {
		if !rule.IsActive {
			continue
		}

		// Kiểm tra event_type có khớp không (nếu rule chỉ định event_type cụ thể)
		if rule.EventType != "" && rule.EventType != "*" {
			logEventType, _ := getStringField(rawLog, "event_type")
			if logEventType != rule.EventType {
				continue // Event type không khớp, bỏ qua rule này
			}
		}

		// Kiểm tra TẤT CẢ conditions (AND logic)
		if e.matchAllConditions(rawLog, rule.Conditions) {
			log.Printf("[RULE ENGINE] 🚨 MATCH! Rule '%s' (%s) khớp với event từ Agent '%s'",
				rule.ID, rule.Name, agentID)

			// Serialize rawLog thành JSON để lưu vào RawPayload
			rawPayloadJSON, _ := json.Marshal(rawLog)

			// Tạo Alert object
			alert := &models.Alert{
				ID:               uuid.New().String(),
				AgentID:          agentID,
				RuleID:           rule.ID,
				EventType:        models.AlertEventType(mapSeverityToEventType(rule.EventType)),
				Severity:         models.AlertSeverity(rule.Severity),
				RawPayload:       string(rawPayloadJSON),
				Status:           models.AlertStatusNew,
				Title:            fmt.Sprintf("[%s] %s", strings.ToUpper(rule.Severity), rule.Name),
				Description:      rule.Description,
				MITRETactic:      rule.MITRETactic,
				MITRETechniqueID: rule.MITRETechniqueID,
				CreatedAt:        time.Now(),
			}

			return alert, true
		}
	}

	// Không có rule nào match
	return nil, false
}

// matchAllConditions - Kiểm tra tất cả conditions của 1 rule (AND logic)
// Trả về true chỉ khi MỌI condition đều thỏa mãn
func (e *RuleEngine) matchAllConditions(rawLog map[string]interface{}, conditions []models.RuleCondition) bool {
	for _, cond := range conditions {
		if !e.matchCondition(rawLog, cond) {
			return false // Một condition không thỏa → toàn bộ rule không match
		}
	}
	return len(conditions) > 0 // Phải có ít nhất 1 condition
}

// matchCondition - Kiểm tra 1 condition cụ thể trên log event
// Hỗ trợ các operator: equals, not_equals, contains, contains_any, in, regex
func (e *RuleEngine) matchCondition(rawLog map[string]interface{}, cond models.RuleCondition) bool {
	// Lấy giá trị field từ log event
	fieldValue, ok := getStringField(rawLog, cond.Field)
	if !ok {
		return false // Field không tồn tại trong log
	}

	// Chuyển về lowercase để so sánh không phân biệt hoa thường
	fieldValueLower := strings.ToLower(fieldValue)
	condValueLower := strings.ToLower(cond.Value)

	switch cond.Operator {
	case "equals":
		// So sánh chính xác (case-insensitive)
		return fieldValueLower == condValueLower

	case "not_equals":
		// Không bằng
		return fieldValueLower != condValueLower

	case "contains":
		// Kiểm tra field có chứa chuỗi con không
		return strings.Contains(fieldValueLower, condValueLower)

	case "contains_any":
		// Kiểm tra field có chứa BẤT KỲ chuỗi nào trong danh sách không
		// Danh sách các giá trị cách nhau bởi dấu phẩy
		// Ví dụ: "powershell.exe,cmd.exe,wscript.exe"
		values := strings.Split(cond.Value, ",")
		for _, v := range values {
			if strings.Contains(fieldValueLower, strings.ToLower(strings.TrimSpace(v))) {
				return true // Chỉ cần 1 giá trị match
			}
		}
		return false

	case "in":
		// Kiểm tra field VALUE có nằm trong danh sách cho phép không
		// Ví dụ: field = "powershell.exe", value = "powershell.exe,cmd.exe"
		values := strings.Split(cond.Value, ",")
		for _, v := range values {
			if fieldValueLower == strings.ToLower(strings.TrimSpace(v)) {
				return true
			}
		}
		return false

	case "starts_with":
		// Kiểm tra field bắt đầu bằng chuỗi
		return strings.HasPrefix(fieldValueLower, condValueLower)

	case "ends_with":
		// Kiểm tra field kết thúc bằng chuỗi
		return strings.HasSuffix(fieldValueLower, condValueLower)

	default:
		log.Printf("[RULE ENGINE] ⚠️ Operator không được hỗ trợ: '%s'", cond.Operator)
		return false
	}
}

// ==============================================================================
// Helper Functions
// ==============================================================================

// getStringField - Lấy giá trị string của 1 field từ map log
// Hỗ trợ nested field bằng dot notation (ví dụ: "event.data.process_name")
func getStringField(data map[string]interface{}, field string) (string, bool) {
	// Hỗ trợ nested field với dot notation
	parts := strings.Split(field, ".")
	current := data

	for i, part := range parts {
		val, exists := current[part]
		if !exists {
			return "", false
		}

		// Nếu là field cuối cùng, trả về giá trị dạng string
		if i == len(parts)-1 {
			switch v := val.(type) {
			case string:
				return v, true
			case float64:
				return fmt.Sprintf("%.0f", v), true
			case int:
				return fmt.Sprintf("%d", v), true
			case bool:
				return fmt.Sprintf("%t", v), true
			default:
				return fmt.Sprintf("%v", v), true
			}
		}

		// Nếu chưa phải field cuối, val phải là map để tiếp tục đi sâu
		nextMap, ok := val.(map[string]interface{})
		if !ok {
			return "", false
		}
		current = nextMap
	}

	return "", false
}

// mapSeverityToEventType - Map event_type từ rule sang AlertEventType
// Nếu không map được, trả về event_type gốc
func mapSeverityToEventType(eventType string) string {
	mapping := map[string]string{
		"sysmon_process_create":   "suspicious_process",
		"sysmon_network_connect":  "network_anomaly",
		"sysmon_file_create":      "file_integrity",
		"ddos_event":              "ddos_detected",
		"phishing_event":          "phishing_detected",
	}

	if mapped, ok := mapping[eventType]; ok {
		return mapped
	}
	return eventType
}
