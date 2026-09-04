// =============================================================================
// src/pages/DashboardPage.jsx — v2 Cyberpunk Enterprise Redesign
// =============================================================================

import {
  Activity,
  AlertTriangle,
  Bell,
  Cpu,
  RefreshCw,
  Shield,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import MetricCard from '../components/common/MetricCard';
import SeverityBadge from '../components/common/SeverityBadge';
import StatusBadge from '../components/common/StatusBadge';
import { useApp } from '../context/AppContext';
import { useDashboardStats } from '../hooks/useDashboardStats';
import { useWebSocket } from '../hooks/useWebSocket';

// ─── Dark tooltip for all charts ──────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#1e293b',
      border: '1px solid #334155',
      borderRadius: '10px',
      padding: '10px 14px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    }}>
      <p style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: 600 }}>{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color || '#f8fafc', fontSize: '12px', fontWeight: 600 }}>
          {p.name}: <span style={{ color: '#f8fafc' }}>{p.value}</span>
        </p>
      ))}
    </div>
  );
};

// ─── Gradient defs for AreaChart ──────────────────────────────────────────────
const ChartGradients = () => (
  <defs>
    <linearGradient id="gradCritical" x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%"  stopColor="#ff3366" stopOpacity={0.25} />
      <stop offset="95%" stopColor="#ff3366" stopOpacity={0} />
    </linearGradient>
    <linearGradient id="gradHigh" x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%"  stopColor="#ff9900" stopOpacity={0.2} />
      <stop offset="95%" stopColor="#ff9900" stopOpacity={0} />
    </linearGradient>
    <linearGradient id="gradMedium" x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%"  stopColor="#eab308" stopOpacity={0.15} />
      <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
    </linearGradient>
    <linearGradient id="gradBar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"  stopColor="#06b6d4" />
      <stop offset="100%" stopColor="#3b82f6" />
    </linearGradient>
  </defs>
);

// ─── Pie chart custom legend ───────────────────────────────────────────────────
const PieLegend = ({ data }) => (
  <div className="flex flex-col gap-1.5 mt-2">
    {data.map((d) => (
      <div key={d.name} className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
          <span style={{ color: '#94a3b8' }}>{d.name}</span>
        </div>
        <span className="font-semibold font-mono" style={{ color: '#f8fafc' }}>{d.value}</span>
      </div>
    ))}
  </div>
);

// ─── Live Alert Row ────────────────────────────────────────────────────────────
const LiveAlertRow = ({ alert, isNew }) => (
  <tr className={isNew ? 'flash' : ''} style={{ animation: isNew ? 'flash-row 2s ease-out' : 'none' }}>
    <td><SeverityBadge severity={alert.severity} /></td>
    <td className="max-w-xs">
      <p className="truncate font-medium" style={{ color: '#f8fafc', fontSize: '12.5px' }}>
        {alert.title || alert.event_type}
      </p>
    </td>
    <td>
      <span className="font-mono text-xs" style={{ color: '#94a3b8' }}>
        {alert.agent?.hostname || alert.agent_id?.substring(0, 8) || '—'}
      </span>
    </td>
    <td>
      {alert.mitre_tactic ? (
        <span style={{
          padding: '2px 8px', borderRadius: '5px',
          background: 'rgba(59,130,246,0.12)', color: '#60a5fa',
          fontSize: '11px', fontWeight: 600, fontFamily: 'monospace',
          border: '1px solid rgba(59,130,246,0.2)',
        }}>
          {alert.mitre_tactic}
        </span>
      ) : <span style={{ color: '#475569' }}>—</span>}
    </td>
    <td><StatusBadge status={alert.status} type="alert" /></td>
    <td className="font-mono whitespace-nowrap" style={{ color: '#64748b', fontSize: '11.5px' }}>
      {new Date(alert.created_at).toLocaleTimeString('en-GB')}
    </td>
  </tr>
);

