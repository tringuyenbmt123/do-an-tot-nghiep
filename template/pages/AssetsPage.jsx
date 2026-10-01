// =============================================================================
// src/pages/AssetsPage.jsx
// Tài sản & Endpoint — kiểm kê tài sản, điểm rủi ro, trạng thái agent
// API: GET /api/v1/assets
// =============================================================================

import { ChevronLeft, ChevronRight, RefreshCw, Search, Server } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';

// ─── Sample data ──────────────────────────────────────────────────────────────
const SAMPLE_ASSETS = [
  { id: 'A001', hostname: 'FS-HN-02',      ip: '10.10.1.2',   type: 'server',      os: 'Windows Server 2022', owner: 'IT-OPS',      criticality: 'high',  has_agent: true,  vuln_count: 3, last_seen: new Date(Date.now() - 120000).toISOString(), risk_score: 87 },
  { id: 'A002', hostname: 'DC-01',          ip: '10.10.0.1',   type: 'server',      os: 'Windows Server 2019', owner: 'IT-OPS',      criticality: 'high',  has_agent: true,  vuln_count: 1, last_seen: new Date(Date.now() - 60000).toISOString(),  risk_score: 72 },
  { id: 'A003', hostname: 'GW-DMZ-01',      ip: '172.16.0.1',  type: 'network',     os: 'Cisco IOS 17.x',      owner: 'NETOPS',      criticality: 'high',  has_agent: false, vuln_count: 2, last_seen: new Date(Date.now() - 300000).toISOString(), risk_score: 91 },
  { id: 'A004', hostname: 'WEB-01',         ip: '10.10.2.10',  type: 'server',      os: 'Ubuntu 22.04 LTS',    owner: 'DEV',         criticality: 'high',  has_agent: true,  vuln_count: 4, last_seen: new Date(Date.now() - 90000).toISOString(),  risk_score: 78 },
  { id: 'A005', hostname: 'PC-KT-17',       ip: '10.10.3.40',  type: 'workstation', os: 'Windows 11 Pro',      owner: 'Finance',     criticality: 'med',   has_agent: true,  vuln_count: 0, last_seen: new Date(Date.now() - 3600000).toISOString(), risk_score: 34 },
  { id: 'A006', hostname: 'VPN-01',         ip: '10.10.0.5',   type: 'network',     os: 'FortiOS 7.4',         owner: 'NETOPS',      criticality: 'high',  has_agent: false, vuln_count: 1, last_seen: new Date(Date.now() - 180000).toISOString(), risk_score: 65 },
  { id: 'A007', hostname: 'MAIL-01',        ip: '10.10.2.20',  type: 'server',      os: 'Exchange Server 2019',owner: 'IT-OPS',      criticality: 'high',  has_agent: true,  vuln_count: 2, last_seen: new Date(Date.now() - 240000).toISOString(), risk_score: 82 },
  { id: 'A008', hostname: 'PC-KD-03',       ip: '10.10.4.12',  type: 'workstation', os: 'Windows 10 Pro',      owner: 'Sales',       criticality: 'low',   has_agent: true,  vuln_count: 0, last_seen: new Date(Date.now() - 7200000).toISOString(), risk_score: 21 },
  { id: 'A009', hostname: 'ESX-01',         ip: '10.10.5.1',   type: 'server',      os: 'VMware ESXi 8.0',     owner: 'IT-OPS',      criticality: 'high',  has_agent: false, vuln_count: 1, last_seen: new Date(Date.now() - 600000).toISOString(), risk_score: 55 },
  { id: 'A010', hostname: 'web-portal-02',  ip: '10.10.2.30',  type: 'cloud',       os: 'Amazon Linux 2023',   owner: 'DEV',         criticality: 'med',   has_agent: true,  vuln_count: 1, last_seen: new Date(Date.now() - 30000).toISOString(),  risk_score: 41 },
  { id: 'A011', hostname: 'APP-02',         ip: '10.10.2.40',  type: 'server',      os: 'RHEL 9',              owner: 'DEV',         criticality: 'med',   has_agent: true,  vuln_count: 2, last_seen: new Date(Date.now() - 150000).toISOString(), risk_score: 58 },
  { id: 'A012', hostname: 'SW-CORE-01',     ip: '10.10.0.10',  type: 'network',     os: 'Cisco Nexus OS',      owner: 'NETOPS',      criticality: 'high',  has_agent: false, vuln_count: 1, last_seen: new Date(Date.now() - 480000).toISOString(), risk_score: 70 },
];

