package rules

import (
	"testing"

	"soc-server/internal/models"
)

func TestRuleEngine_MultiMatch_AllAlertsCreated(t *testing.T) {
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

	alerts, matched := engine.EvaluateLog(rawLog, "agent-123")
	if !matched {
		t.Fatalf("Expected log to match rules, but got matched=false")
	}

	if len(alerts) != 3 {
		t.Fatalf("Expected 3 alerts for 3 matched rules, got %d", len(alerts))
	}

	ruleIDs := map[string]bool{}
	for _, a := range alerts {
		ruleIDs[a.RuleID] = true
	}

	if !ruleIDs["RULE-LOW-01"] || !ruleIDs["RULE-CRITICAL-01"] || !ruleIDs["RULE-MEDIUM-01"] {
		t.Errorf("Expected all 3 rule IDs in generated alerts, got %v", ruleIDs)
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
		alerts, matched := engine.EvaluateLog(rawLog, "agent-test")
		if matched != tc.matched {
			t.Errorf("For command '%s', expected matched=%v, got matched=%v", tc.cmd, tc.matched, matched)
		}
		if matched && len(alerts) == 0 {
			t.Errorf("Matched is true but alerts is empty")
		}
	}
}
