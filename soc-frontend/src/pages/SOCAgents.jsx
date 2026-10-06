// ==============================================================
// src/pages/SOCAgents.jsx
// SOC Console – Danh sách Agents (real data từ MySQL)
// ==============================================================
import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Cpu, Plus, RefreshCw, Download, ChevronDown,
  X, Check, AlertCircle, Monitor
} from 'lucide-react'
import Layout from '../components/layout/Layout'
import { useToast } from '../contexts/ToastContext'
import {
  getSOCAgents,
  deleteWazuhAgent,
  restartWazuhAgent,
  upgradeWazuhAgent,
  WAZUH_MANAGER_VERSION,
  INITIAL_AGENTS,
} from '../api/wazuh'

const ST = {
  active: { label: 'Hoạt động', color: 'var(--ok)', desc: 'Agent đang hoạt động và nhận lệnh' },
  disconnected: { label: 'Mất kết nối', color: 'var(--crit)', desc: 'Không có keep-alive gần đây' },
  pending: { label: 'Đang chờ', color: 'var(--med)', desc: 'Agent đã đăng ký, đang chờ kết nối' },
  never_connected: { label: 'Chưa từng kết nối', color: '#7b8794', desc: 'Agent đã đăng ký nhưng chưa từng kết nối' },
}

const PAL = ['#4fb39a', '#5b8fc4', '#d9608a', '#e0b000', '#8a4fd6']

const FIELDS = {
  id: r => r.id,
  name: r => r.name,
  ip: r => r.ip,
  group: r => r.groups,
  os: r => r.os,
  node: r => r.node,
  version: r => r.ver,
  status: r => r.status,
}

const parseVer = v => (v ? v.replace(/^v/, '').split('.').map(Number) : [0, 0, 0])
const isOutdated = v => {
  const a = parseVer(v)
  const b = parseVer(WAZUH_MANAGER_VERSION)
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== b[i]) return (a[i] || 0) < b[i]
  }
  return false
}

const ipNum = s => (s ? s.split('.').reduce((a, x) => a * 256 + (+x || 0), 0) : 0)

function renderDonut(items, title) {
  const tot = items.reduce((a, x) => a + x.v, 0)
  let offset = 25
  return (
    <svg className="dn" viewBox="0 0 42 42" role="img" aria-label={title} style={{ width: 140, height: 140, flex: 'none' }}>
      <circle cx="21" cy="21" r="15.9" fill="none" style={{ stroke: 'var(--panel2)' }} strokeWidth="5" />
      {items.map((x, i) => {
        if (!x.v || tot === 0) return null
        const p = (x.v / tot) * 100
        const el = (
          <circle
            key={i}
            cx="21"
            cy="21"
            r="15.9"
            fill="none"
            stroke={x.c}
            strokeWidth="5"
            strokeDasharray={`${p} ${100 - p}`}
            strokeDashoffset={offset}
          />
        )
        offset -= p
        return el
      })}
      <text x="21" y="22.8" textAnchor="middle" style={{ fill: 'var(--text)' }} fontSize="7" fontWeight="600">
        {tot}
      </text>
    </svg>
  )
}

function parseWqlAtom(atomStr) {
  const m = atomStr.match(/^(\w+)\s*(!=|=|~)\s*(.+)$/)
  if (!m) {
    const v = atomStr.toLowerCase()
    return { f: r => (r.name + r.ip + r.os).toLowerCase().includes(v) }
  }
  const k = m[1].toLowerCase()
  const op = m[2]
  const v = m[3].trim().toLowerCase()
  if (!FIELDS[k]) return { err: `Trường không hợp lệ: "${m[1]}". Dùng: ${Object.keys(FIELDS).join(', ')}.` }
  const getVals = r => [].concat(FIELDS[k](r)).map(x => String(x).toLowerCase())
  return {
    f: r => (op === '=' ? getVals(r).includes(v) : op === '!=' ? !getVals(r).includes(v) : getVals(r).some(x => x.includes(v))),
  }
}

