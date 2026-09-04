// =============================================================================
// src/services/api.js
// Axios HTTP client — maps to soc-server REST API endpoints
// Backend base: http://localhost:8080 (proxied through Vite /api → :8080)
//
// ⚠ BACKEND STATUS (theo router.go hiện tại):
//   ✅ GET  /api/v1/dashboard/stats        — Đã có
//   ✅ GET  /api/v1/alerts                 — Đã có
//   ✅ PATCH /api/v1/alerts/:id/status     — Đã có
//   ✅ POST /api/v1/soar/callback          — Đã có
//   🚧 /cases, /agents, /indicators,
//      /audit-logs, /settings             — Chưa có, cần thêm vào router.go
// =============================================================================

import axios from 'axios';

const AUTH_LOGOUT_EVENT = 'soc:logout';

function clearAuthState() {
  localStorage.removeItem('soc_token');
  localStorage.removeItem('soc_user');
  window.dispatchEvent(new CustomEvent(AUTH_LOGOUT_EVENT));
}

// ─── Axios Instance ───────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: '/api/v1',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token nếu có
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('soc_token');
  if (token) {
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${token}`,
    };
  }
  return config;
});

// Chuẩn hoá lỗi
api.interceptors.response.use(
  (res) => res.data,
  (err) => {    if (err.response?.status === 401) {
      clearAuthState();
    }
    const message =
      err.response?.data?.message ||
      err.response?.data?.error ||
      err.message ||
      'Network error';
    return Promise.reject(new Error(`[${err.response?.status ?? 'ERR'}] ${message}`));
  },
);

// =============================================================================
// ✅ AUTH — Endpoints thực
// =============================================================================

export async function login(username, password) {
  const res = await axios.post('/api/v1/auth/login', { username, password });
  return res.data;
}

// =============================================================================
// ✅ DASHBOARD — Endpoint thực, đã có trong backend
// =============================================================================

/**
 * GET /api/v1/dashboard/stats
 * Returns: { total_alerts_today, critical_alerts, agents_online, agents_total,
 *             active_cases, alert_trend[], severity_distribution[], top_agents[] }
 */
export async function getDashboardStats() {
  return await api.get('/dashboard/stats');
}

// =============================================================================
// ✅ ALERTS — Endpoints thực, đã có trong backend
// =============================================================================

/**
 * GET /api/v1/alerts
 * Params: { status, severity, page, limit, agent_id }
 */
export async function getAlerts(params = {}) {
  return await api.get('/alerts', { params });
}

/**
 * PATCH /api/v1/alerts/:id/status
 */
export async function updateAlertStatus(id, status) {
  return await api.patch(`/alerts/${id}/status`, { status });
}

// =============================================================================
// ✅ SOAR — Endpoint thực, đã có trong backend
// =============================================================================

/**
 * POST /api/v1/soar/callback
 */
export async function postSoarCallback(data) {
  return await api.post('/soar/callback', data);
}

// =============================================================================
// 🚧 CASES — Chưa có trong backend, cần thêm vào router.go
// =============================================================================

export async function getCases(params = {}) {
  return await api.get('/cases', { params });
}

export async function getCaseById(id) {
  return await api.get(`/cases/${id}`);
}

export async function updateCaseStatus(id, status) {
  return await api.patch(`/cases/${id}/status`, { status });
}

export async function assignCase(id, assignedTo) {
  return await api.patch(`/cases/${id}/assign`, { assigned_to: assignedTo });
}

export async function addCaseNote(id, note) {
  return await api.post(`/cases/${id}/notes`, { note });
}

// =============================================================================
// 🚧 AGENTS — Chưa có trong backend, cần thêm vào router.go
// =============================================================================

export async function getAgents(params = {}) {
  return await api.get('/agents', { params });
}

/**
 * POST /api/v1/agents/:id/response/kill-process
 * Body: { pid: number }
 */
export async function killProcess(agentId, pid) {
  return await api.post(`/agents/${agentId}/response/kill-process`, { pid });
}

/**
 * POST /api/v1/agents/:id/response/block-ip
 * Body: { ip: string }
 */
export async function blockIP(agentId, ip) {
  return await api.post(`/agents/${agentId}/response/block-ip`, { ip });
}

// =============================================================================
// 🚧 INDICATORS (IOCs) — Chưa có trong backend, cần thêm vào router.go
// =============================================================================

export async function getIndicators(params = {}) {
  return await api.get('/indicators', { params });
}

export async function createIndicator(data) {
  return await api.post('/indicators', data);
}

export async function updateIndicator(id, data) {
  return await api.put(`/indicators/${id}`, data);
}

export async function deleteIndicator(id) {
  return await api.delete(`/indicators/${id}`);
}

/**
 * POST /api/v1/indicators/analyze
 * Body: { type, value }
 * Returns: Cortex-style analysis result
 */
export async function analyzeIOC(type, value) {
  return await api.post('/indicators/analyze', { type, value });
}

// =============================================================================
// ✅ RULES — Custom detection rules stored in DB
// =============================================================================

export async function getRules() {
  return await api.get('/rules');
}

export async function createRule(data) {
  return await api.post('/rules', data);
}

export async function updateRule(id, data) {
  return await api.put(`/rules/${id}`, data);
}

export async function toggleRule(id, isActive) {
  return await api.patch(`/rules/${id}/toggle`, { is_active: isActive });
}

export async function deleteRule(id) {
  return await api.delete(`/rules/${id}`);
}

// =============================================================================
// 🚧 AUDIT LOGS — Chưa có trong backend, cần thêm vào router.go
// =============================================================================

export async function getAuditLogs(params = {}) {
  return await api.get('/audit-logs', { params });
}

// =============================================================================
// 🚧 SYSTEM SETTINGS — Chưa có trong backend, cần thêm vào router.go
// =============================================================================

export async function getSystemSettings() {
  return await api.get('/settings');
}

export async function saveSystemSettings(settings) {
  return await api.put('/settings', settings);
}

export default api;
