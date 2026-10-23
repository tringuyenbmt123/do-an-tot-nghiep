// ==============================================================
// src/components/cases/CaseAlertDetails.jsx
// Chi tiết cảnh báo gốc: bảng alert fields linh hoạt + Raw JSON viewer
// Hỗ trợ đầy đủ: Wazuh, Sysmon File Integrity, DDoS ML, EDR Process
// ==============================================================
import React, { useState, useCallback, useMemo } from 'react'
import { formatDateTime } from '../../utils/date'
import { extractAttackInfo, protoName } from '../../utils/case'
import EmptyState from '../ui/EmptyState'

// ── Helpers ──────────────────────────────────────────────────────────────────

const escHtml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const highlightJsonLine = (line) => {
  const e = escHtml(line)
  return e
    .replace(/^(\s*)((?:&quot;)(?:[^&]|&(?!quot;))*(?:&quot;))(:)/, '$1<span class="jk">$2</span>$3')
    .replace(/(:\s*|^\s*)((?:&quot;)(?:[^&]|&(?!quot;))*(?:&quot;))(,?)$/, '$1<span class="js">$2</span>$3')
    .replace(/(:\s*)(-?\d+(?:\.\d+)?)(,?)$/, '$1<span class="jn">$2</span>$3')
    .replace(/(:\s*)(true|false|null)(,?)$/, '$1<span class="jb">$2</span>$3')
}

const MAX_RENDERED_LINES = 2000

// ── Sub-component: Raw JSON Viewer ───────────────────────────────────────────

function RawJsonViewer({ rawData }) {
  const [collapsed, setCollapsed] = useState(false)
  const [copyLabel, setCopyLabel] = useState('Sao chép')
  const [showAll, setShowAll] = useState(false)

  const jsonText = useMemo(() => {
    if (!rawData) return ''
    if (typeof rawData === 'string') {
      try {
        return JSON.stringify(JSON.parse(rawData), null, 2)
      } catch {
        return rawData
      }
    }
    return JSON.stringify(rawData, null, 2)
  }, [rawData])

  const allLines = useMemo(() => jsonText.split('\n'), [jsonText])
  const isTruncated = !showAll && allLines.length > MAX_RENDERED_LINES
  const renderLines = isTruncated ? allLines.slice(0, MAX_RENDERED_LINES) : allLines

  const handleCopy = useCallback(() => {
    ;(navigator.clipboard
      ? navigator.clipboard.writeText(jsonText)
      : Promise.reject()
    )
      .then(() => setCopyLabel('Đã chép'))
      .catch(() => setCopyLabel('Không chép được'))
    setTimeout(() => setCopyLabel('Sao chép'), 1500)
  }, [jsonText])

  if (!jsonText) return null

  return (
    <section className="cd-panel">
      <div className="cd-panel-header">
        <span>Raw Alert JSON</span>
        <span className="cd-jhead">
          <button
            className="cd-btn"
            style={{ padding: '2px 9px', fontSize: 12 }}
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? 'Mở rộng' : 'Thu gọn'}
          </button>
          <button
            className="cd-btn"
            style={{ padding: '2px 9px', fontSize: 12 }}
            onClick={handleCopy}
          >
            {copyLabel}
          </button>
        </span>
      </div>
      <pre
        className={`cd-json-pre${collapsed ? ' collapsed' : ''}`}
        aria-label="Raw alert JSON"
      >
        {renderLines.map((line, i) => (
          <div className="cd-json-line" key={i}>
            <span className="cd-json-ln">{i + 1}</span>
            <span
              className="cd-json-tx"
              dangerouslySetInnerHTML={{ __html: highlightJsonLine(line) }}
            />
          </div>
        ))}
        {isTruncated && (
          <div style={{ padding: '6px 44px', color: 'var(--muted)', fontSize: 12 }}>
            … còn {allLines.length - MAX_RENDERED_LINES} dòng nữa &nbsp;
            <button
              className="cd-btn"
              style={{ fontSize: 11, padding: '1px 8px' }}
              onClick={() => setShowAll(true)}
            >
              Xem tất cả
            </button>
          </div>
        )}
      </pre>
    </section>
  )
}

// ── Row helper: only render if value is non-empty ─────────────────────────────

