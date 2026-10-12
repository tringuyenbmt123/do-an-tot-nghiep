// ==============================================================
// src/pages/Vulns.jsx - Vulnerability Management
// CVE tracking, CVSS scoring, patching status & risk overview
// ==============================================================
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Bug, Search, RefreshCw, AlertTriangle, Shield, CheckCircle2, Clock, TrendingUp, ExternalLink, Filter } from 'lucide-react'
import Layout from '../components/layout/Layout'
import SkeletonTable from '../components/ui/SkeletonTable'
import Pagination from '../components/ui/Pagination'
import { getVulns } from '../api/vulns'
import { useDebounce } from '../hooks/useDebounce'

const PAGE_SIZE = 25

const SEVERITY_CONFIG = {
  critical: { label: 'Critical', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', min: 9.0 },
  high:     { label: 'High',     color: '#f97316', bg: 'rgba(249,115,22,0.12)', min: 7.0 },
  medium:   { label: 'Medium',   color: '#eab308', bg: 'rgba(234,179,8,0.12)',  min: 4.0 },
  low:      { label: 'Low',      color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  min: 0 },
}

const STATUS_CONFIG = {
  open:     { label: 'Chưa vá',     color: '#ef4444', bg: 'rgba(239,68,68,0.12)',    icon: '🔴' },
  patching: { label: 'Đang vá',     color: '#eab308', bg: 'rgba(234,179,8,0.12)',    icon: '🟡' },
  fixed:    { label: 'Đã vá',       color: '#22c55e', bg: 'rgba(34,197,94,0.12)',    icon: '🟢' },
  accepted: { label: 'Chấp nhận',   color: '#64748b', bg: 'rgba(100,116,139,0.12)', icon: '⚪' },
}

function getSeverity(cvss) {
  if (cvss >= 9.0) return 'critical'
  if (cvss >= 7.0) return 'high'
  if (cvss >= 4.0) return 'medium'
  return 'low'
}

function CvssRing({ score }) {
  const sev = getSeverity(score)
  const cfg = SEVERITY_CONFIG[sev]
  const pct = (score / 10) * 100
  const r = 14
  const circumference = 2 * Math.PI * r
  const dash = (pct / 100) * circumference

  return (
    <div style={{ position: 'relative', width: 40, height: 40, flexShrink: 0 }}>
      <svg width="40" height="40" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(51,65,85,0.5)" strokeWidth="4" />
        <circle
          cx="20" cy="20" r={r}
          fill="none" stroke={cfg.color}
          strokeWidth="4"
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeLinecap="round"
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 700, color: cfg.color,
      }}>
        {score}
      </div>
    </div>
  )
}

function DaysUntilDue({ dueDate }) {
  if (!dueDate) return <span style={{ color: '#334155' }}>—</span>
  const due = new Date(dueDate)
  const now = new Date()
  const days = Math.ceil((due - now) / (1000 * 60 * 60 * 24))
  const isOverdue = days < 0
  const isUrgent = days >= 0 && days <= 7

  return (
    <div>
      <div style={{
        fontSize: 12,
        color: isOverdue ? '#ef4444' : isUrgent ? '#f97316' : '#94a3b8',
        fontWeight: isOverdue || isUrgent ? 600 : 400,
      }}>
        {due.toLocaleDateString('vi-VN')}
      </div>
      <div style={{
        fontSize: 10,
        color: isOverdue ? '#ef4444' : isUrgent ? '#f97316' : '#475569',
        fontWeight: 600,
      }}>
        {isOverdue ? `Quá hạn ${Math.abs(days)} ngày` : days === 0 ? 'Hôm nay!' : `Còn ${days} ngày`}
      </div>
    </div>
  )
}

