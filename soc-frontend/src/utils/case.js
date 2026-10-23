// ==============================================================
// src/utils/case.js
// Shared utilities for Case parsing & severity resolution
// ==============================================================

/**
 * Resolve a display severity string from a case object.
 * Checks: .severity string, .severity_num int, then text heuristics.
 */
export const resolveSeverity = (item) => {
  if (!item) return 'medium'
  if (item.severity && item.severity !== '—') return item.severity
  if (item.severity_num) {
    const map = { 1: 'critical', 2: 'high', 3: 'medium', 4: 'low' }
    if (map[item.severity_num]) return map[item.severity_num]
  }
  const text = `${item.title || ''} ${item.description || ''}`.toUpperCase()
  if (text.includes('[CRITICAL]') || text.includes('CRITICAL')) return 'critical'
  if (text.includes('[HIGH]') || text.includes('HIGH')) return 'high'
  if (text.includes('[MEDIUM]') || text.includes('MEDIUM')) return 'medium'
  if (text.includes('[LOW]') || text.includes('LOW')) return 'low'
  return 'medium'
}

/**
 * Parse a case description string into { initialDesc, notes }.
 * Notes are separated from the initial description by '---' markers.
 * Note format: [timestamp] author: content
 */
export const parseCaseDescription = (desc) => {
  if (!desc) return { initialDesc: '', notes: [] }

  const parts = desc.split(/\n*---\n*/).map(p => p.trim()).filter(Boolean)
  if (parts.length === 0) return { initialDesc: '', notes: [] }

  let initialDesc = ''
  const notes = []

  parts.forEach((part, idx) => {
    const match = part.match(/^\*{0,2}\[([^\]]+)\]\s*([^:*]+)\*{0,2}:\s*([\s\S]*)$/)
    if (match) {
      notes.push({
        id: idx,
        timestamp: match[1].trim(),
        author: match[2].trim(),
        content: match[3].trim(),
      })
    } else {
      if (idx === 0) {
        initialDesc = part
      } else {
        notes.push({
          id: idx,
          timestamp: '',
          author: '',
          content: part,
        })
      }
    }
  })

  return { initialDesc, notes }
}

/**
 * Extract raw alert object from a case.
 * Tries: case.raw_alert, case.alert?.raw, case.alert_data
 */
export const extractRawAlert = (caseData) => {
  if (!caseData) return null

  const candidates = [
    caseData.raw_alert,
    caseData.alert?.raw_payload,
    caseData.alert?.raw,
    caseData.alert_data,
  ]

  for (const c of candidates) {
    if (!c) continue
    if (typeof c === 'object') return c
    if (typeof c === 'string') {
      try { return JSON.parse(c) } catch { /* skip */ }
    }
  }
  return null
}

/**
 * Resolve PROTOCOL number to name.
 */
export const protoName = (p) => {
  const m = { '6': 'TCP', '17': 'UDP', '1': 'ICMP' }
  return m[String(p)] || String(p || '')
}

/**
 * Extract ATT&CK stage/category from rule.groups array.
 */
export const extractAttackInfo = (groups = []) => {
  let stage = '', category = ''
  for (const g of groups) {
    if (typeof g === 'string') {
      if (g.startsWith('attack_stage_')) {
        stage = g.replace('attack_stage_', '').replace(/_/g, ' ')
      }
      if (g.startsWith('attack_category_')) {
        category = g.replace('attack_category_', '').replace(/_/g, ' ')
      }
    }
  }
  return { stage, category }
}

/**
 * Extract agent info from a case object.
 * Tries: case.agent, case.alert?.agent, matching in agentsList, raw.agent + raw.src_ip
 */