// =============================================================================
// Main Component
// =============================================================================
export default function DashboardPage() {
  const { addToast, addLiveAlert, setWsConnected, liveAlerts } = useApp();
  const { stats, loading, refresh }     = useDashboardStats();
  const [recentIds, setRecentIds]       = useState(new Set());
  const feedRef                         = useRef(null);

  // WebSocket handler
  const handleWsMessage = useCallback((data) => {
    if (data?.type !== 'new_alert' || !data.payload) return;

    const payload = data.payload;
    const alert = {
      id:         payload.id || crypto.randomUUID(),
      severity:   payload.severity || 'low',
      title:      payload.title || payload.event_type || 'Security Event',
      event_type: payload.event_type,
      agent:      payload.agent || null,
      agent_id:   payload.agent_id,
      mitre_tactic: payload.mitre_tactic,
      status:     payload.status || 'new',
      created_at: payload.created_at || data.time || new Date().toISOString(),
    };
    addLiveAlert(alert);
    setRecentIds((prev) => {
      const next = new Set(prev);
      next.add(alert.id);
      setTimeout(() => setRecentIds((p) => { const s = new Set(p); s.delete(alert.id); return s; }), 2500);
      return next;
    });
    if (alert.severity === 'critical' || alert.severity === 'high') {
      addToast({ severity: alert.severity, title: alert.title, message: alert.agent?.hostname ? `Agent: ${alert.agent.hostname}` : undefined });
    }
    if (feedRef.current) feedRef.current.scrollTop = 0;
  }, [addLiveAlert, addToast]);

  const { isConnected, reconnectAttempts } = useWebSocket(handleWsMessage);
  useEffect(() => { setWsConnected(isConnected); }, [isConnected, setWsConnected]);

  // Merge API + live alerts
  const [apiAlerts, setApiAlerts] = useState([]);
  useEffect(() => {
    import('../services/api').then(({ getAlerts }) => {
      getAlerts({ limit: 50 }).then((res) => setApiAlerts(res.data || []));
    });
  }, []);

  const allAlerts = [
    ...liveAlerts,
    ...apiAlerts.filter((a) => !liveAlerts.some((la) => la.id === a.id)),
  ].slice(0, 80);

  // --- Safe data access (không fallback hardcode, chỉ null-safe) ---
  const safeStats = {
    total_alerts_today:    stats?.total_alerts_today    ?? null,
    critical_alerts:       stats?.critical_alerts        ?? null,
    agents_online:         stats?.agents_online          ?? null,
    agents_total:          stats?.agents_total           ?? null,
    active_cases:          stats?.active_cases           ?? null,
    alert_trend:           stats?.alert_trend            || [],
    severity_distribution: stats?.severity_distribution  || [],
    top_agents:            stats?.top_agents             || [],
  };

  const agentsLabel = safeStats.agents_online != null
    ? `${safeStats.agents_online} / ${safeStats.agents_total ?? '?'}`
    : null;

  const pieData = safeStats.severity_distribution;

  return (
    <div className="flex flex-col gap-5 p-6 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2.5" style={{ color: '#f8fafc' }}>
            <span style={{
              background: 'linear-gradient(135deg,rgba(6,182,212,0.2),rgba(6,182,212,0.05))',
              border: '1px solid rgba(6,182,212,0.25)',
              borderRadius: '10px', padding: '6px 8px',
              display: 'inline-flex', alignItems: 'center',
            }}>
              <Activity size={18} style={{ color: '#06b6d4' }} />
            </span>
            Dashboard &amp; SIEM Analytics
          </h1>
          <p className="text-xs mt-1" style={{ color: '#64748b' }}>
            Real-time security event monitoring • {new Date().toLocaleDateString('en-GB', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
          </p>
        </div>
        <button onClick={refresh} className="btn-ghost flex items-center gap-2 text-xs">
          <RefreshCw size={12} style={{ color: '#06b6d4' }} />
          Refresh
        </button>
      </div>

      {/* ── Metric Cards ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          title="Total Alerts Today"
          value={safeStats.total_alerts_today}
          icon={Bell} color="cyan"
          subtitle="Across all monitored agents"
          loading={loading}
        />
        <MetricCard
          title="Critical Alerts"
          value={safeStats.critical_alerts}
          icon={AlertTriangle} color="red"
          subtitle="Require immediate action"
          loading={loading}
        />
        <MetricCard
          title="Agents Online"
          value={agentsLabel}
          icon={Cpu} color="green"
          subtitle={safeStats.agents_online != null
            ? `${Math.max(0, (safeStats.agents_total ?? 0) - safeStats.agents_online)} offline`
            : 'Fetching...'}
          loading={loading}
        />
        <MetricCard
          title="Active Cases"
          value={safeStats.active_cases}
          icon={Shield} color="orange"
          subtitle="Open investigations"
          loading={loading}
        />
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* AreaChart: Alert Trends 24h */}
        <div className="soc-card p-5 xl:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: '#f8fafc' }}>
                <Zap size={14} style={{ color: '#06b6d4' }} />
                Alert Trends — Last 24 Hours
              </h3>
              <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>Alert volume by severity over time</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              {[['#ff3366','Critical'],['#ff9900','High'],['#eab308','Medium']].map(([color,label]) => (
                <span key={label} className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 rounded-full inline-block" style={{ background: color }} />
                  <span style={{ color: '#64748b' }}>{label}</span>
                </span>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={safeStats.alert_trend} margin={{ left: -20, right: 8, top: 4 }}>
              <ChartGradients />
              <CartesianGrid strokeDasharray="3 4" stroke="#1e293b" />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#64748b' }} interval={3} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="critical" stroke="#ff3366" strokeWidth={2} fill="url(#gradCritical)" name="Critical" dot={false} />
              <Area type="monotone" dataKey="high"     stroke="#ff9900" strokeWidth={2} fill="url(#gradHigh)"     name="High"     dot={false} />
              <Area type="monotone" dataKey="medium"   stroke="#eab308" strokeWidth={1.5} fill="url(#gradMedium)" name="Medium"   dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Pie Chart: Severity Distribution */}
        <div className="soc-card p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: '#f8fafc' }}>Severity Distribution</h3>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%" cy="50%"
                innerRadius={48} outerRadius={72}
                paddingAngle={3} dataKey="value"
                strokeWidth={0}
              >
                {pieData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <PieLegend data={pieData} />
        </div>
      </div>

      {/* ── Top Agents Bar Chart ── */}
      <div className="soc-card p-5">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: '#f8fafc' }}>
          <Cpu size={14} style={{ color: '#10b981' }} />
          Top 5 Most Affected Agents
        </h3>
        <ResponsiveContainer width="100%" height={170}>
          <BarChart data={safeStats.top_agents} margin={{ left: -20, right: 10 }} layout="vertical">
            <defs>
              <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%"   stopColor="#06b6d4" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 4" stroke="#1e293b" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis dataKey="hostname" type="category" tick={{ fontSize: 11, fill: '#94a3b8', fontFamily: 'JetBrains Mono, monospace' }} width={140} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="alert_count" name="Alerts" fill="url(#barGrad)" radius={[0, 5, 5, 0]} maxBarSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Live Alert Feed ── */}
      <div className="soc-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid #1e293b' }}>
          <h3 className="text-sm font-semibold flex items-center gap-2.5" style={{ color: '#f8fafc' }}>
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'status-dot-online' : 'status-dot-offline'}`} />
            Real-time Live Alert Feed
            <span className="text-xs font-normal px-2 py-0.5 rounded-full" style={{ background: '#1e293b', color: '#64748b' }}>
              {allAlerts.length} alerts
            </span>
          </h3>
          {!isConnected && (
            <span className="text-xs flex items-center gap-1.5 px-3 py-1 rounded-full"
              style={{ background: 'rgba(234,179,8,0.1)', color: '#eab308', border: '1px solid rgba(234,179,8,0.2)' }}>
              <RefreshCw size={10} className="animate-spin" />
              Reconnecting{reconnectAttempts > 0 ? ` (#${reconnectAttempts})` : '...'}
            </span>
          )}
        </div>

        <div className="overflow-auto" style={{ maxHeight: '380px' }} ref={feedRef}>
          <table className="soc-table">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Event Title</th>
                <th>Agent</th>
                <th>MITRE Tactic</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {allAlerts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16" style={{ color: '#475569' }}>
                    {loading ? 'Loading alerts...' : '⚡ No alerts yet — Waiting for incoming security events...'}
                  </td>
                </tr>
              ) : (
                allAlerts.map((alert) => (
                  <LiveAlertRow key={alert.id} alert={alert} isNew={recentIds.has(alert.id)} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
