// ==============================================================
// src/pages/Dashboard.jsx
// ==============================================================
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  LayoutDashboard, AlertTriangle, FolderOpen, Activity,
  Server, TrendingUp, RefreshCw
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'
import Layout from '../components/layout/Layout'
import SeverityBadge from '../components/ui/SeverityBadge'
import StatusBadge from '../components/ui/StatusBadge'
import { getDashboardStats } from '../api/dashboard'
import { getAlerts } from '../api/alerts'
import { getAgents } from '../api/agents'
import { useToast } from '../contexts/ToastContext'

import { ago, formatDateTime } from '../utils/date'

const SEV_COLORS = { critical: '#f85149', high: '#e36209', medium: '#d29922', low: '#3fb950' }
const PIE_COLORS = ['#f85149','#e36209','#d29922','#3fb950','#58a6ff']

export default function Dashboard() {
  const [stats, setStats]     = useState(null)
  const [alerts, setAlerts]   = useState([])
  const [agents, setAgents]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [lastRefresh, setLastRefresh] = useState(null)
  const toast = useToast()
  // Dùng ref để tránh toast object làm invalidate useCallback và gây vòng lặp vô hạn
  const toastRef = useRef(toast)
  toastRef.current = toast

  // load KHÔNG phụ thuộc vào toast object → sẽ không bị recreate mỗi lần toast state thay đổi
  const load = useCallback(async (silent = false) => {
    setError('')
    if (!silent) setLoading(true)
    try {
      const [sRes, aRes, agRes] = await Promise.all([
        getDashboardStats(),
        getAlerts({ page: 1, limit: 10, status: 'new' }),
        getAgents({ limit: 5 }),
      ])
      setStats(sRes.data)
      setAlerts(aRes.data?.data || [])
      setAgents(agRes.data?.data || [])
      setLastRefresh(new Date())
    } catch (e) {
      setError(e.message)
      if (!silent) toastRef.current.error('Không tải được dữ liệu tổng quan')
    } finally {
      if (!silent) setLoading(false)
    }
  }, []) // deps rỗng – hàm này ổn định suốt vòng đời component

  // Chỉ chạy 1 lần khi mount
  useEffect(() => { load() }, [load])

  // Auto-refresh ngầm mỗi 30s + lắng nghe event WebSocket alert mới
  // Dùng ref chứa load để tránh effect bị re-register mỗi lần render
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    const handleNewAlert = () => loadRef.current(true)
    window.addEventListener('soc:new_alert', handleNewAlert)
    const t = setInterval(() => loadRef.current(true), 30000)
    return () => {
      window.removeEventListener('soc:new_alert', handleNewAlert)
      clearInterval(t)
    }
  }, []) // deps rỗng – chỉ register 1 lần

  const KPI = [
    { label: 'Cảnh báo mới',   value: stats?.total_alerts_new ?? stats?.by_status?.new ?? '—', cls: 'k-crit', icon: AlertTriangle },
    { label: 'Cảnh báo hôm nay',value: stats?.total_alerts_today  ?? '—', cls: 'k-high', icon: TrendingUp },
    { label: 'Sự cố mở',       value: stats?.total_cases_open ?? stats?.active_cases ?? '—', cls: 'k-med',  icon: FolderOpen },
    { label: 'Agent online',    value: stats?.agents_online        ?? '—', cls: 'k-ok',   icon: Server },
    { label: 'Agent offline',   value: stats?.agents_offline ?? (stats?.agents_total != null ? Math.max(0, stats.agents_total - (stats.agents_online || 0)) : '—'), cls: 'k-info', icon: Activity },
  ]

  // Build chart data from stats
  const rawTrend = stats?.alerts_by_hour || stats?.alert_trend || []
  const barData = rawTrend.map(h => ({
    // Lưu giá trị giờ dạng số để format đẹp
    time: h.time || (h.hour ? (h.hour.includes(':') ? h.hour : `${h.hour}:00`) : ''),
    hour: h.hour || (h.time ? h.time.split(':')[0] : '0'),
    critical: h.critical || 0,
    high:     h.high     || 0,
    medium:   h.medium   || 0,
    low:      h.low      || 0,
  }))

  // Formatter trục X: "08h", "14h" – ngắn gọn, dễ đọc
  const xTickFormatter = (val) => {
    const h = val?.split(':')?.[0] ?? val
    return `${String(h).padStart(2, '0')}h`
  }

  // Tooltip label: "14:00 – 15:00"
  const tooltipLabel = (val) => {
    const h = parseInt(val?.split(':')?.[0] ?? val, 10)
    const next = (h + 1) % 24
    return `${String(h).padStart(2,'0')}:00 – ${String(next).padStart(2,'0')}:00`
  }

  const pieData = [
    { name: 'Nghiêm trọng', value: stats?.severity_critical ?? stats?.critical_alerts ?? stats?.by_severity?.critical ?? 0, color: SEV_COLORS.critical },
    { name: 'Cao',           value: stats?.severity_high     ?? stats?.by_severity?.high ?? 0,     color: SEV_COLORS.high },
    { name: 'Trung bình',   value: stats?.severity_medium   ?? stats?.by_severity?.medium ?? 0,   color: SEV_COLORS.medium },
    { name: 'Thấp',         value: stats?.severity_low      ?? stats?.by_severity?.low ?? 0,      color: SEV_COLORS.low },
  ].filter(d => d.value > 0)

  return (
    <Layout title="Tổng quan">
      {/* Page header */}
      <div className="ph">
        <div className="ph-left">
          <div className="ic"><LayoutDashboard size={20} /></div>
          <div>
            <h1>Tổng quan</h1>
            <p>Bảng điều khiển giám sát an ninh thời gian thực{lastRefresh ? ` · Cập nhật ${ago(lastRefresh)}` : ''}</p>
          </div>
        </div>
        <div className="act">
          <button className="b2" onClick={load} disabled={loading}>
            <RefreshCw size={15} style={loading ? { animation: 'spin .7s linear infinite' } : {}} />
            Làm mới
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(248,81,73,.1)', border: '1px solid var(--crit)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: 'var(--crit)', fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚠ {error}</span>
          <button className="b2" style={{ padding: '4px 10px', fontSize: 12 }} onClick={load}>Thử lại</button>
        </div>
      )}

      {/* KPI Cards */}
      {loading ? (
        <div className="grid kpis" style={{ marginBottom: 20 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card kpi">
              <div className="skeleton" style={{ height: 32, width: '60%', marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 12, width: '80%' }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid kpis" style={{ marginBottom: 20 }}>
          {KPI.map(k => (
            <div key={k.label} className={`card kpi ${k.cls}`}>
              <div className="kpi-val">{k.value}</div>
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-icon"><k.icon /></div>
            </div>
          ))}
        </div>
      )}

      {/* Charts row */}
      <div className="grid-2" style={{ marginBottom: 20 }}>
        {/* Bar chart – alerts by hour */}
        <div className="card">
          <h2>Cảnh báo theo giờ <span>24 giờ qua</span></h2>
          {loading ? (
            <div className="skeleton" style={{ height: 180, borderRadius: 8 }} />
          ) : barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={barData} margin={{ top: 4, right: 4, bottom: 0, left: -24 }} barCategoryGap="30%">
                <XAxis
                  dataKey="time"
                  tickFormatter={xTickFormatter}
                  tick={{ fontSize: 11, fill: 'var(--muted)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--line, #30363d)' }}
                  interval={2}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--muted)' }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={28}
                />
                <Tooltip
                  labelFormatter={tooltipLabel}
                  contentStyle={{ background: 'var(--panel, #161b22)', border: '1px solid var(--line, #30363d)', borderRadius: 8, fontSize: 12, color: '#ffffff', padding: '8px 12px' }}
                  itemStyle={{ color: '#c9d1d9', padding: '2px 0' }}
                  labelStyle={{ color: '#58a6ff', fontWeight: 600, marginBottom: 4 }}
                  cursor={{ fill: 'rgba(88,166,255,0.06)' }}
                />
                <Bar dataKey="low"      stackId="a" fill={SEV_COLORS.low}      name="Thấp" />
                <Bar dataKey="medium"   stackId="a" fill={SEV_COLORS.medium}   name="Trung bình" />
                <Bar dataKey="high"     stackId="a" fill={SEV_COLORS.high}     name="Cao" />
                <Bar dataKey="critical" stackId="a" fill={SEV_COLORS.critical} name="Nghiêm trọng" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 14 }}>
              Chưa có dữ liệu biểu đồ
            </div>
          )}
        </div>

        {/* Pie chart – severity */}
        <div className="card">
          <h2>Phân bổ mức độ <span>Tất cả cảnh báo</span></h2>
          {loading ? (
            <div className="skeleton" style={{ height: 200, borderRadius: 8 }} />
          ) : pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={3}>
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'var(--panel, #161b22)', border: '1px solid var(--line, #30363d)', borderRadius: 8, fontSize: 12, color: '#ffffff' }}
                  itemStyle={{ color: '#ffffff' }}
                  labelStyle={{ color: '#ffffff' }}
                />
                <Legend iconType="circle" iconSize={10} formatter={(v) => <span style={{ color: 'var(--muted)', fontSize: 12 }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 14 }}>
              Chưa có dữ liệu
            </div>
          )}
        </div>
      </div>

      {/* Bottom row: recent alerts + agents */}
      <div className="grid-2">
        {/* Recent Alerts */}
        <div className="card">
          <h2>Cảnh báo gần đây <span>Trạng thái: Mới</span></h2>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 44, borderRadius: 6 }} />
              ))}
            </div>
          ) : alerts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: 14 }}>
              🎉 Không có cảnh báo mới
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {alerts.map(a => (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 6,
                  background: 'var(--panel2)',
                  marginBottom: 2,
                }}>
                  <SeverityBadge value={a.severity} />
                  <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.title || a.event_type}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>
                    {ago(a.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Agents */}
        <div className="card">
          <h2>Agents gần đây <span>5 mới nhất</span></h2>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 44, borderRadius: 6 }} />
              ))}
            </div>
          ) : agents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: 14 }}>
              Chưa có agent nào kết nối
            </div>
          ) : (
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Hostname</th>
                    <th>IP</th>
                    <th>Trạng thái</th>
                    <th>OS</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map(ag => (
                    <tr key={ag.id || ag.agent_id}>
                      <td style={{ fontSize: 13, fontWeight: 500 }}>{ag.hostname}</td>
                      <td className="mono">{ag.ip_address || ag.ip || '—'}</td>
                      <td><StatusBadge value={ag.status || (ag.is_online ? 'online' : 'offline')} /></td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{ag.os || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
