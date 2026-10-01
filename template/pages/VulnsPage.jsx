// =============================================================================
// src/pages/VulnsPage.jsx
// Lỗ hổng — CVE, CVSS, hạn xử lý, trạng thái vá
// API: GET /api/v1/vulnerabilities, PATCH /api/v1/vulnerabilities/:cve
// =============================================================================

import {
  AlertOctagon,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';

// ─── Sample data ──────────────────────────────────────────────────────────────
const SAMPLE_VULNS = [
  { cve: 'CVE-2026-1183', description: 'VPN Gateway RCE - log4j-style injection', cvss: 9.8, affected_assets: ['GW-DMZ-01', 'VPN-01'], exploited: true,  due_date: '2026-10-05', status: 'open',     severity: 'critical' },
  { cve: 'CVE-2025-44228', description: 'Log4Shell Remote Code Execution', cvss: 10.0, affected_assets: ['WEB-01', 'APP-02'], exploited: true, due_date: '2026-10-01', status: 'patching', severity: 'critical' },
  { cve: 'CVE-2025-34473', description: 'Exchange Server ProxyShell Auth Bypass', cvss: 8.2, affected_assets: ['MAIL-01'], exploited: false, due_date: '2026-10-15', status: 'open',     severity: 'high' },
  { cve: 'CVE-2025-29441', description: 'Windows Print Spooler Privilege Escalation', cvss: 7.8, affected_assets: ['DC-01', 'FS-HN-02', 'PC-KT-17'], exploited: false, due_date: '2026-10-20', status: 'patching', severity: 'high' },
  { cve: 'CVE-2025-27065', description: 'Cisco IOS XE Command Injection', cvss: 7.2, affected_assets: ['SW-CORE-01'], exploited: false, due_date: '2026-11-01', status: 'open',     severity: 'high' },
  { cve: 'CVE-2024-49138', description: 'Apache HTTP Server Path Traversal', cvss: 6.5, affected_assets: ['WEB-01', 'web-portal-02'], exploited: false, due_date: '2026-11-10', status: 'open',     severity: 'medium' },
  { cve: 'CVE-2024-38213', description: 'OpenSSL Buffer Overflow DoS', cvss: 5.9, affected_assets: ['GW-DMZ-01'], exploited: false, due_date: '2026-11-15', status: 'fixed',    severity: 'medium' },
  { cve: 'CVE-2024-21762', description: 'FortiOS SSL-VPN Auth Bypass', cvss: 9.6, affected_assets: ['VPN-01'], exploited: true, due_date: '2026-09-28', status: 'open',     severity: 'critical' },
  { cve: 'CVE-2024-1212', description: 'VMware ESXi Out-of-Bounds Write', cvss: 5.3, affected_assets: ['ESX-01', 'ESX-02'], exploited: false, due_date: '2026-12-01', status: 'accepted', severity: 'medium' },
  { cve: 'CVE-2023-36884', description: 'Office RCE via RTF Documents', cvss: 8.8, affected_assets: ['PC-KT-17', 'PC-KD-03'], exploited: true, due_date: '2026-10-01', status: 'fixed',    severity: 'high' },
];

const STATUS_CONFIG = {
  open:     { text: 'Chưa vá',   color: '#f87171', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)' },
  patching: { text: 'Đang vá',   color: '#fb923c', bg: 'rgba(249,115,22,0.1)',  border: 'rgba(249,115,22,0.3)' },
  fixed:    { text: 'Đã vá',     color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.3)' },
  accepted: { text: 'Chấp nhận', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.3)' },
};

const SEVERITY_CONFIG = {
  critical: { color: '#f87171', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.35)' },
  high:     { color: '#fb923c', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.35)' },
  medium:   { color: '#facc15', bg: 'rgba(234,179,8,0.12)',  border: 'rgba(234,179,8,0.35)' },
  low:      { color: '#60a5fa', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.35)' },
};

function CvssBadge({ cvss }) {
  const color = cvss >= 9 ? '#f87171' : cvss >= 7 ? '#fb923c' : cvss >= 4 ? '#facc15' : '#60a5fa';
  return (
    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', fontWeight: 700, color, padding: '2px 8px', borderRadius: '6px', background: `${color}18` }}>
      {cvss.toFixed(1)}
    </span>
  );
}

function SevBadge({ severity }) {
  const cfg = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.low;
  return (
    <span style={{ padding: '2px 10px', borderRadius: '10px', fontSize: '11.5px', fontWeight: 600, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
      {severity}
    </span>
  );
}

function StatusChip({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.open;
  return (
    <span style={{ padding: '2px 10px', borderRadius: '10px', fontSize: '11.5px', fontWeight: 600, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
      {cfg.text}
    </span>
  );
}

function DueDateChip({ due }) {
  if (!due) return <span style={{ color: '#475569' }}>—</span>;
  const diff = Math.ceil((new Date(due) - Date.now()) / 86400000);
  const overdue = diff < 0;
  const urgent = diff >= 0 && diff <= 3;
  const color = overdue ? '#f87171' : urgent ? '#fb923c' : '#94a3b8';
  return (
    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color, fontWeight: overdue || urgent ? 700 : 400 }}>
      {overdue ? `Quá hạn ${-diff} ngày` : urgent ? `${diff} ngày` : due}
    </span>
  );
}

const PAGE_SIZE = 15;

export default function VulnsPage() {
  const { addToast } = useApp();
  const [vulns, setVulns] = useState(SAMPLE_VULNS);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState(null);

  const loadVulns = useCallback(async () => {
    setLoading(true);
    try {
      const { default: api } = await import('../services/api');
      const res = await api.get('/vulnerabilities');
      if (res?.data || Array.isArray(res)) setVulns(res.data || res);
    } catch {
      // fallback to sample data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadVulns(); }, [loadVulns]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vulns.filter(v => {
      if (statusFilter !== 'all' && v.status !== statusFilter) return false;
      if (severityFilter !== 'all' && v.severity !== severityFilter) return false;
      if (q && !(v.cve + v.description + (v.affected_assets || []).join(' ')).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [vulns, query, statusFilter, severityFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const kpiCrit = vulns.filter(v => v.severity === 'critical' && v.status !== 'fixed').length;
  const kpiExpl = vulns.filter(v => v.exploited && v.status !== 'fixed').length;
  const kpiOpen = vulns.filter(v => v.status === 'open' || v.status === 'patching').length;
  const kpiFixed = vulns.filter(v => v.status === 'fixed').length;

  const updateStatus = async (cve, newStatus) => {
    if (!confirm(`Chuyển ${cve} sang "${STATUS_CONFIG[newStatus]?.text}"?`)) return;
    try {
      const { default: api } = await import('../services/api');
      await api.patch(`/vulnerabilities/${cve}`, { status: newStatus });
    } catch { /* ok */ }
    setVulns(prev => prev.map(v => v.cve === cve ? { ...v, status: newStatus } : v));
    if (selected?.cve === cve) setSelected(v => ({ ...v, status: newStatus }));
    addToast({ severity: 'info', title: 'Đã cập nhật', message: `${cve} → ${STATUS_CONFIG[newStatus]?.text}` });
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 lg:px-6 py-5 flex flex-col gap-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2.5" style={{ color: '#f8fafc' }}>
            <span style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '10px', padding: '6px 8px', display: 'inline-flex', alignItems: 'center' }}>
              <Zap size={18} style={{ color: '#fbbf24' }} />
            </span>
            Quản lý Lỗ hổng
          </h1>
          <p className="text-xs mt-1" style={{ color: '#64748b' }}>CVE, CVSS, theo dõi trạng thái vá và hạn xử lý</p>
        </div>
        <button onClick={loadVulns} disabled={loading} className="btn-ghost flex items-center gap-2 text-xs">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} style={{ color: '#06b6d4' }} /> Làm mới
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Nghiêm trọng chưa vá', value: kpiCrit, color: '#f87171', border: '#ef4444' },
          { label: 'Đang bị khai thác',    value: kpiExpl, color: '#fb923c', border: '#f97316' },
          { label: 'Đang mở / Vá',          value: kpiOpen, color: '#facc15', border: '#eab308' },
          { label: 'Đã vá',                value: kpiFixed, color: '#4ade80', border: '#22c55e' },
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
            <input className="soc-input" value={query} onChange={e => { setQuery(e.target.value); setCurrentPage(1); }} placeholder="Tìm CVE, mô tả, tài sản…" style={{ paddingLeft: '32px', fontSize: '12px' }} />
          </div>
          <select className="soc-input" value={severityFilter} onChange={e => { setSeverityFilter(e.target.value); setCurrentPage(1); }} style={{ width: 'auto', fontSize: '12px' }}>
            <option value="all">Mọi mức độ</option>
            <option value="critical">Nghiêm trọng</option>
            <option value="high">Cao</option>
            <option value="medium">Trung bình</option>
            <option value="low">Thấp</option>
          </select>
          <select className="soc-input" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }} style={{ width: 'auto', fontSize: '12px' }}>
            <option value="all">Mọi trạng thái</option>
            <option value="open">Chưa vá</option>
            <option value="patching">Đang vá</option>
            <option value="fixed">Đã vá</option>
            <option value="accepted">Chấp nhận</option>
          </select>
          <span style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace', marginLeft: 'auto' }}>{filtered.length} lỗ hổng</span>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto', maxHeight: '560px', overflowY: 'auto' }}>
          <table className="soc-table">
            <thead>
              <tr>
                <th>CVE</th>
                <th>Mô tả</th>
                <th>CVSS</th>
                <th>Mức độ</th>
                <th>Tài sản</th>
                <th>Khai thác</th>
                <th>Hạn xử lý</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr><td colSpan={9}>
                  <div className="empty-state">
                    <div className="empty-state-icon"><AlertOctagon size={22} /></div>
                    <p className="empty-state-title">Không có lỗ hổng</p>
                    <p className="empty-state-desc">Không có lỗ hổng khớp bộ lọc hiện tại</p>
                  </div>
                </td></tr>
              ) : paged.map(v => (
                <tr
                  key={v.cve}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelected(v)}
                  onMouseEnter={e => e.currentTarget.querySelectorAll('td').forEach(td => td.style.background = 'rgba(15,23,42,0.8)')}
                  onMouseLeave={e => e.currentTarget.querySelectorAll('td').forEach(td => td.style.background = '')}
                >
                  <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11.5px', color: '#06b6d4', fontWeight: 600 }}>{v.cve}</td>
                  <td style={{ maxWidth: '260px' }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12.5px', color: '#e2e8f0' }}>{v.description}</span>
                  </td>
                  <td><CvssBadge cvss={v.cvss} /></td>
                  <td><SevBadge severity={v.severity} /></td>
                  <td style={{ fontSize: '11.5px', color: '#64748b' }}>
                    {(v.affected_assets || []).slice(0, 2).join(', ')}
                    {(v.affected_assets || []).length > 2 && <span style={{ color: '#475569' }}> +{v.affected_assets.length - 2}</span>}
                  </td>
                  <td>
                    {v.exploited
                      ? <span style={{ fontSize: '11px', fontWeight: 700, color: '#f87171', padding: '2px 8px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>Có</span>
                      : <span style={{ color: '#475569', fontSize: '12px' }}>—</span>
                    }
                  </td>
                  <td onClick={e => e.stopPropagation()}><DueDateChip due={v.due_date} /></td>
                  <td onClick={e => e.stopPropagation()}><StatusChip status={v.status} /></td>
                  <td onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {v.status !== 'fixed' && (
                        <button onClick={() => updateStatus(v.cve, 'patching')} className="btn-action-orange" style={{ fontSize: '11px', padding: '3px 8px' }}>Đang vá</button>
                      )}
                      {v.status !== 'fixed' && v.status !== 'accepted' && (
                        <button onClick={() => updateStatus(v.cve, 'fixed')} className="btn-ghost" style={{ fontSize: '11px', padding: '3px 8px' }}>Đã vá</button>
                      )}
                    </div>
                  </td>
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

      {/* Detail Modal */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={() => setSelected(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'linear-gradient(145deg,#111827,#0f172a)', border: '1px solid #1e293b', borderRadius: '16px', width: '100%', maxWidth: '560px', boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #1e293b' }}>
              <div>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: '#fbbf24' }}>{selected.cve}</span>
                <p style={{ fontWeight: 600, fontSize: '14px', color: '#f8fafc', marginTop: '3px' }}>{selected.description}</p>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer' }}><Zap size={16} /></button>
            </div>
            <div style={{ padding: '16px 18px', display: 'grid', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {[
                  ['CVSS Score', <CvssBadge cvss={selected.cvss} />],
                  ['Mức độ', <SevBadge severity={selected.severity} />],
                  ['Trạng thái', <StatusChip status={selected.status} />],
                  ['Khai thác trong thực tế', selected.exploited ? '⚠ Có' : 'Chưa'],
                  ['Hạn xử lý', <DueDateChip due={selected.due_date} />],
                  ['Tài sản bị ảnh hưởng', (selected.affected_assets || []).length],
                ].map(([label, val]) => (
                  <div key={label} style={{ background: 'rgba(30,41,59,0.4)', borderRadius: '8px', padding: '10px 12px' }}>
                    <p style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</p>
                    <div style={{ marginTop: '4px', fontSize: '12.5px', color: '#e2e8f0' }}>{val}</div>
                  </div>
                ))}
              </div>
              <div>
                <p style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Tài sản bị ảnh hưởng</p>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {(selected.affected_assets || []).map(a => (
                    <span key={a} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(30,41,59,0.6)', color: '#94a3b8', border: '1px solid #1e293b' }}>{a}</span>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderTop: '1px solid #1e293b', gap: '8px', flexWrap: 'wrap' }}>
              <button onClick={() => setSelected(null)} className="btn-ghost" style={{ fontSize: '12px' }}>Đóng</button>
              <div style={{ display: 'flex', gap: '8px' }}>
                {selected.status !== 'patching' && selected.status !== 'fixed' && (
                  <button onClick={() => updateStatus(selected.cve, 'patching')} className="btn-action-orange" style={{ fontSize: '12px' }}>Đang vá</button>
                )}
                {selected.status !== 'fixed' && (
                  <button onClick={() => updateStatus(selected.cve, 'fixed')} className="btn-primary" style={{ fontSize: '12px' }}>Đánh dấu đã vá</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
