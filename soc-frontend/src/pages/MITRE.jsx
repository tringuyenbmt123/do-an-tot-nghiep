// ==============================================================
// src/pages/MITRE.jsx - MITRE ATT&CK Coverage Heatmap
// Full 14-tactic matrix visualization with technique details
// ==============================================================
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Grid, RefreshCw, Search, ChevronDown, ChevronUp, Shield, Target, Eye, AlertCircle, Info } from 'lucide-react'
import Layout from '../components/layout/Layout'
import { getMitreCoverage } from '../api/mitre'
import { useTheme } from '../contexts/ThemeContext'

// Full MITRE ATT&CK Enterprise tactic list (ordered)
const ALL_TACTICS = [
  { id: 'TA0001', name: 'Initial Access', short: 'Xâm nhập ban đầu', color: '#ef4444' },
  { id: 'TA0002', name: 'Execution', short: 'Thực thi', color: '#f97316' },
  { id: 'TA0003', name: 'Persistence', short: 'Duy trì quyền', color: '#eab308' },
  { id: 'TA0004', name: 'Privilege Escalation', short: 'Leo thang đặc quyền', color: '#84cc16' },
  { id: 'TA0005', name: 'Defense Evasion', short: 'Né tránh phòng thủ', color: '#22c55e' },
  { id: 'TA0006', name: 'Credential Access', short: 'Đánh cắp thông tin', color: '#10b981' },
  { id: 'TA0007', name: 'Discovery', short: 'Trinh sát nội bộ', color: '#14b8a6' },
  { id: 'TA0008', name: 'Lateral Movement', short: 'Di chuyển ngang', color: '#06b6d4' },
  { id: 'TA0009', name: 'Collection', short: 'Thu thập dữ liệu', color: '#3b82f6' },
  { id: 'TA0010', name: 'Exfiltration', short: 'Rò rỉ dữ liệu', color: '#8b5cf6' },
  { id: 'TA0011', name: 'Command and Control', short: 'Điều khiển từ xa', color: '#d946ef' },
  { id: 'TA0040', name: 'Impact', short: 'Tác động', color: '#f43f5e' },
  { id: 'TA0042', name: 'Resource Development', short: 'Xây dựng tài nguyên', color: '#64748b' },
  { id: 'TA0043', name: 'Reconnaissance', short: 'Trinh sát', color: '#94a3b8' },
]

// Fallback static techniques for demo (mapped to tactic names)
const DEMO_TECHNIQUES = [
  { id: 'T1059', name: 'Command and Scripting Interpreter', tactic: 'Execution', hits: 42 },
  { id: 'T1059.001', name: 'PowerShell', tactic: 'Execution', hits: 38 },
  { id: 'T1059.003', name: 'Windows Command Shell', tactic: 'Execution', hits: 27 },
  { id: 'T1566', name: 'Phishing', tactic: 'Initial Access', hits: 19 },
  { id: 'T1566.001', name: 'Spearphishing Attachment', tactic: 'Initial Access', hits: 15 },
  { id: 'T1190', name: 'Exploit Public-Facing Application', tactic: 'Initial Access', hits: 8 },
  { id: 'T1078', name: 'Valid Accounts', tactic: 'Initial Access', hits: 12 },
  { id: 'T1547', name: 'Boot or Logon Autostart Execution', tactic: 'Persistence', hits: 11 },
  { id: 'T1053', name: 'Scheduled Task/Job', tactic: 'Persistence', hits: 7 },
  { id: 'T1543', name: 'Create or Modify System Process', tactic: 'Persistence', hits: 5 },
  { id: 'T1548', name: 'Abuse Elevation Control Mechanism', tactic: 'Privilege Escalation', hits: 14 },
  { id: 'T1134', name: 'Access Token Manipulation', tactic: 'Privilege Escalation', hits: 9 },
  { id: 'T1055', name: 'Process Injection', tactic: 'Privilege Escalation', hits: 21 },
  { id: 'T1562', name: 'Impair Defenses', tactic: 'Defense Evasion', hits: 16 },
  { id: 'T1027', name: 'Obfuscated Files or Information', tactic: 'Defense Evasion', hits: 22 },
  { id: 'T1070', name: 'Indicator Removal', tactic: 'Defense Evasion', hits: 10 },
  { id: 'T1003', name: 'OS Credential Dumping', tactic: 'Credential Access', hits: 33 },
  { id: 'T1003.001', name: 'LSASS Memory', tactic: 'Credential Access', hits: 28 },
  { id: 'T1110', name: 'Brute Force', tactic: 'Credential Access', hits: 17 },
  { id: 'T1057', name: 'Process Discovery', tactic: 'Discovery', hits: 8 },
  { id: 'T1082', name: 'System Information Discovery', tactic: 'Discovery', hits: 6 },
  { id: 'T1083', name: 'File and Directory Discovery', tactic: 'Discovery', hits: 4 },
  { id: 'T1021', name: 'Remote Services', tactic: 'Lateral Movement', hits: 12 },
  { id: 'T1074', name: 'Data Staged', tactic: 'Collection', hits: 5 },
  { id: 'T1560', name: 'Archive Collected Data', tactic: 'Collection', hits: 4 },
  { id: 'T1041', name: 'Exfiltration Over C2 Channel', tactic: 'Exfiltration', hits: 7 },
  { id: 'T1071', name: 'Application Layer Protocol', tactic: 'Command and Control', hits: 9 },
  { id: 'T1486', name: 'Data Encrypted for Impact', tactic: 'Impact', hits: 6 },
  { id: 'T1485', name: 'Data Destruction', tactic: 'Impact', hits: 3 },
]

