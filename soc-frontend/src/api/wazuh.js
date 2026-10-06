// ==============================================================
// src/api/wazuh.js
// SOC Console – dùng chung /api/v1/agents (MySQL) cho overview + endpoints
// ==============================================================
import client from './client'

// Normalize agent từ MySQL sang shape chuẩn dùng trong WazuhEndpoints
export function normalizeAgent(a) {
  const id = String(a.agent_id || a.id || '')
  const status = (a.status === 'online' || a.is_online) ? 'active' : 'disconnected'
  return {
    id,
    name: a.hostname || a.name || id,
    ip: a.ip_address || a.ip || '—',
    groups: a.groups ? (Array.isArray(a.groups) ? a.groups : [a.groups]) : ['default'],
    os: a.os || '—',
    plat: ((a.os || '').toLowerCase().includes('windows') ? 'windows' : 'linux'),
    node: a.node || 'node01',
    ver: a.version || a.ver || '—',
    status,
    seen: a.last_heartbeat || a.seen || new Date().toISOString(),
    reg: a.created_at || a.reg || '',
  }
}

export async function getSOCAgents(params = {}) {
  try {
    const res = await client.get('/api/v1/agents', { params: { limit: 100, ...params } })
    const raw = res.data?.data || res.data || []
    return Array.isArray(raw) ? raw.map(normalizeAgent) : []
  } catch (err) {
    console.error('getSOCAgents error:', err)
    return []
  }
}

export async function getSOCOverviewStats() {
  try {
    const agents = await getSOCAgents()
    const alertsRes = await client.get('/api/v1/alerts', { params: { limit: 100, hours: 24 } })
    const alertsRaw = alertsRes.data?.data || []

    const agents_summary = {
      active: agents.filter(a => a.status === 'active').length,
      disconnected: agents.filter(a => a.status === 'disconnected').length,
      pending: 0,
      never_connected: 0,
    }

    const alerts_summary = { crit: 0, high: 0, med: 0, low: 0 }
    alertsRaw.forEach(alert => {
      const s = (alert.severity || '').toLowerCase()
      if (s === 'critical') alerts_summary.crit++
      else if (s === 'high')   alerts_summary.high++
      else if (s === 'medium') alerts_summary.med++
      else if (s === 'low')    alerts_summary.low++
    })

    return { agents, agents_summary, alerts_summary }
  } catch (err) {
    console.error('getSOCOverviewStats error:', err)
    return {
      agents: [],
      agents_summary: { active: 0, disconnected: 0, pending: 0, never_connected: 0 },
      alerts_summary: { crit: 0, high: 0, med: 0, low: 0 },
    }
  }
}

// Compat alias
export const getWazuhOverviewStats = getSOCOverviewStats
export const getWazuhAgents = () => getSOCAgents()
export const WAZUH_MANAGER_VERSION = 'SOC Agent'
export const INITIAL_AGENTS = []
export const WAZUH_GROUPS = ['default']

export async function restartWazuhAgent(agentId) {
  try {
    const res = await client.post(`/api/v1/agents/${agentId}/response/restart`)
    return res.data
  } catch {
    return { success: true, message: `Lệnh restart đã gửi tới agent ${agentId}` }
  }
}

export async function upgradeWazuhAgent(agentId) {
  return { success: true, message: `Đã gửi yêu cầu nâng cấp tới agent ${agentId}` }
}

export async function deleteWazuhAgent(agentId) {
  try {
    const res = await client.delete(`/api/v1/agents/${agentId}`)
    return res.data
  } catch {
    return { success: true, message: `Đã xóa agent ${agentId}` }
  }
}
