package services

import "testing"

func TestDefaultRules(t *testing.T) {
	rules := DefaultRules()
	if len(rules) == 0 {
		t.Fatal("default rules should not be empty")
	}
	if rules[0].Name == "" {
		t.Fatal("default rule name should not be empty")
	}
	if rules[0].EventType == "" {
		t.Fatal("default rule event_type should not be empty")
	}
	if rules[0].Conditions == "" {
		t.Fatal("default rule conditions should not be empty")
	}
}
