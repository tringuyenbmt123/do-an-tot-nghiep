// ==============================================================
// src/pages/Assets.jsx - Asset & Endpoint Inventory
// Server, workstation, network, cloud asset management
// ==============================================================
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Server, Search, RefreshCw, Plus, Monitor, Cloud, Network,
  Laptop, Shield, AlertTriangle, Clock, Filter
} from 'lucide-react'
import Layout from '../components/layout/Layout'
import SkeletonTable from '../components/ui/SkeletonTable'
import EmptyState from '../components/ui/EmptyState'
import Pagination from '../components/ui/Pagination'
import { getAssets } from '../api/assets'
import { useDebounce } from '../hooks/useDebounce'

const PAGE_SIZE = 50

const TYPE_CONFIG = {
  server:      { label: 'Server',      icon: <Server size={14} />,  color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  workstation: { label: 'Workstation', icon: <Laptop size={14} />,  color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  network:     { label: 'Network',     icon: <Network size={14} />, color: '#a855f7', bg: 'rgba(168,85,247,0.12)' },
  cloud:       { label: 'Cloud',       icon: <Cloud size={14} />,   color: '#06b6d4', bg: 'rgba(6,182,212,0.12)' },
}

const CRIT_CONFIG = {
  high: { label: 'Cao',    color: '#ef4444', bg: 'rgba(239,68,68,0.12)',    dot: '#ef4444' },
  med:  { label: 'Trung',  color: '#eab308', bg: 'rgba(234,179,8,0.12)',    dot: '#eab308' },
  low:  { label: 'Thấp',   color: '#22c55e', bg: 'rgba(34,197,94,0.12)',    dot: '#22c55e' },
}

function LastSeenBadge({ lastSeen }) {
  if (!lastSeen) return <span style={{ fontSize: 12, color: '#334155' }}>—</span>
  const dt = new Date(lastSeen)
  const minutes = Math.floor((Date.now() - dt) / 60000)
  const online = minutes < 15

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: online ? '#22c55e' : '#ef4444',
          boxShadow: online ? '0 0 5px rgba(34,197,94,0.6)' : 'none',
          display: 'inline-block',
        }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: online ? '#22c55e' : '#ef4444' }}>
          {online ? 'Online' : 'Offline'}
        </span>
      </div>
      <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>
        {dt.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}
      </div>
    </div>
  )
}

