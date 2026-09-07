package rules

import (
	"testing"

	"soc-server/internal/models"
)

func TestRuleEngine_MultiMatch_HighestSeverity(t *testing.T) {
	engine := &RuleEngine{
		rules: []LoadedRule{
			{
				ID:          "RULE-LOW-01",
				Name:        "Low Severity Match",
				Severity:    "low",
				IsActive:    true,
				Conditions: []models.RuleCondition{
					{Field: "process_name", Operator: "equals", Value: "powershell.exe"},
				},
			},
			{
				ID:          "RULE-CRITICAL-01",
				Name:        "Critical Severity Match",
				Severity:    "critical",
				IsActive:    true,
				Conditions: []models.RuleCondition{
					{Field: "process_name", Operator: "equals", Value: "powershell.exe"},
				},
			},
			{
				ID:          "RULE-MEDIUM-01",
				Name:        "Medium Severity Match",
				Severity:    "medium",
				IsActive:    true,
				Conditions: []models.RuleCondition{
					{Field: "process_name", Operator: "equals", Value: "powershell.exe"},
				},
			},
		},
	}

	rawLog := map[string]interface{}{
		"process_name": "powershell.exe",
	}

	alert, matched := engine.EvaluateLog(rawLog, "agent-123")
	if !matched {
		t.Fatalf("Expected log to match rules, but got matched=false")
	}

	if alert.RuleID != "RULE-CRITICAL-01" {
		t.Errorf("Expected winning rule 'RULE-CRITICAL-01', got '%s'", alert.RuleID)
	}

	if alert.Severity != models.AlertSeverity("critical") {
		t.Errorf("Expected alert severity 'critical', got '%s'", alert.Severity)
	}
}

func TestRuleEngine_RegexOperator(t *testing.T) {
	engine := &RuleEngine{
		rules: []LoadedRule{
			{
				ID:       "RULE-REGEX-01",
				Name:     "Regex Encoded Command Test",
				Severity: "high",
				IsActive: true,
				Conditions: []models.RuleCondition{
					{Field: "command_line", Operator: "regex", Value: `(?i)-enc(odedcommand)?\s+[a-zA-Z0-9+/=]+`},
				},
			},
		},
	}

	testCases := []struct {
		cmd     string
		matched bool
	}{
		{"powershell.exe -enc SQBFAFgA", true},
		{"powershell.exe -encodedcommand SQBFAFgA", true},
		{"powershell.exe -nop -w hidden", false},
	}

	for _, tc := range testCases {
		rawLog := map[string]interface{}{
			"command_line": tc.cmd,
		}
		alert, matched := engine.EvaluateLog(rawLog, "agent-test")
		if matched != tc.matched {
			t.Errorf("For command '%s', expected matched=%v, got matched=%v", tc.cmd, tc.matched, matched)
		}
		if matched && alert == nil {
			t.Errorf("Matched is true but alert is nil")
		}
	}
}