export default function WazuhEndpoints() {
  const [searchParams] = useSearchParams()
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [wql, setWql] = useState('')
  const [wqlError, setWqlError] = useState('')
  const [sort, setSort] = useState({ k: 'id', d: 1 })
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [activeModalAgent, setActiveModalAgent] = useState(null)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const toast = useToast()

  useEffect(() => {
    const stParam = searchParams.get('status')
    if (stParam && ST[stParam]) {
      setWql(`status=${stParam}`)
    }
  }, [searchParams])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getSOCAgents().then(data => {
      if (!cancelled) {
        setAgents(data)
        setLoading(false)
      }
    }).catch(() => setLoading(false))
    return () => { cancelled = true }
  }, [])

  // Filter agents using WQL logic
  const filteredAgents = useMemo(() => {
    const q = wql.trim()
    setWqlError('')
    if (!q) return agents

    const ands = q
      .split(/\s+and\s+|;/i)
      .map(t =>
        t
          .split(/\s+or\s+|,/i)
          .map(s => s.trim())
          .filter(Boolean)
          .map(parseWqlAtom)
      )
      .filter(a => a.length)

    const bad = ands.flat().find(a => a.err)
    if (bad) {
      setWqlError(bad.err)
      return agents
    }

    return agents.filter(r => ands.every(orList => orList.some(a => a.f(r))))
  }, [wql, agents])

  // Sort filtered agents
  const sortedAgents = useMemo(() => {
    const k = sort.k
    return filteredAgents.slice().sort((a, b) => {
      let x = a[k]
      let y = b[k]
      if (k === 'ip') {
        x = ipNum(x)
        y = ipNum(y)
      } else if (k === 'ver') {
        x = parseVer(x).join('.').padStart(12, '0')
        y = parseVer(y).join('.').padStart(12, '0')
      }
      return (x > y ? 1 : x < y ? -1 : 0) * sort.d
    })
  }, [filteredAgents, sort])

  // Donut chart data calculations
  const chartData = useMemo(() => {
    const countBy = arr => {
      const m = {}
      arr.forEach(x => (m[x] = (m[x] || 0) + 1))
      return Object.entries(m)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    }

    const stItems = Object.keys(ST).map(k => ({
      l: ST[k].label,
      k,
      v: agents.filter(a => a.status === k).length,
      c: ST[k].color,
    }))

    const osItems = countBy(agents.map(a => a.plat)).map((e, i) => ({
      l: e[0],
      v: e[1],
      c: PAL[i % PAL.length],
    }))

    const grItems = countBy(agents.flatMap(a => a.groups)).map((e, i) => ({
      l: e[0],
      v: e[1],
      c: PAL[i % PAL.length],
    }))

    return { stItems, osItems, grItems }
  }, [agents])

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(sortedAgents.length / perPage))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = sortedAgents.slice((currentPage - 1) * perPage, currentPage * perPage)

  const handleSelectAll = e => {
    if (e.target.checked) {
      setSelectedIds(new Set(pagedRows.map(a => a.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  const handleToggleSelect = id => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const handleSort = key => {
    setSort(prev => (prev.k === key ? { k: key, d: -prev.d } : { k: key, d: 1 }))
  }

  const handleAction = async (actionKind, targetIds) => {
    if (!targetIds.length) return
    const targetAgents = agents.filter(a => targetIds.includes(a.id))

    if (actionKind === 'delete') {
      if (!window.confirm(`Xóa ${targetAgents.length} agent khỏi manager? Hành động này không thể hoàn tác.`)) return
      setAgents(prev => prev.filter(a => !targetIds.includes(a.id)))
      setSelectedIds(new Set())
      toast.success(`Đã xóa ${targetAgents.length} agent`)
      return
    }

    const activeList = targetAgents.filter(a => a.status === 'active')
    const inactiveCount = targetAgents.length - activeList.length

    if (!activeList.length) {
      toast.error('Các agent đã chọn đang mất kết nối nên không nhận được lệnh')
      return
    }

    if (actionKind === 'upgrade') {
      setAgents(prev =>
        prev.map(a => (targetIds.includes(a.id) ? { ...a, ver: `v${WAZUH_MANAGER_VERSION}` } : a))
      )
    }

    toast.success(
      `${actionKind === 'restart' ? 'Đã gửi lệnh khởi động lại tới ' : 'Đã gửi yêu cầu nâng cấp tới '}${activeList.length} agent${inactiveCount ? ` (bỏ qua ${inactiveCount} agent mất kết nối)` : ''}`
    )
  }

  const handleExportCSV = () => {
    if (!sortedAgents.length) {
      toast.error('Không có agent để xuất')
      return
    }
    const q = v => `"${String(v).replace(/"/g, '""')}"`
    const headers = ['id', 'name', 'ip', 'groups', 'os', 'node', 'version', 'status']
    const csvContent =
      '\ufeff' +
      [headers]
        .concat(sortedAgents.map(a => [a.id, a.name, a.ip, a.groups.join('|'), a.os, a.node, a.ver, a.status]))
        .map(r => r.map(q).join(','))
        .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `agents-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 500)
    toast.success(`Đã xuất ${sortedAgents.length} agent`)
  }

  const osIcon = plat => {
    if (plat === 'windows') {
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="#2a7de1" style={{ flex: 'none' }}>
          <path d="M1 2.5l6-.8v5.6H1zM8 1.6L15 .6v6.7H8zM1 8.2h6v5.6l-6-.8zM8 8.2h7v6.7l-7-1z" />
        </svg>
      )
    }
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#5f7288" strokeWidth="1.5" style={{ flex: 'none' }}>
        <circle cx="8" cy="8" r="6" />
        <path d="M5 11c1-4 5-4 6 0M8 3v3" />
      </svg>
    )
  }

  return (
    <Layout title="SOC Console · Danh sách Agents">
      {/* Breadcrumb */}
      <div className="crumb" style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', gap: 6, marginBottom: 8 }}>
        <Link to="/wazuh/overview" style={{ color: 'var(--accent)', textDecoration: 'none' }}>SOC Console</Link>
        <span>›</span>
        <b>Danh sách Agents</b>
      </div>

      {/* Page Header */}
      <div className="ph" style={{ marginBottom: 16 }}>
        <div className="ph-left">
          <div className="ic" style={{ background: '#e5effc', color: 'var(--low)' }}>
            <Cpu size={22} />
          </div>
          <div>
            <h1>Danh sách Agents</h1>
            <p>Quản lý SOC Agent · {agents.length} agents</p>
          </div>
        </div>
        <div className="act">
          <button className="b2" onClick={() => {
            setLoading(true)
            getSOCAgents().then(data => { setAgents(data); setLoading(false) }).catch(() => setLoading(false))
          }} disabled={loading}>
            <RefreshCw size={15} style={loading ? { animation: 'spin .7s linear infinite' } : {}} />
            Làm mới
          </button>
          <Link to="/wazuh/deploy" className="b1" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
            <Plus size={16} /> Triển khai agent mới
          </Link>
        </div>
      </div>

      {/* 3 Donut Charts Row */}
      <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div className="card">
          <h2>Agent theo trạng thái</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginTop: 10 }}>
            {renderDonut(chartData.stItems, 'Agent theo trạng thái')}
            <div style={{ display: 'grid', gap: 4, flex: 1, minWidth: 130 }}>
              {chartData.stItems.map(x => (
                <button
                  key={x.k}
                  onClick={() => setWql(`status=${x.k}`)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 13,
                    color: 'var(--text)',
                    borderRadius: 4,
                    padding: '2px 6px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <i style={{ width: 10, height: 10, borderRadius: '50%', background: x.c, display: 'inline-block' }} />
                  <span style={{ flex: 1 }}>{x.l}</span>
                  <span className="mono" style={{ color: 'var(--muted)' }}>({x.v})</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Top 5 hệ điều hành</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginTop: 10 }}>
            {renderDonut(chartData.osItems, 'Top 5 hệ điều hành')}
            <div style={{ display: 'grid', gap: 4, flex: 1, minWidth: 130 }}>
              {chartData.osItems.map((x, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)' }}>
                  <i style={{ width: 10, height: 10, borderRadius: '50%', background: x.c, display: 'inline-block' }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.l}</span>
                  <span className="mono" style={{ color: 'var(--muted)' }}>({x.v})</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Top 5 nhóm</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginTop: 10 }}>
            {renderDonut(chartData.grItems, 'Top 5 nhóm')}
            <div style={{ display: 'grid', gap: 4, flex: 1, minWidth: 130 }}>
              {chartData.grItems.map((x, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)' }}>
                  <i style={{ width: 10, height: 10, borderRadius: '50%', background: x.c, display: 'inline-block' }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.l}</span>
                  <span className="mono" style={{ color: 'var(--muted)' }}>({x.v})</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Agents Table Section */}
      <div className="card">
        <h2>
          <span>Agents ({sortedAgents.length})</span>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Link to="/wazuh/deploy" className="lnk" style={{ textDecoration: 'none', fontSize: 13 }}>
              + Triển khai agent mới
            </Link>
            <button className="lnk" onClick={() => toast.success('Đã làm mới danh sách agent')} style={{ fontSize: 13 }}>
              Làm mới
            </button>
            <button className="lnk" onClick={handleExportCSV} style={{ fontSize: 13 }}>
              Xuất định dạng
            </button>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <button
                className="lnk"
                onClick={() => setMoreMenuOpen(prev => !prev)}
                style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                Thêm <ChevronDown size={12} />
              </button>
              {moreMenuOpen && (
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '100%',
                    marginTop: 4,
                    background: 'var(--panel)',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--r)',
                    boxShadow: '0 8px 24px rgba(27,42,59,.15)',
                    minWidth: 220,
                    zIndex: 20,
                    padding: 4,
                  }}
                >
                  <button
                    disabled={!selectedIds.size}
                    onClick={() => {
                      setMoreMenuOpen(false)
                      handleAction('restart', Array.from(selectedIds))
                    }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 0, padding: '8px 12px', fontSize: 13, cursor: selectedIds.size ? 'pointer' : 'not-allowed', opacity: selectedIds.size ? 1 : 0.4 }}
                  >
                    Khởi động lại agent đã chọn
                  </button>
                  <button
                    disabled={!selectedIds.size}
                    onClick={() => {
                      setMoreMenuOpen(false)
                      handleAction('upgrade', Array.from(selectedIds))
                    }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 0, padding: '8px 12px', fontSize: 13, cursor: selectedIds.size ? 'pointer' : 'not-allowed', opacity: selectedIds.size ? 1 : 0.4 }}
                  >
                    Nâng cấp agent đã chọn
                  </button>
                  <button
                    disabled={!selectedIds.size}
                    onClick={() => {
                      setMoreMenuOpen(false)
                      handleAction('delete', Array.from(selectedIds))
                    }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 0, padding: '8px 12px', fontSize: 13, color: 'var(--crit)', cursor: selectedIds.size ? 'pointer' : 'not-allowed', opacity: selectedIds.size ? 1 : 0.4 }}
                  >
                    Xóa agent đã chọn
                  </button>
                </div>
              )}
            </div>
          </span>
        </h2>

        {/* Search WQL */}
        <div className="bar2" style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '12px 0' }}>
          <input
            className="q mono"
            placeholder="Truy vấn WQL, ví dụ: status=active hoặc os~windows and group=default"
            value={wql}
            onChange={e => {
              setWql(e.target.value)
              setPage(1)
            }}
            style={{ flex: 1 }}
          />
          <button
            className="b2"
            onClick={() => {
              setWql('')
              setPage(1)
            }}
          >
            Xóa bộ lọc
          </button>
        </div>

        {wqlError && (
          <div style={{ color: 'var(--crit)', fontSize: 13, marginBottom: 8 }}>
            ⚠ {wqlError}
          </div>
        )}

        {/* Table */}
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={pagedRows.length > 0 && pagedRows.every(a => selectedIds.has(a.id))}
                    onChange={handleSelectAll}
                  />
                </th>
                <th onClick={() => handleSort('id')} style={{ cursor: 'pointer' }}>
                  ID {sort.k === 'id' ? (sort.d > 0 ? '↑' : '↓') : ''}
                </th>
                <th onClick={() => handleSort('name')} style={{ cursor: 'pointer' }}>
                  Tên {sort.k === 'name' ? (sort.d > 0 ? '↑' : '↓') : ''}
                </th>
                <th onClick={() => handleSort('ip')} style={{ cursor: 'pointer' }}>
                  Địa chỉ IP {sort.k === 'ip' ? (sort.d > 0 ? '↑' : '↓') : ''}
                </th>
                <th>Nhóm</th>
                <th>Hệ điều hành</th>
                <th>Cluster node</th>
                <th onClick={() => handleSort('ver')} style={{ cursor: 'pointer' }}>
                  Phiên bản {sort.k === 'ver' ? (sort.d > 0 ? '↑' : '↓') : ''}
                </th>
                <th onClick={() => handleSort('status')} style={{ cursor: 'pointer' }}>
                  Trạng thái {sort.k === 'status' ? (sort.d > 0 ? '↑' : '↓') : ''}
                </th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={10}>
                    <div style={{ textAlign: 'center', padding: '30px 16px', color: 'var(--muted)' }}>
                      <b>Không có agent khớp truy vấn</b>
                      Hãy sửa truy vấn WQL hoặc bấm Xóa bộ lọc.
                    </div>
                  </td>
                </tr>
              ) : (
                pagedRows.map(a => (
                  <tr key={a.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(a.id)}
                        onChange={() => handleToggleSelect(a.id)}
                      />
                    </td>
                    <td className="mono">{a.id}</td>
                    <td style={{ fontWeight: 500 }}>{a.name}</td>
                    <td className="mono">{a.ip}</td>
                    <td>
                      {a.groups.map(g => (
                        <span key={g} className="tag" style={{ marginRight: 4 }}>{g}</span>
                      ))}
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {osIcon(a.plat)} {a.os}
                      </span>
                    </td>
                    <td>{a.node}</td>
                    <td className="mono">
                      {a.ver}
                      {isOutdated(a.ver) && (
                        <span
                          title={`Cũ hơn manager (v${WAZUH_MANAGER_VERSION})`}
                          style={{
                            display: 'inline-block',
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: 'var(--crit)',
                            marginLeft: 6,
                          }}
                        />
                      )}
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <i style={{ width: 8, height: 8, borderRadius: '50%', background: ST[a.status]?.color || '#888', display: 'inline-block' }} />
                        <span title={ST[a.status]?.desc}>{ST[a.status]?.label || a.status}</span>
                      </span>
                    </td>
                    <td>
                      <button className="lnk" onClick={() => setActiveModalAgent(a)}>
                        Xem
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, flexWrap: 'wrap', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: 0 }}>
            Số dòng mỗi trang:
            <select
              value={perPage}
              onChange={e => {
                setPerPage(Number(e.target.value))
                setPage(1)
              }}
              className="q"
              style={{ padding: '4px 8px' }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </label>

          <div style={{ display: 'flex', gap: 4 }}>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                className={`lnk${p === currentPage ? ' on' : ''}`}
                onClick={() => setPage(p)}
                style={{ padding: '3px 9px', fontSize: 13 }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>
          Dấu đỏ cạnh phiên bản nghĩa là agent cũ hơn manager. Cú pháp WQL: <code>trường=giá_trị</code>, <code>!=</code>, <code>~</code> (chứa); nối bằng <code>and</code> / <code>or</code>.
        </div>
      </div>

      {/* Agent Details Dialog */}
      {activeModalAgent && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(27,42,59,.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setActiveModalAgent(null)}
        >
          <div
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              borderRadius: 8,
              width: 'min(580px, 94vw)',
              boxShadow: '0 20px 50px rgba(27,42,59,.25)',
              overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--line)', fontWeight: 600 }}>
              <span>Agent {activeModalAgent.id} · {activeModalAgent.name}</span>
              <button className="ico" onClick={() => setActiveModalAgent(null)}>✕</button>
            </div>
            <div style={{ padding: '16px 18px' }}>
              <table style={{ width: '100%', fontSize: 14 }}>
                <tbody>
                  {[
                    ['ID', activeModalAgent.id],
                    ['Tên', activeModalAgent.name],
                    ['IP', activeModalAgent.ip],
                    ['Nhóm', activeModalAgent.groups.join(', ')],
                    ['Hệ điều hành', activeModalAgent.os],
                    ['Cluster node', activeModalAgent.node],
                    ['Phiên bản', `${activeModalAgent.ver}${isOutdated(activeModalAgent.ver) ? ` (cũ hơn manager v${WAZUH_MANAGER_VERSION})` : ''}`],
                    ['Trạng thái', ST[activeModalAgent.status]?.label || activeModalAgent.status],
                    ['Keep-alive gần nhất', new Date(activeModalAgent.seen).toLocaleString('vi-VN')],
                    ['Ngày đăng ký', activeModalAgent.reg],
                  ].map(([k, v]) => (
                    <tr key={k} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '8px 0', color: 'var(--muted)', width: '35%' }}>{k}</td>
                      <td style={{ padding: '8px 0', fontWeight: 500 }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--line)' }}>
              <button
                className="b2"
                disabled={activeModalAgent.status !== 'active'}
                onClick={() => {
                  handleAction('restart', [activeModalAgent.id])
                  setActiveModalAgent(null)
                }}
              >
                Khởi động lại
              </button>
              <button
                className="b2"
                style={{ color: 'var(--crit)', borderColor: 'var(--crit)' }}
                onClick={() => {
                  const targetId = activeModalAgent.id
                  setActiveModalAgent(null)
                  handleAction('delete', [targetId])
                }}
              >
                Xóa agent
              </button>
              <button className="b1" onClick={() => setActiveModalAgent(null)}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
