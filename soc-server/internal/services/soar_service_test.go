package services

import (
	"testing"

	"soc-server/internal/config"
	"soc-server/internal/models"
)

func TestSOARService_GetWebhookURL(t *testing.T) {
	cfg := &config.SOARConfig{
		N8NWebhookURL:        "http://n8n:5678/webhook/general",
		N8NWebhookURLDDoS:     "http://n8n:5678/webhook/ddos-alert",
		N8NWebhookURLPhishing: "http://n8n:5678/webhook/phishing-alert",
		N8NWebhookURLWazuh:    "http://n8n:5678/webhook/wazuh-critical-alert",
	}

	soarSvc := &SOARService{config: cfg}

	testCases := []struct {
		eventType models.AlertEventType
		expected  string
	}{
		{models.EventDDoSDetected, "http://n8n:5678/webhook/ddos-alert"},
		{models.EventPhishingDetected, "http://n8n:5678/webhook/phishing-alert"},
		{models.EventFileIntegrity, "http://n8n:5678/webhook/wazuh-critical-alert"},
		{models.EventWazuhAlert, "http://n8n:5678/webhook/wazuh-critical-alert"},
		{models.AlertEventType("unknown_type"), "http://n8n:5678/webhook/general"},
	}

	for _, tc := range testCases {
		alert := &models.Alert{EventType: tc.eventType}
		url := soarSvc.getWebhookURL(alert)
		if url != tc.expected {
			t.Errorf("For eventType '%s', expected '%s', got '%s'", tc.eventType, tc.expected, url)
		}
	}
}

func TestSOARService_ShouldDispatchToN8N(t *testing.T) {
	testCases := []struct {
		eventType models.AlertEventType
		severity  models.AlertSeverity
		expected  bool
	}{
		{models.EventDDoSDetected, models.SeverityLow, true},
		{models.EventPhishingDetected, models.SeverityLow, true},
		{models.EventFileIntegrity, models.SeverityLow, true},
		{models.EventSuspiciousProcess, models.SeverityCritical, true},
		{models.EventSuspiciousProcess, models.SeverityHigh, false},
		{models.EventSuspiciousProcess, models.SeverityLow, false},
		{models.EventNetworkAnomaly, models.SeverityLow, false},
	}

	for _, tc := range testCases {
		alert := &models.Alert{
			EventType: tc.eventType,
			Severity:  tc.severity,
		}
		result := shouldDispatchToN8N(alert)
		if result != tc.expected {
			t.Errorf("For eventType '%s' severity '%s', expected dispatch=%v, got %v",
				tc.eventType, tc.severity, tc.expected, result)
		}
	}
}
