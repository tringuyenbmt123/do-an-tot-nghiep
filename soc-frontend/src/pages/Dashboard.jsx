// ==============================================================
// src/pages/Dashboard.jsx
// ==============================================================
import React, { useState, useEffect, useCallback, useRef } from 'react'
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

const SEV_COLORS = { critical: '#f85149', high: '#e36209', medium: '#d29922', low: '#3fb950' }
const PIE_COLORS = ['#f85149','#e36209','#d29922','#3fb950','#58a6ff']

const ago = (ts) => {
  if (!ts) return '—'
  const sec = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (sec < 60) return `${sec}s trước`
  if (sec < 3600) return `${Math.floor(sec/60)}p trước`
  if (sec < 86400) return `${Math.floor(sec/3600)}h trước`
  return new Date(ts).toLocaleDateString('vi-VN')
}

export default function Dashboard() {
  const [stats, setStats]     = useState(null)
  const [alerts, setAlerts]   = useState([])
  const [agents, setAgents]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [lastRefresh, setLastRefresh] = useState(null)
  const toast = useToast()

  const load = useCallback(async () => {
    setError('')
    setLoading(true)
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
      toast.error('Không tải được dữ liệu tổng quan')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  // Auto-refresh every 30s
  useEffect(() => {
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [load])

  const KPI = [
    { label: 'Cảnh báo mới',   value: stats?.total_alerts_new     ?? '—', cls: 'k-crit', icon: AlertTriangle },
    { label: 'Cảnh báo hôm nay',value: stats?.total_alerts_today  ?? '—', cls: 'k-high', icon: TrendingUp },
    { label: 'Sự cố mở',       value: stats?.total_cases_open     ?? '—', cls: 'k-med',  icon: FolderOpen },
    { label: 'Agent online',    value: stats?.agents_online        ?? '—', cls: 'k-ok',   icon: Server },
    { label: 'Agent offline',   value: stats?.agents_offline       ?? '—', cls: 'k-info', icon: Activity },
  ]

  // Build chart data from stats
  const barData = stats?.alerts_by_hour?.map(h => ({
    time: `${h.hour}:00`,
    critical: h.critical || 0,
    high:     h.high     || 0,
    medium:   h.medium   || 0,
    low:      h.low      || 0,
  })) || []

  const pieData = [
    { name: 'Nghiêm trọng', value: stats?.severity_critical ?? 0, color: SEV_COLORS.critical },
    { name: 'Cao',           value: stats?.severity_high     ?? 0, color: SEV_COLORS.high },
    { name: 'Trung bình',   value: stats?.severity_medium   ?? 0, color: SEV_COLORS.medium },
    { name: 'Thấp',         value: stats?.severity_low      ?? 0, color: SEV_COLORS.low },
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
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <XAxis dataKey="time" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: 'var(--text)' }}
                />
                <Bar dataKey="critical" stackId="a" fill={SEV_COLORS.critical} name="Nghiêm trọng" />
                <Bar dataKey="high"     stackId="a" fill={SEV_COLORS.high}     name="Cao" />
                <Bar dataKey="medium"   stackId="a" fill={SEV_COLORS.medium}   name="Trung bình" radius={[4,4,0,0]} />
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
                  contentStyle={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
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