function AlertRow({ label, children, full }) {
  if (children == null || children === '') return null
  return (
    <div className={`cd-dgrid-row${full ? ' full' : ''}`}>
      <span className="cd-dkey">{label}</span>
      <span className="cd-dval">{children}</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CaseAlertDetails({ alert, raw, agent }) {
  // Parse raw object if it's a string
  const parsedRaw = useMemo(() => {
    let r = raw
    if (typeof r === 'string') {
      try {
        r = JSON.parse(r)
      } catch {
        /* keep as is */
      }
    }
    // Also parse nested 'original' field if present (e.g. from DDoS / SOAR events)
    if (r && typeof r === 'object' && typeof r.original === 'string') {
      try {
        const orig = JSON.parse(r.original)
        r = { ...r, ...orig }
      } catch {
        /* keep */
      }
    }
    return r
  }, [raw])

  // Also parse alert.raw_payload if raw was not passed directly
  const effectiveRaw = useMemo(() => {
    if (parsedRaw) return parsedRaw
    if (alert?.raw_payload) {
      if (typeof alert.raw_payload === 'object') return alert.raw_payload
      try {
        return JSON.parse(alert.raw_payload)
      } catch {
        return alert.raw_payload
      }
    }
    return null
  }, [parsedRaw, alert])

  if (!alert && !effectiveRaw) {
    return (
      <section className="cd-panel">
        <div className="cd-panel-header">Chi tiết cảnh báo</div>
        <div className="cd-panel-body">
          <EmptyState
            message="Sự cố này chưa có dữ liệu cảnh báo gốc"
            sub="Dữ liệu alert / raw_payload không tồn tại trong sự cố này"
          />
        </div>
      </section>
    )
  }

  // Unified object combining alert metadata and raw details
  const r = typeof effectiveRaw === 'object' && effectiveRaw ? effectiveRaw : {}
  const a = alert || {}

  // Field resolution:
  const timestamp = r.timestamp || a.created_at || r.created_at
  const alertId = a.id || r.id || r.alert_id
  const eventTitle = a.title || r.event_type || a.event_type || r.title
  const eventType = a.event_type || r.event_type

  // Source & Destination
  const srcIp = r.data?.srcip || r.src_ip || r.srcip || r.source_ip
  const srcPort = r.data?.srcport || r.src_port || r.srcport
  const srcCountry = r.data?.srccountry || r.src_country

  const dstIp = r.data?.dstip || r.dst_ip || r.dstip || r.destination_ip
  const dstPort = r.data?.dstport || r.dst_port || r.dstport

  const srcLabel = srcIp ? `${srcIp}${srcPort ? `:${srcPort}` : ''}` : null
  const dstLabel = dstIp ? `${dstIp}${dstPort ? `:${dstPort}` : ''}` : null

  // Protocol & Action
  const protocol = r.data?.protocol || r.protocol
  const protoDisplay = protocol ? protoName(protocol) : null
  const protoLabel = [r.data?.direction || r.direction, protoDisplay ? `${protoDisplay} (${protocol})` : null]
    .filter(Boolean)
    .join(' · ')

  const action = r.data?.action || r.action
  const ruleLevel = r.rule?.level
  const isHighLevel = ruleLevel != null && Number(ruleLevel) >= 12
  const ruleDesc = r.rule?.description || a.rule_id || (r.rule?.id ? `Rule ID: ${r.rule.id}` : null)

  // File integrity / Process / Sysmon specifics
  const filePath = r.path || r.data?.path || r.file_path || r.file
  const fileHash = r.file_hash || r.sha256 || r.md5 || r.data?.sha256
  const commandLine = r.command_line || r.process || r.data?.process

  // Attack detection & performance (e.g. DDoS)
  const attackType = r.attack_type || r.detection_type
  const confidence = r.confidence != null ? `${(Number(r.confidence) * 100).toFixed(1)}%` : null
  const pps = r.pps != null ? `${Number(r.pps).toFixed(2)} pps` : null

  // Agent & Log source
  const rawAgentName = a.agent?.name || a.agent?.hostname || r.agent?.name || r.agent_name || r.hostname
  const agentName =
    (agent?.name && agent.name !== 'N/A' ? agent.name : null) ||
    (agent?.hostname && agent.hostname !== 'N/A' ? agent.hostname : null) ||
    (rawAgentName && rawAgentName !== 'N/A' ? rawAgentName : null)

  const rawAgentId = a.agent_id || r.agent_id || r.agent?.id
  const agentId =
    (agent?.id && agent.id !== '001' && agent.id !== 'N/A' ? agent.id : null) ||
    (rawAgentId && rawAgentId !== '001' && rawAgentId !== 'N/A' ? rawAgentId : null) ||
    agent?.id ||
    (rawAgentId !== 'N/A' ? rawAgentId : null)
  const logSource = r.data?.logsource || r.data?.device_name || r.source || r.decoder?.name
  const decoderName = r.decoder?.name

  // ATT&CK
  const { stage, category } = extractAttackInfo(r.rule?.groups || [])
  const mitreTactic = a.mitre_tactic && a.mitre_tactic !== 'N/A' ? a.mitre_tactic : stage
  const mitreTechnique = a.mitre_technique_id && a.mitre_technique_id !== 'N/A' ? a.mitre_technique_id : r.rule?.mitre?.id

  // URL
  const url = r.data?.url || r.url

  // Prepare full raw object for JSON viewer
  const rawViewerData = useMemo(() => {
    if (effectiveRaw && typeof effectiveRaw === 'object') {
      // If we also have alert, include alert context
      if (alert && alert.id) {
        return {
          alert_id: alert.id,
          event_type: alert.event_type,
          severity: alert.severity,
          title: alert.title,
          agent_id: alert.agent_id,
          created_at: alert.created_at,
          payload: effectiveRaw,
        }
      }
      return effectiveRaw
    }
    if (alert) return alert
    return effectiveRaw
  }, [effectiveRaw, alert])

  return (
    <>
      <section className="cd-panel">
        <div className="cd-panel-header">
          <span>Chi tiết cảnh báo</span>
          {a.severity && (
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: a.severity === 'critical' ? 'var(--crit)' : 'var(--primary)' }}>
              {a.severity}
            </span>
          )}
        </div>
        <div className="cd-panel-body cd-dgrid">
          {timestamp && (
            <AlertRow label="Thời gian">
              <span className="mono">{formatDateTime(timestamp)}</span>
            </AlertRow>
          )}

          {alertId && (
            <AlertRow label="Alert ID">
              <span className="mono">{alertId}</span>
            </AlertRow>
          )}

          {eventTitle && (
            <AlertRow label="Tiêu đề / Sự kiện">
              <span style={{ fontWeight: 600 }}>{eventTitle}</span>
              {eventType && eventType !== eventTitle && (
                <span className="cd-pill" style={{ marginLeft: 6 }}>{eventType}</span>
              )}
            </AlertRow>
          )}

          {action && (
            <AlertRow label="Hành động">
              <span className="cd-pill action">{action}</span>
            </AlertRow>
          )}

          {/* File path for File Integrity / Sysmon */}
          {filePath && (
            <AlertRow label="Đường dẫn tệp" full>
              <span className="mono" style={{ color: 'var(--primary)', fontWeight: 600, wordBreak: 'break-all' }}>
                {filePath}
              </span>
            </AlertRow>
          )}

          {/* Command Line / Process */}
          {commandLine && (
            <AlertRow label="Dòng lệnh / Process" full>
              <code className="mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>
                {commandLine}
              </code>
            </AlertRow>
          )}

          {/* File Hash */}
          {fileHash && (
            <AlertRow label="Mã băm tệp" full>
              <span className="mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>
                {fileHash}
              </span>
            </AlertRow>
          )}

          {ruleDesc && (
            <AlertRow label="Rule">
              {ruleDesc}
              {r.rule?.id && (
                <span className="mono" style={{ marginLeft: 6, fontSize: 12, color: 'var(--muted)' }}>
                  ({r.rule.id})
                </span>
              )}
            </AlertRow>
          )}

          {ruleLevel != null && (
            <AlertRow label="Rule level">
              <span className={`cd-pill${isHighLevel ? ' level-high' : ''}`}>
                {ruleLevel}
              </span>
            </AlertRow>
          )}

          {srcLabel && (
            <AlertRow label="Source IP">
              <span className="mono">{srcLabel}</span>
              {srcCountry && (
                <span className="cd-pill" style={{ marginLeft: 6 }}>{srcCountry}</span>
              )}
            </AlertRow>
          )}

          {dstLabel && (
            <AlertRow label="Destination IP">
              <span className="mono">{dstLabel}</span>
            </AlertRow>
          )}

          {protoLabel && (
            <AlertRow label="Hướng / Giao thức">
              {protoLabel}
            </AlertRow>
          )}

          {attackType && (
            <AlertRow label="Loại tấn công">
              <span className="cd-pill level-high">{attackType}</span>
            </AlertRow>
          )}

          {confidence && (
            <AlertRow label="Độ tin cậy AI">
              <b>{confidence}</b>
            </AlertRow>
          )}

          {pps && (
            <AlertRow label="Lưu lượng gói">
              <span className="mono">{pps}</span>
            </AlertRow>
          )}

          {agentName && (
            <AlertRow label="Tên agent">
              <span className="mono">{agentName}</span>
            </AlertRow>
          )}

          {agentId && (
            <AlertRow label="Agent ID">
              <span className="mono">{agentId}</span>
            </AlertRow>
          )}

          {logSource && (
            <AlertRow label="Nguồn log">
              <span className="mono">{logSource}</span>
            </AlertRow>
          )}

          {decoderName && decoderName !== logSource && (
            <AlertRow label="Decoder">
              <span className="mono">{decoderName}</span>
            </AlertRow>
          )}

          {mitreTactic && (
            <AlertRow label="MITRE stage">{mitreTactic}</AlertRow>
          )}

          {mitreTechnique && (
            <AlertRow label="MITRE technique">
              <span className="cd-tag" style={{ color: 'var(--primary)' }}>{mitreTechnique}</span>
            </AlertRow>
          )}

          {category && (
            <AlertRow label="ATT&CK category">{category}</AlertRow>
          )}

          {url && (
            <AlertRow label="URL" full>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="mono"
                style={{ fontSize: 12, color: 'var(--primary)', wordBreak: 'break-all' }}
              >
                {url}
              </a>
            </AlertRow>
          )}
        </div>
      </section>

      {/* Raw JSON viewer */}
      <RawJsonViewer rawData={rawViewerData} />
    </>
  )
}