const TYPE_ICONS = {
  server:      '🖥',
  workstation: '💻',
  network:     '🔌',
  cloud:       '☁',
};

const CRIT_CONFIG = {
  high: { color: '#f87171', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', text: 'Cao' },
  med:  { color: '#fb923c', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.3)', text: 'Trung bình' },
  low:  { color: '#60a5fa', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)', text: 'Thấp' },
};

function RiskBar({ score }) {
  const color = score >= 80 ? '#ef4444' : score >= 60 ? '#f97316' : score >= 40 ? '#eab308' : '#22c55e';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div className="risk-bar-track">
        <div className="risk-bar-fill" style={{ width: `${score}%`, background: color }} />
      </div>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color, fontWeight: 600, minWidth: '24px' }}>{score}</span>
    </div>
  );
}

function AgentBadge({ has_agent }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
      color: has_agent ? '#4ade80' : '#64748b',
      background: has_agent ? 'rgba(74,222,128,0.1)' : 'rgba(100,116,139,0.1)',
      border: `1px solid ${has_agent ? 'rgba(74,222,128,0.3)' : 'rgba(100,116,139,0.3)'}`,
    }}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: has_agent ? '#4ade80' : '#475569', animation: has_agent ? 'pulse-dot 1.8s ease-in-out infinite' : 'none' }} />
      {has_agent ? 'Agent' : 'Không có'}
    </span>
  );
}

function LastSeenChip({ ts }) {
  if (!ts) return <span style={{ color: '#475569' }}>—</span>;
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const offline = mins > 15;
  const text = days > 0 ? `${days} ngày trước` : hrs > 0 ? `${hrs} giờ trước` : `${mins} phút trước`;
  return <span style={{ fontSize: '11px', color: offline ? '#64748b' : '#4ade80', fontFamily: 'monospace' }}>{text}</span>;
}

const PAGE_SIZE = 15;