export const extractAgent = (caseData, raw, agentsList = []) => {
  if (!caseData && !raw) return null

  const fromCase = caseData?.agent || caseData?.alert?.agent
  const fromRaw = raw?.agent
  const targetId = caseData?.alert?.agent_id || caseData?.agent_id || raw?.agent_id || fromRaw?.id
  const targetIp = raw?.src_ip || raw?.data?.srcip || raw?.ip

  // Try matching with actual agents from API
  let matchedAgent = null
  if (agentsList && agentsList.length > 0) {
    if (targetId) {
      matchedAgent = agentsList.find(a => a.id === targetId || a.hostname === targetId)
    }
    if (!matchedAgent && targetIp) {
      matchedAgent = agentsList.find(a => a.ip_address === targetIp || a.ip === targetIp)
    }
    // If only one online agent in the system, connect it
    if (!matchedAgent) {
      const onlineAgents = agentsList.filter(a => (a.status || '').toLowerCase() === 'online')
      if (onlineAgents.length === 1) {
        matchedAgent = onlineAgents[0]
      } else if (agentsList.length === 1) {
        matchedAgent = agentsList[0]
      }
    }
  }

  const merged = {}

  if (matchedAgent) {
    merged.id = matchedAgent.id
    merged.name = matchedAgent.hostname || matchedAgent.name
    merged.ip = matchedAgent.ip_address || matchedAgent.ip
    merged.os = matchedAgent.os_type || matchedAgent.os || 'Windows'
    merged.status = matchedAgent.status || 'online'
    merged.last_seen = matchedAgent.last_heartbeat_at || matchedAgent.updated_at
  }

  if (fromCase) {
    if (fromCase.id && fromCase.id !== '001' && fromCase.id !== 'N/A') merged.id = fromCase.id
    else if (!merged.id && fromCase.id) merged.id = fromCase.id
    if (fromCase.name && fromCase.name !== 'N/A') merged.name = fromCase.name
    if (fromCase.hostname && fromCase.hostname !== 'N/A') merged.name = fromCase.hostname
    if (fromCase.ip && fromCase.ip !== 'N/A') merged.ip = fromCase.ip
    if (fromCase.os) merged.os = fromCase.os
    if (fromCase.status) merged.status = fromCase.status
    if (fromCase.last_seen) merged.last_seen = fromCase.last_seen
  }

  if (fromRaw) {
    if (fromRaw.id && fromRaw.id !== '001' && fromRaw.id !== 'N/A') merged.id = fromRaw.id
    else if (!merged.id && fromRaw.id) merged.id = fromRaw.id
    if (fromRaw.name && fromRaw.name !== 'N/A') merged.name = fromRaw.name
  }

  if (raw?.agent_name && raw.agent_name !== 'N/A' && !merged.name) {
    merged.name = raw.agent_name
  }

  if (targetId && !merged.id && targetId !== 'N/A') {
    merged.id = targetId
  }

  if (targetIp && !merged.ip && targetIp !== 'N/A') {
    merged.ip = targetIp
  }

  if (!merged.name && merged.id) {
    merged.name = `Agent ${merged.id}`
  }

  if (!merged.status) {
    merged.status = 'online'
  }

  if (!merged.id && !merged.name && !merged.ip) return null
  return merged
}

/**
 * Resolve display title for a case.
 * Replaces generic "SOAR Escalated Alert: <uuid>" with meaningful alert title
 * e.g. "[DDOS_DETECTED] ddos-rstfinflood"
 */
export const resolveCaseTitle = (caseData, raw) => {
  if (!caseData) return ''
  const t = caseData.title || ''
  const isGeneric = !t || t.startsWith('SOAR Escalated Alert:')

  if (isGeneric) {
    if (caseData.alert?.title && !caseData.alert.title.startsWith('SOAR Escalated Alert:')) {
      return caseData.alert.title
    }
    if (raw?.title && !raw.title.startsWith('SOAR Escalated Alert:')) {
      return raw.title
    }
    const eventType = caseData.alert?.event_type || raw?.event_type
    const attackType = raw?.attack_type || raw?.detection_type
    if (eventType || attackType) {
      return `[${(eventType || 'ALERT').toUpperCase()}] ${attackType || ''}`.trim()
    }
  }

  return t
}