export default function Vulns() {
  const [vulns, setVulns]     = useState([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [filterSev, setFilterSev]     = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterExploited, setFilterExploited] = useState(false)
  const [selectedVuln, setSelectedVuln] = useState(null)
  const dSearch = useDebounce(search, 400)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getVulns({ page, limit: PAGE_SIZE, q: dSearch })
      setVulns(res.data?.data || [])
      setTotal(res.data?.total || 0)
    } catch (e) {
      setVulns([])
    } finally {
      setLoading(false)
    }
  }, [page, dSearch])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [dSearch])

  // Client-side filter for severity/status/exploited (server doesn't support these yet)
  const filtered = useMemo(() => {
    let data = vulns
    if (filterSev) {
      const cfg = SEVERITY_CONFIG[filterSev]
      const nextSev = ['critical', 'high', 'medium', 'low']
      const next = nextSev[nextSev.indexOf(filterSev) + 1]
      const nextMin = next ? SEVERITY_CONFIG[next].min : -1
      data = data.filter(v => {
        const cvss = parseFloat(v.cvss)
        return cvss >= cfg.min && (nextMin < 0 || cvss < (filterSev === 'medium' ? 7.0 : filterSev === 'low' ? 4.0 : 10.1))
      })
    }
    if (filterStatus) data = data.filter(v => v.status === filterStatus)
    if (filterExploited) data = data.filter(v => v.exploited)
    return data
  }, [vulns, filterSev, filterStatus, filterExploited])

  const stats = useMemo(() => {
    return {
      total: total,
      critical: vulns.filter(v => parseFloat(v.cvss) >= 9).length,
      high: vulns.filter(v => parseFloat(v.cvss) >= 7 && parseFloat(v.cvss) < 9).length,
      exploited: vulns.filter(v => v.exploited).length,
      open: vulns.filter(v => v.status === 'open').length,
      patching: vulns.filter(v => v.status === 'patching').length,
      fixed: vulns.filter(v => v.status === 'fixed').length,
    }
  }, [vulns, total])

  return (
    <Layout title="Quản lý Lỗ hổng">
      {/* Header */}
      <div className="ph">
        <div className="ph-left">
          <div className="ic"><Bug size={20} /></div>
          <div>
            <h1>Lỗ hổng (Vulnerabilities)</h1>
            <p>Quản lý rủi ro, CVE tracking và trạng thái vá lỗ hổng bảo mật</p>
          </div>
        </div>
        <div className="act">
          <button className="b2" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Làm mới
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div className="card" style={{ padding: '14px 16px', borderLeft: '3px solid #ef4444' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444' }}>{stats.critical}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Critical (CVSS ≥ 9)</div>
        </div>
        <div className="card" style={{ padding: '14px 16px', borderLeft: '3px solid #f97316' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#f97316' }}>{stats.high}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>High (CVSS 7–9)</div>
        </div>
        <div className="card" style={{ padding: '14px 16px', borderLeft: '3px solid #dc2626' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#dc2626' }}>{stats.exploited}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Đang bị khai thác</div>
        </div>
        <div className="card" style={{ padding: '14px 16px', borderLeft: '3px solid #ef4444' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444' }}>{stats.open}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Chưa vá</div>
        </div>
        <div className="card" style={{ padding: '14px 16px', borderLeft: '3px solid #eab308' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#eab308' }}>{stats.patching}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Đang vá</div>
        </div>
        <div className="card" style={{ padding: '14px 16px', borderLeft: '3px solid #22c55e' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#22c55e' }}>{stats.fixed}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Đã vá xong</div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="q-wrap" style={{ flex: '1 1 200px', minWidth: 160 }}>
            <span className="q-icon"><Search size={15} /></span>
            <input
              className="q"
              placeholder="Tìm CVE hoặc mô tả..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Severity filter chips */}
          <div style={{ display: 'flex', gap: 4 }}>
            {Object.entries(SEVERITY_CONFIG).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => setFilterSev(filterSev === key ? '' : key)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: `1px solid ${filterSev === key ? cfg.color : 'rgba(51,65,85,0.5)'}`,
                  background: filterSev === key ? cfg.bg : 'transparent',
                  color: filterSev === key ? cfg.color : '#64748b',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {cfg.label}
              </button>
            ))}
          </div>

          {/* Status filter */}
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            style={{
              background: 'var(--panel2)',
              border: '1px solid var(--line)',
              color: 'var(--text)',
              padding: '6px 10px',
              borderRadius: 8,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <option value="">Tất cả trạng thái</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>

          {/* Exploited filter */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: filterExploited ? '#ef4444' : '#64748b' }}>
            <input
              type="checkbox"
              checked={filterExploited}
              onChange={e => setFilterExploited(e.target.checked)}
              style={{ accentColor: '#ef4444' }}
            />
            Đang bị khai thác
          </label>

          {(filterSev || filterStatus || filterExploited) && (
            <button
              onClick={() => { setFilterSev(''); setFilterStatus(''); setFilterExploited(false) }}
              style={{
                padding: '5px 10px', borderRadius: 6, fontSize: 11,
                background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                border: '1px solid rgba(239,68,68,0.25)', cursor: 'pointer',
              }}
            >
              ✕ Xóa bộ lọc
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 16 }}><SkeletonTable cols={6} rows={8} /></div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Bug size={36} style={{ color: 'var(--muted)', margin: '0 auto 12px' }} />
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>Không tìm thấy lỗ hổng nào</div>
          </div>
        ) : (
          <>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 140 }}>CVE ID</th>
                    <th>Mô tả</th>
                    <th style={{ width: 90, textAlign: 'center' }}>CVSS</th>
                    <th style={{ width: 100 }}>Severity</th>
                    <th style={{ width: 110 }}>Khai thác</th>
                    <th style={{ width: 140 }}>Hạn vá</th>
                    <th style={{ width: 110 }}>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(v => {
                    const sev = getSeverity(parseFloat(v.cvss))
                    const sevCfg = SEVERITY_CONFIG[sev]
                    const statusCfg = STATUS_CONFIG[v.status] || STATUS_CONFIG.open
                    const isSelected = selectedVuln?.cve === v.cve

                    return (
                      <tr
                        key={v.cve}
                        className="cl"
                        onClick={() => setSelectedVuln(isSelected ? null : v)}
                        style={{
                          cursor: 'pointer',
                          background: isSelected ? 'rgba(59,130,246,0.06)' : undefined,
                        }}
                      >
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <a
                              href={`https://nvd.nist.gov/vuln/detail/${v.cve}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              style={{
                                color: '#60a5fa',
                                fontFamily: 'monospace',
                                fontWeight: 700,
                                fontSize: 12,
                                textDecoration: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 3,
                              }}
                            >
                              {v.cve}
                              <ExternalLink size={10} />
                            </a>
                          </div>
                        </td>
                        <td style={{ fontSize: 13, color: '#cbd5e1', maxWidth: 320 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {v.description}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <CvssRing score={parseFloat(v.cvss)} />
                        </td>
                        <td>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                            background: sevCfg.bg, color: sevCfg.color,
                            border: `1px solid ${sevCfg.color}40`,
                          }}>
                            {sev.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          {v.exploited ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span style={{
                                width: 8, height: 8, borderRadius: '50%',
                                background: '#ef4444',
                                boxShadow: '0 0 6px rgba(239,68,68,0.6)',
                                display: 'inline-block',
                                animation: 'pulse 2s infinite',
                              }} />
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#ef4444' }}>Đang bị khai thác</span>
                            </div>
                          ) : (
                            <span style={{ fontSize: 12, color: '#334155' }}>Không</span>
                          )}
                        </td>
                        <td>
                          <DaysUntilDue dueDate={v.due_date} />
                        </td>
                        <td>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                            background: statusCfg.bg, color: statusCfg.color,
                            border: `1px solid ${statusCfg.color}40`,
                          }}>
                            {statusCfg.icon} {statusCfg.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Expanded detail row */}
            {selectedVuln && (
              <div style={{
                margin: '0 16px 16px',
                padding: 16,
                borderRadius: 8,
                background: 'rgba(30,41,59,0.8)',
                border: '1px solid rgba(59,130,246,0.25)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', marginBottom: 6 }}>
                      {selectedVuln.cve} — {selectedVuln.description}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>
                        CVSS Score: <strong style={{ color: SEVERITY_CONFIG[getSeverity(parseFloat(selectedVuln.cvss))].color }}>{selectedVuln.cvss}</strong>
                      </span>
                      <span style={{ color: '#334155' }}>·</span>
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>
                        Trạng thái: <strong style={{ color: STATUS_CONFIG[selectedVuln.status]?.color }}>{STATUS_CONFIG[selectedVuln.status]?.label}</strong>
                      </span>
                      {selectedVuln.due_date && (
                        <>
                          <span style={{ color: '#334155' }}>·</span>
                          <span style={{ fontSize: 12, color: '#94a3b8' }}>
                            Hạn vá: <strong style={{ color: '#e2e8f0' }}>{selectedVuln.due_date}</strong>
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <a
                      href={`https://nvd.nist.gov/vuln/detail/${selectedVuln.cve}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                        background: 'rgba(59,130,246,0.1)', color: '#60a5fa',
                        border: '1px solid rgba(59,130,246,0.25)',
                        textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5,
                      }}
                    >
                      <ExternalLink size={12} /> NVD Database
                    </a>
                    <a
                      href={`https://www.cve.org/CVERecord?id=${selectedVuln.cve}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                        background: 'rgba(168,85,247,0.1)', color: '#c084fc',
                        border: '1px solid rgba(168,85,247,0.25)',
                        textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5,
                      }}
                    >
                      <ExternalLink size={12} /> CVE.org
                    </a>
                  </div>
                </div>
              </div>
            )}

            <div style={{ padding: '10px 16px' }}>
              <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}