export default function Assets() {
  const [assets, setAssets]   = useState([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [filterType, setFilterType]   = useState('')
  const [filterCrit, setFilterCrit]   = useState('')
  const [viewMode, setViewMode]       = useState('table') // 'table' | 'grid'
  const dSearch = useDebounce(search, 400)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getAssets({ page, limit: PAGE_SIZE, q: dSearch })
      setAssets(res.data?.data || [])
      setTotal(res.data?.total || 0)
    } catch (e) {
      setAssets([])
    } finally {
      setLoading(false)
    }
  }, [page, dSearch])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [dSearch])

  // Client-side filter
  const filtered = useMemo(() => {
    let data = assets
    if (filterType) data = data.filter(a => a.type === filterType)
    if (filterCrit) data = data.filter(a => a.criticality === filterCrit)
    return data
  }, [assets, filterType, filterCrit])

  const stats = useMemo(() => {
    const all = assets
    return {
      total,
      server: all.filter(a => a.type === 'server').length,
      workstation: all.filter(a => a.type === 'workstation').length,
      network: all.filter(a => a.type === 'network').length,
      cloud: all.filter(a => a.type === 'cloud').length,
      highCrit: all.filter(a => a.criticality === 'high').length,
    }
  }, [assets, total])

  return (
    <Layout title="Tài sản & Endpoint">
      {/* Header */}
      <div className="ph">
        <div className="ph-left">
          <div className="ic"><Server size={20} /></div>
          <div>
            <h1>Quản lý Tài sản &amp; Endpoint</h1>
            <p>Kiểm kê server, workstation và đánh giá rủi ro · {total.toLocaleString()} thiết bị</p>
          </div>
        </div>
        <div className="act" style={{ display: 'flex', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4, background: 'var(--panel2)', borderRadius: 8, padding: 3 }}>
            {['table', 'grid'].map(v => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                style={{
                  padding: '4px 10px', borderRadius: 5, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600,
                  background: viewMode === v ? 'var(--primary)' : 'transparent',
                  color: viewMode === v ? '#fff' : 'var(--muted)',
                  transition: 'all 0.2s',
                }}
              >
                {v === 'table' ? '☰ Bảng' : '⊞ Lưới'}
              </button>
            ))}
          </div>
          <button className="b1" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
            <Plus size={14} /> Thêm tài sản
          </button>
          <button className="b2" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Làm mới
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Tổng tài sản', value: stats.total, color: '#3b82f6', icon: <Shield size={16} color="#3b82f6" /> },
          { label: 'Server', value: stats.server, color: '#3b82f6', icon: <Server size={16} color="#3b82f6" /> },
          { label: 'Workstation', value: stats.workstation, color: '#22c55e', icon: <Laptop size={16} color="#22c55e" /> },
          { label: 'Network', value: stats.network, color: '#a855f7', icon: <Network size={16} color="#a855f7" /> },
          { label: 'Cloud', value: stats.cloud, color: '#06b6d4', icon: <Cloud size={16} color="#06b6d4" /> },
          { label: 'Độ quan trọng cao', value: stats.highCrit, color: '#ef4444', icon: <AlertTriangle size={16} color="#ef4444" /> },
        ].map((s, i) => (
          <div key={i} className="card" style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ padding: 6, borderRadius: 6, background: `${s.color}15` }}>{s.icon}</div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="q-wrap" style={{ flex: '1 1 200px', minWidth: 160 }}>
            <span className="q-icon"><Search size={15} /></span>
            <input
              className="q"
              placeholder="Tìm hostname hoặc IP..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Type filter chips */}
          <div style={{ display: 'flex', gap: 4 }}>
            {Object.entries(TYPE_CONFIG).map(([k, v]) => (
              <button
                key={k}
                onClick={() => setFilterType(filterType === k ? '' : k)}
                style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                  border: `1px solid ${filterType === k ? v.color : 'rgba(51,65,85,0.5)'}`,
                  background: filterType === k ? v.bg : 'transparent',
                  color: filterType === k ? v.color : '#64748b',
                  cursor: 'pointer', transition: 'all 0.15s',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}
              >
                {v.icon} {v.label}
              </button>
            ))}
          </div>

          {/* Criticality filter */}
          <div style={{ display: 'flex', gap: 4 }}>
            {Object.entries(CRIT_CONFIG).map(([k, v]) => (
              <button
                key={k}
                onClick={() => setFilterCrit(filterCrit === k ? '' : k)}
                style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                  border: `1px solid ${filterCrit === k ? v.color : 'rgba(51,65,85,0.5)'}`,
                  background: filterCrit === k ? v.bg : 'transparent',
                  color: filterCrit === k ? v.color : '#64748b',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                ⚑ {v.label}
              </button>
            ))}
          </div>

          {(filterType || filterCrit) && (
            <button
              onClick={() => { setFilterType(''); setFilterCrit('') }}
              style={{
                padding: '5px 10px', borderRadius: 6, fontSize: 11,
                background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                border: '1px solid rgba(239,68,68,0.25)', cursor: 'pointer',
              }}
            >✕ Xóa bộ lọc</button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="card" style={{ padding: 16 }}><SkeletonTable cols={6} rows={8} /></div>
      ) : filtered.length === 0 ? (
        <div className="card"><EmptyState message="Không tìm thấy tài sản nào" /></div>
      ) : viewMode === 'grid' ? (
        /* Grid view */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {filtered.map(a => {
            const typeCfg = TYPE_CONFIG[a.type] || TYPE_CONFIG.server
            const critCfg = CRIT_CONFIG[a.criticality] || CRIT_CONFIG.med
            const lastSeen = a.last_seen ? new Date(a.last_seen) : null
            const online = lastSeen && (Date.now() - lastSeen) < 15 * 60 * 1000

            return (
              <div key={a.id} className="card" style={{
                padding: 16,
                border: `1px solid ${typeCfg.color}20`,
                transition: 'all 0.2s',
                cursor: 'pointer',
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = `${typeCfg.color}50`}
                onMouseLeave={e => e.currentTarget.style.borderColor = `${typeCfg.color}20`}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: typeCfg.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: typeCfg.color,
                  }}>
                    {React.cloneElement(typeCfg.icon, { size: 18 })}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: online ? '#22c55e' : '#475569',
                      boxShadow: online ? '0 0 5px rgba(34,197,94,0.5)' : 'none',
                    }} />
                    <span style={{ fontSize: 10, color: online ? '#22c55e' : '#475569', fontWeight: 600 }}>
                      {online ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>
                <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: 14, marginBottom: 3 }}>
                  {a.hostname}
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                  {a.ip || 'IP không xác định'}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{
                    padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                    background: typeCfg.bg, color: typeCfg.color,
                    border: `1px solid ${typeCfg.color}30`,
                  }}>
                    {typeCfg.label}
                  </span>
                  <span style={{
                    padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                    background: critCfg.bg, color: critCfg.color,
                  }}>
                    {critCfg.label}
                  </span>
                </div>
                {a.os && (
                  <div style={{ fontSize: 11, color: '#475569', marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                    {a.os}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        /* Table view */
        <div className="card" style={{ padding: 0 }}>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Hostname</th>
                  <th style={{ width: 130 }}>IP</th>
                  <th style={{ width: 120 }}>Loại thiết bị</th>
                  <th style={{ width: 140 }}>Hệ điều hành</th>
                  <th style={{ width: 100 }}>Chủ sở hữu</th>
                  <th style={{ width: 100 }}>Độ quan trọng</th>
                  <th style={{ width: 140 }}>Lần cuối thấy</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => {
                  const typeCfg = TYPE_CONFIG[a.type] || TYPE_CONFIG.server
                  const critCfg = CRIT_CONFIG[a.criticality] || CRIT_CONFIG.med

                  return (
                    <tr key={a.id} className="cl">
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: 6,
                            background: typeCfg.bg,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: typeCfg.color,
                            flexShrink: 0,
                          }}>
                            {typeCfg.icon}
                          </div>
                          <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{a.hostname}</span>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#94a3b8' }}>
                          {a.ip || '—'}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                          background: typeCfg.bg, color: typeCfg.color,
                          border: `1px solid ${typeCfg.color}30`,
                        }}>
                          {typeCfg.icon}
                          {typeCfg.label}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{a.os || '—'}</td>
                      <td style={{ fontSize: 13 }}>{a.owner || '—'}</td>
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                          background: critCfg.bg, color: critCfg.color,
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: critCfg.dot }} />
                          {critCfg.label}
                        </span>
                      </td>
                      <td>
                        <LastSeenBadge lastSeen={a.last_seen} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 16px' }}>
            <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
          </div>
        </div>
      )}
    </Layout>
  )
}
