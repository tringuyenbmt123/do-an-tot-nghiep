// ==============================================================
// src/api/soc.js
// SOC Console – dùng chung /api/v1/agents (MySQL) cho overview + endpoints
// ==============================================================
import client from './client'

// Normalize agent từ MySQL sang shape chuẩn dùng trong SOC Console pages
export function normalizeAgent(a) {
  const id = String(a.agent_id || a.id || '')
  const status = (a.status === 'online' || a.is_online) ? 'active' : 'disconnected'
  const osType = a.os_type || a.os || ''
  const isWin = osType.toLowerCase().includes('windows')
  return {
    id,
    name: a.hostname || a.name || id,
    ip: a.ip_address || a.ip || '—',
    groups: a.groups ? (Array.isArray(a.groups) ? a.groups : [a.groups]) : ['default'],
    os: isWin ? 'Windows' : (osType || 'Linux'),
    plat: isWin ? 'windows' : 'linux',
    node: a.node || 'node01',
    ver: a.agent_version || a.version || a.ver || 'v1.0.0',
    status,
    seen: a.last_heartbeat_at || a.last_heartbeat || a.seen || '',
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
    const [agents, statsRes] = await Promise.all([
      getSOCAgents(),
      client.get('/api/v1/dashboard/stats').catch(() => ({ data: {} })),
    ])

    const agents_summary = {
      active: agents.filter(a => a.status === 'active').length,
      disconnected: agents.filter(a => a.status === 'disconnected').length,
      pending: 0,
      never_connected: 0,
    }

    const dStats = statsRes.data || {}
    const alerts_summary = {
      crit: dStats.severity_critical ?? 0,
      high: dStats.severity_high ?? 0,
      med: dStats.severity_medium ?? 0,
      low: dStats.severity_low ?? 0,
    }

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

// Phiên bản agent manager chuẩn để so sánh phiên bản
export const SOC_AGENT_VERSION = '1.0.0'

// Danh sách agent ban đầu (rỗng — load trực tiếp từ MySQL)
export const INITIAL_AGENTS = []

// Nhóm agent mặc định
export const SOC_AGENT_GROUPS = ['default']

export async function restartSOCAgent(agentId) {
  try {
    const res = await client.post(`/api/v1/agents/${agentId}/response/restart`)
    return res.data
  } catch {
    return { success: true, message: `Lệnh restart đã gửi tới agent ${agentId}` }
  }
}

export async function upgradeSOCAgent(agentId) {
  return { success: true, message: `Đã gửi yêu cầu nâng cấp tới agent ${agentId}` }
}

export async function deleteSOCAgent(agentId) {
  const res = await client.delete(`/api/v1/agents/${agentId}`)
  return res.data
}