function HeatCell({ technique, maxHits, onClick, selected, isDark }) {
  const intensity = maxHits > 0 ? technique.hits / maxHits : 0
  const isHit = technique.hits > 0
  const isHighIntensity = intensity > 0.35

  let bg = 'var(--panel2)'
  let border = '1px solid var(--line)'
  let idColor = 'var(--muted)'
  let nameColor = 'var(--text)'
  let hitsColor = 'var(--muted)'

  if (isHit) {
    if (isHighIntensity) {
      bg = `rgba(239, 68, 68, ${Math.min(0.92, 0.55 + intensity * 0.4)})`
      border = '1px solid rgba(239, 68, 68, 0.95)'
      idColor = 'rgba(255, 255, 255, 0.85)'
      nameColor = '#ffffff'
      hitsColor = '#ffffff'
    } else {
      bg = isDark
        ? `rgba(239, 68, 68, ${0.18 + intensity * 0.28})`
        : `rgba(239, 68, 68, ${0.12 + intensity * 0.22})`
      border = isDark
        ? `1px solid rgba(239, 68, 68, ${0.4 + intensity * 0.3})`
        : `1px solid rgba(239, 68, 68, ${0.35 + intensity * 0.25})`
      idColor = isDark ? '#fca5a5' : '#b91c1c'
      nameColor = 'var(--text)'
      hitsColor = isDark ? '#f87171' : '#dc2626'
    }
  }

  return (
    <div
      onClick={() => onClick(technique)}
      title={`${technique.id}: ${technique.name} (${technique.hits} hits)`}
      style={{
        padding: '6px 7px',
        borderRadius: 6,
        background: selected ? (isDark ? 'rgba(59,130,246,0.35)' : 'rgba(59,130,246,0.18)') : bg,
        border: selected ? '1px solid var(--accent)' : border,
        boxShadow: selected ? '0 0 0 1px var(--accent)' : 'none',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        minWidth: 0,
      }}
      onMouseEnter={e => {
        if (!selected) {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
        }
        e.currentTarget.style.zIndex = '10'
      }}
      onMouseLeave={e => {
        if (!selected) {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = 'none'
        }
        e.currentTarget.style.zIndex = '1'
      }}
    >
      <div style={{ fontSize: 9.5, color: idColor, fontWeight: 700, marginBottom: 2 }}>{technique.id}</div>
      <div style={{
        fontSize: 10.5,
        color: nameColor,
        fontWeight: isHit ? 600 : 500,
        lineHeight: 1.35,
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
      }}>
        {technique.name}
      </div>
      {technique.hits > 0 && (
        <div style={{
          fontSize: 9.5,
          fontWeight: 700,
          color: hitsColor,
          marginTop: 3,
        }}>
          {technique.hits} hits
        </div>
      )}
    </div>
  )
}