export default function AssetsPage() {
  const { addToast } = useApp();
  const [assets, setAssets] = useState(SAMPLE_ASSETS);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [critFilter, setCritFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState(null);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const { default: api } = await import('../services/api');
      const res = await api.get('/assets');
      if (Array.isArray(res) || res?.data) setAssets(res.data || res);
    } catch { /* use sample */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter(a => {
      if (typeFilter !== 'all' && a.type !== typeFilter) return false;
      if (critFilter !== 'all' && a.criticality !== critFilter) return false;
      if (q && !(a.hostname + a.ip + a.os + a.owner).toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => b.risk_score - a.risk_score);
  }, [assets, query, typeFilter, critFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const kpiTotal = assets.length;
  const kpiAgent = assets.filter(a => a.has_agent).length;
  const kpiHigh  = assets.filter(a => a.criticality === 'high').length;
  const kpiVuln  = assets.filter(a => a.vuln_count > 0).length;

  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 lg:px-6 py-5 flex flex-col gap-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2.5" style={{ color: '#f8fafc' }}>
            <span style={{ background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: '10px', padding: '6px 8px', display: 'inline-flex', alignItems: 'center' }}>
              <Server size={18} style={{ color: '#34d399' }} />
            </span>
            Tài sản &amp; Endpoint
          </h1>
          <p className="text-xs mt-1" style={{ color: '#64748b' }}>Kiểm kê tài sản, điểm rủi ro và trạng thái agent</p>
        </div>
        <button onClick={loadAssets} disabled={loading} className="btn-ghost flex items-center gap-2 text-xs">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} style={{ color: '#06b6d4' }} /> Làm mới
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Tổng tài sản',   value: kpiTotal, color: '#06b6d4', border: '#06b6d4' },
          { label: 'Có agent',        value: kpiAgent, color: '#4ade80', border: '#22c55e' },
          { label: 'Tài sản trọng yếu', value: kpiHigh, color: '#fb923c', border: '#f97316' },
          { label: 'Có lỗ hổng',     value: kpiVuln,  color: '#f87171', border: '#ef4444' },
        ].map(kpi => (
          <div key={kpi.label} className="soc-card" style={{ borderLeft: `3px solid ${kpi.border}`, padding: '16px 18px' }}>
            <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>{kpi.label}</p>
            {loading ? <div className="skeleton h-8 w-16 rounded" /> : <p className="stat-number" style={{ color: kpi.color }}>{kpi.value}</p>}
          </div>
        ))}
      </div>

      {/* Filters + Table */}
      <div className="soc-card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #1e293b', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
            <input className="soc-input" value={query} onChange={e => { setQuery(e.target.value); setCurrentPage(1); }} placeholder="Tìm hostname, IP, OS, owner…" style={{ paddingLeft: '32px', fontSize: '12px' }} />
          </div>
          <select className="soc-input" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setCurrentPage(1); }} style={{ width: 'auto', fontSize: '12px' }}>
            <option value="all">Mọi loại</option>
            <option value="server">Server</option>
            <option value="workstation">Workstation</option>
            <option value="network">Network</option>
            <option value="cloud">Cloud</option>
          </select>
          <select className="soc-input" value={critFilter} onChange={e => { setCritFilter(e.target.value); setCurrentPage(1); }} style={{ width: 'auto', fontSize: '12px' }}>
            <option value="all">Mọi mức trọng yếu</option>
            <option value="high">Trọng yếu cao</option>
            <option value="med">Trung bình</option>
            <option value="low">Thấp</option>
          </select>
          <span style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace', marginLeft: 'auto' }}>{filtered.length} tài sản</span>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto', maxHeight: '560px', overflowY: 'auto' }}>
          <table className="soc-table">
            <thead>
              <tr>
                <th>Loại</th>
                <th>Hostname</th>
                <th>IP</th>
                <th>OS</th>
                <th>Owner</th>
                <th>Trọng yếu</th>
                <th>Agent</th>
                <th>Lỗ hổng</th>
                <th>Điểm rủi ro</th>
                <th>Kết nối cuối</th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr><td colSpan={10}>
                  <div className="empty-state">
                    <div className="empty-state-icon"><Server size={22} /></div>
                    <p className="empty-state-title">Không có tài sản</p>
                    <p className="empty-state-desc">Không có tài sản khớp bộ lọc</p>
                  </div>
                </td></tr>
              ) : paged.map(a => (
                <tr
                  key={a.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelected(a)}
                  onMouseEnter={e => e.currentTarget.querySelectorAll('td').forEach(td => td.style.background = 'rgba(15,23,42,0.8)')}
                  onMouseLeave={e => e.currentTarget.querySelectorAll('td').forEach(td => td.style.background = '')}
                >
                  <td style={{ fontSize: '18px' }} title={a.type}>{TYPE_ICONS[a.type] || '🖥'}</td>
                  <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', fontWeight: 600, color: '#06b6d4' }}>{a.hostname}</td>
                  <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11.5px', color: '#64748b' }}>{a.ip}</td>
                  <td style={{ fontSize: '11.5px', color: '#94a3b8', maxWidth: '140px' }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.os}</span>
                  </td>
                  <td style={{ fontSize: '11.5px', color: '#94a3b8' }}>{a.owner}</td>
                  <td>
                    {(() => {
                      const cfg = CRIT_CONFIG[a.criticality] || CRIT_CONFIG.low;
                      return <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>{cfg.text}</span>;
                    })()}
                  </td>
                  <td><AgentBadge has_agent={a.has_agent} /></td>
                  <td>
                    {a.vuln_count > 0
                      ? <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 700, color: '#f87171', padding: '2px 8px', borderRadius: '6px', background: 'rgba(239,68,68,0.1)' }}>{a.vuln_count} CVE</span>
                      : <span style={{ color: '#475569', fontSize: '12px' }}>—</span>
                    }
                  </td>
                  <td><RiskBar score={a.risk_score || 0} /></td>
                  <td><LastSeenChip ts={a.last_seen} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid #1e293b', gap: '10px' }}>
            <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#64748b' }}>
              {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} / {filtered.length}
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safePage === 1} className="btn-ghost" style={{ padding: '5px 10px', fontSize: '12px' }}><ChevronLeft size={13} /></button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(n => (
                <button key={n} onClick={() => setCurrentPage(n)} style={{ width: '28px', height: '28px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', border: safePage === n ? '1px solid rgba(6,182,212,0.4)' : '1px solid #1e293b', background: safePage === n ? 'rgba(6,182,212,0.15)' : 'transparent', color: safePage === n ? '#22d3ee' : '#64748b' }}>{n}</button>
              ))}
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className="btn-ghost" style={{ padding: '5px 10px', fontSize: '12px' }}><ChevronRight size={13} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