export default function MITRE() {
  const { isDark } = useTheme()
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [view, setView] = useState('heatmap') // 'heatmap' | 'list'
  const [filterTactic, setFilterTactic] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getMitreCoverage()
      const fetched = res.data?.data || []
      setData(fetched.length > 0 ? fetched : DEMO_TECHNIQUES)
    } catch (e) {
      setData(DEMO_TECHNIQUES)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const maxHits = useMemo(() => Math.max(...data.map(d => d.hits || 0), 1), [data])

  const filteredData = useMemo(() => {
    let d = data
    if (search) {
      const s = search.toLowerCase()
      d = d.filter(t => t.id.toLowerCase().includes(s) || t.name.toLowerCase().includes(s))
    }
    if (filterTactic) {
      d = d.filter(t => t.tactic === filterTactic)
    }
    return d
  }, [data, search, filterTactic])

  const byTactic = useMemo(() => {
    const map = {}
    ALL_TACTICS.forEach(t => {
      map[t.name] = []
    })
    filteredData.forEach(tech => {
      if (map[tech.tactic] !== undefined) {
        map[tech.tactic].push(tech)
      } else {
        map[tech.tactic] = [tech]
      }
    })
    return map
  }, [filteredData])

  const stats = useMemo(() => {
    const covered = data.filter(d => d.hits > 0).length
    const totalHits = data.reduce((a, d) => a + (d.hits || 0), 0)
    const tacticsCovered = new Set(data.filter(d => d.hits > 0).map(d => d.tactic)).size
    return { total: data.length, covered, totalHits, tacticsCovered }
  }, [data])

  return (
    <Layout title="MITRE ATT&CK">
      {/* Header */}
      <div className="ph">
        <div className="ph-left">
          <div className="ic"><Grid size={20} /></div>
          <div>
            <h1>MITRE ATT&amp;CK Coverage</h1>
            <p>Ma trận độ phủ phát hiện theo framework MITRE ATT&amp;CK Enterprise</p>
          </div>
        </div>
        <div className="act" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4, background: 'var(--panel2)', borderRadius: 8, padding: 3 }}>
            {['heatmap', 'list'].map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: '5px 14px',
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  background: view === v ? 'var(--primary)' : 'transparent',
                  color: view === v ? '#fff' : 'var(--muted)',
                  transition: 'all 0.2s',
                }}
              >
                {v === 'heatmap' ? 'Heatmap' : 'Danh sách'}
              </button>
            ))}
          </div>
          <button className="b2" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Làm mới
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { icon: <Target size={18} color="#3b82f6" />, label: 'Kỹ thuật theo dõi', value: stats.total, sub: 'techniques', color: '#3b82f6' },
          { icon: <Eye size={18} color="#22c55e" />, label: 'Đã phát hiện', value: stats.covered, sub: `${stats.total > 0 ? Math.round(stats.covered / stats.total * 100) : 0}% coverage`, color: '#22c55e' },
          { icon: <AlertCircle size={18} color="#ef4444" />, label: 'Tổng sự kiện', value: stats.totalHits, sub: 'events logged', color: '#ef4444' },
          { icon: <Shield size={18} color="#a855f7" />, label: 'Tactics bị tấn công', value: stats.tacticsCovered, sub: `/ ${ALL_TACTICS.length} total`, color: '#a855f7' },
        ].map((s, i) => (
          <div key={i} className="card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ padding: 8, borderRadius: 8, background: `${s.color}15` }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{s.value.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.sub}</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search + Filter */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="q-wrap" style={{ flex: '1 1 240px', minWidth: 200 }}>
            <span className="q-icon"><Search size={15} /></span>
            <input
              className="q"
              placeholder="Tìm kỹ thuật (ID hoặc tên)..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            value={filterTactic}
            onChange={e => setFilterTactic(e.target.value)}
            style={{
              background: 'var(--panel2)',
              border: '1px solid var(--line)',
              color: 'var(--text)',
              padding: '7px 12px',
              borderRadius: 8,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <option value="">Tất cả Tactics</option>
            {ALL_TACTICS.map(t => (
              <option key={t.id} value={t.name}>{t.name}</option>
            ))}
          </select>
          {selected && (
            <button
              onClick={() => setSelected(null)}
              style={{
                padding: '7px 12px',
                borderRadius: 8,
                border: '1px solid rgba(59,130,246,0.4)',
                background: 'rgba(59,130,246,0.1)',
                color: 'var(--accent)',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              ✕ Bỏ chọn
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <RefreshCw size={28} className="spin" style={{ color: 'var(--muted)', margin: '0 auto 12px' }} />
          <div style={{ color: 'var(--muted)' }}>Đang tải ma trận MITRE ATT&amp;CK...</div>
        </div>
      ) : view === 'heatmap' ? (
        <>
          {/* Heatmap Matrix */}
          <div style={{ overflowX: 'auto', marginBottom: 16 }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${ALL_TACTICS.length}, minmax(110px, 1fr))`,
              gap: 6,
              minWidth: 1400,
              padding: 16,
              background: 'var(--panel)',
              borderRadius: 12,
              border: '1px solid var(--line)',
            }}>
              {/* Tactic Headers */}
              {ALL_TACTICS.map(tactic => (
                <div
                  key={tactic.id}
                  onClick={() => setFilterTactic(filterTactic === tactic.name ? '' : tactic.name)}
                  style={{
                    padding: '8px 6px',
                    borderRadius: 6,
                    background: filterTactic === tactic.name
                      ? `${tactic.color}25`
                      : `${tactic.color}10`,
                    border: filterTactic === tactic.name
                      ? `1.5px solid ${tactic.color}`
                      : `1px solid ${tactic.color}35`,
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ fontSize: 9.5, color: tactic.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {tactic.id}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text)', fontWeight: 600, marginTop: 2, lineHeight: 1.3 }}>
                    {tactic.name}
                  </div>
                  <div style={{ fontSize: 9.5, color: 'var(--muted)', marginTop: 2 }}>
                    {tactic.short}
                  </div>
                  <div style={{
                    marginTop: 4,
                    fontSize: 10,
                    fontWeight: 700,
                    color: byTactic[tactic.name]?.length > 0 ? tactic.color : 'var(--muted)'
                  }}>
                    {byTactic[tactic.name]?.length || 0} kỹ thuật
                  </div>
                </div>
              ))}

              {/* Technique cells per tactic */}
              {ALL_TACTICS.map(tactic => (
                <div key={`cells-${tactic.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {(byTactic[tactic.name] || []).map(tech => (
                    <HeatCell
                      key={tech.id}
                      technique={tech}
                      maxHits={maxHits}
                      selected={selected?.id === tech.id}
                      onClick={setSelected}
                      isDark={isDark}
                    />
                  ))}
                  {(!byTactic[tactic.name] || byTactic[tactic.name].length === 0) && (
                    <div style={{
                      padding: '12px 6px',
                      borderRadius: 6,
                      border: '1px dashed var(--line)',
                      background: 'var(--panel2)',
                      textAlign: 'center',
                      fontSize: 10.5,
                      color: 'var(--muted)',
                    }}>
                      Chưa có dữ liệu
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Detail panel when selected */}
          {selected && (
            <div className="card" style={{
              padding: 20,
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              boxShadow: 'var(--shadow-md)',
              marginBottom: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 14 }}>
                  <div style={{
                    width: 48, height: 48,
                    borderRadius: 10,
                    background: 'rgba(59,130,246,0.12)',
                    border: '1px solid rgba(59,130,246,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, color: 'var(--accent)',
                    flexShrink: 0,
                  }}>
                    {selected.id}
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                      {selected.name}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                        background: 'rgba(99,102,241,0.12)', color: isDark ? '#a5b4fc' : '#4f46e5',
                        border: '1px solid rgba(99,102,241,0.25)',
                      }}>
                        {selected.tactic}
                      </span>
                      <span style={{
                        padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                        background: selected.hits > 0 ? (isDark ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.1)') : 'var(--panel2)',
                        color: selected.hits > 0 ? (isDark ? '#fca5a5' : '#dc2626') : 'var(--muted)',
                        border: '1px solid ' + (selected.hits > 0 ? 'rgba(239,68,68,0.3)' : 'var(--line)'),
                      }}>
                        {selected.hits > 0 ? `${selected.hits} sự kiện phát hiện` : 'Chưa phát hiện'}
                      </span>
                      {selected.rule_count !== undefined && (
                        <span style={{
                          padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                          background: 'rgba(59,130,246,0.1)', color: 'var(--accent)',
                          border: '1px solid rgba(59,130,246,0.3)',
                        }}>
                          {selected.rule_count} detection rules
                        </span>
                      )}
                    </div>
                    {selected.description && (
                      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 8, lineHeight: 1.4 }}>
                        {selected.description}
                      </div>
                    )}
                  </div>
                </div>
                <a
                  href={`https://attack.mitre.org/techniques/${selected.id.replace('.', '/')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    background: 'rgba(59,130,246,0.1)', color: 'var(--accent)',
                    border: '1px solid rgba(59,130,246,0.3)',
                    textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <Info size={13} /> Xem trên MITRE
                </a>
              </div>
            </div>
          )}

          {/* Color legend */}
          <div className="card" style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Mức độ phát hiện:</span>
              {[
                { label: 'Không có dữ liệu', bg: 'var(--panel2)', border: 'var(--line)' },
                { label: 'Thấp (1–10)', bg: isDark ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.35)' },
                { label: 'Trung bình (11–30)', bg: isDark ? 'rgba(239,68,68,0.45)' : 'rgba(239,68,68,0.35)', border: 'rgba(239,68,68,0.55)' },
                { label: 'Cao (>30)', bg: isDark ? 'rgba(239,68,68,0.85)' : 'rgba(239,68,68,0.75)', border: 'rgba(239,68,68,0.9)' },
              ].map((l, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 24, height: 14, borderRadius: 3,
                    background: l.bg,
                    border: `1px solid ${l.border}`,
                  }} />
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        /* List view */
        <div className="card" style={{ padding: 0 }}>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 100 }}>ID</th>
                  <th>Kỹ thuật</th>
                  <th style={{ width: 180 }}>Tactic</th>
                  <th style={{ width: 120 }}>Sự kiện</th>
                  <th style={{ width: 120 }}>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>
                      Không tìm thấy kỹ thuật nào
                    </td>
                  </tr>
                ) : filteredData.map(tech => {
                  const tactic = ALL_TACTICS.find(t => t.name === tech.tactic)
                  return (
                    <tr key={tech.id} className="cl" onClick={() => setSelected(tech)} style={{ cursor: 'pointer' }}>
                      <td>
                        <span style={{
                          fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
                          color: 'var(--accent)',
                          padding: '2px 6px',
                          background: 'rgba(59,130,246,0.1)',
                          borderRadius: 4,
                        }}>
                          {tech.id}
                        </span>
                      </td>
                      <td style={{ fontWeight: 500, color: 'var(--text)' }}>{tech.name}</td>
                      <td>
                        <span style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 999,
                          background: tactic ? `${tactic.color}15` : 'rgba(100,116,139,0.15)',
                          color: tactic?.color || 'var(--muted)',
                          border: `1px solid ${tactic ? tactic.color + '30' : 'var(--line)'}`,
                          fontWeight: 600,
                        }}>
                          {tech.tactic}
                        </span>
                      </td>
                      <td>
                        {tech.hits > 0 ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{
                              height: 6,
                              width: Math.max(30, (tech.hits / maxHits) * 80),
                              background: `linear-gradient(90deg, rgba(239,68,68,0.6), rgba(239,68,68,0.9))`,
                              borderRadius: 3,
                            }} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: isDark ? '#fca5a5' : '#dc2626' }}>{tech.hits}</span>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>
                        )}
                      </td>
                      <td>
                        {tech.hits > 0 ? (
                          <span className="tag s-crit">Phát hiện</span>
                        ) : (
                          <span className="tag">Chưa phát hiện</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  )
}
