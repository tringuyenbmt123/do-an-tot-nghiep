// =============================================================================
// src/pages/SiemPage.jsx
// Nhật ký (SIEM) — Tìm kiếm log theo trường:giá_trị, biểu đồ thời gian, xuất CSV
// API: GET /api/v1/events?q=&from=&to=&limit=
// =============================================================================

import {
  BarChart2,
  Download,
  FileSearch,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useApp } from '../context/AppContext';
import { formatTime } from '../utils/date';

// ─── Mock/API loader ──────────────────────────────────────────────────────────
async function loadEvents(params) {
  try {
    const { default: api } = await import('../services/api');
    return await api.get('/events', { params });
  } catch {
    return null;
  }
}

// ─── Sample data generator (fallback) ────────────────────────────────────────
const HOSTS = ['FS-HN-02', 'DC-01', 'GW-DMZ-01', 'PC-KT-17', 'WEB-01', 'VPN-01'];
const USERS = ['admin', 't.nguyen', 'svc-backup', 'l.pham'];
const TEMPLATES = [
  { src: 'auth',     lv: 'error', msg: (u, ip) => `Đăng nhập thất bại user=${u} ip=${ip}` },
  { src: 'auth',     lv: 'info',  msg: (u, ip) => `Đăng nhập thành công user=${u} ip=${ip}` },
  { src: 'sysmon',   lv: 'warn',  msg: (_, __, h) => `powershell.exe -enc JABz... host=${h}` },
  { src: 'sysmon',   lv: 'info',  msg: (_, __, h) => `Tiến trình mới svchost.exe host=${h}` },
  { src: 'firewall', lv: 'warn',  msg: (_, ip) => `DENY tcp ${ip}:443 -> 10.10.0.5:22` },
  { src: 'ids',      lv: 'error', msg: (_, ip) => `ET SCAN Nmap từ ${ip}` },
  { src: 'proxy',    lv: 'warn',  msg: (_, ip) => `BLOCK http://${ip}/dropper.exe` },
  { src: 'dns',      lv: 'info',  msg: (_, __, h) => `QUERY xk9-update.net từ ${h}` },
  { src: 'sysmon',   lv: 'error', msg: (_, __, h) => `vssadmin.exe delete shadows host=${h}` },
];
const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];
const randIp = () => `${20 + rnd(200)}.${rnd(250)}.${rnd(250)}.${1 + rnd(250)}`;

function generateSampleEvents(count = 400) {
  const events = [];
  for (let i = 0; i < count; i++) {
    const t = TEMPLATES[rnd(TEMPLATES.length)];
    const ip = randIp();
    const u = pick(USERS);
    const h = pick(HOSTS);
    events.push({
      id: `EVT-${100000 + i}`,
      t: Date.now() - Math.pow(Math.random(), 2.2) * 604800000,
      host: h,
      src: t.src,
      lv: t.lv,
      user: u,
      ip,
      msg: t.msg(u, ip, h),
    });
  }
  return events.sort((a, b) => b.t - a.t);
}

const SAMPLE_EVENTS = generateSampleEvents(400);

const SAVED_QUERIES = [
  { label: 'Đăng nhập thất bại', q: 'src:auth lv:error' },
  { label: 'PowerShell mã hóa', q: 'powershell' },
  { label: 'Xóa shadow copy', q: 'vssadmin' },
  { label: 'Cảnh báo IDS', q: 'src:ids' },
  { label: 'Firewall DENY', q: 'src:firewall lv:warn' },
];

const TIME_RANGES = [
  { label: '1 giờ qua', ms: 3600000 },
  { label: '6 giờ qua', ms: 21600000 },
  { label: '24 giờ qua', ms: 86400000 },
  { label: '7 ngày qua', ms: 604800000 },
];

const LEVEL_COLORS = { error: '#ef4444', warn: '#f97316', info: '#22d3ee' };
const LEVEL_LABELS = { error: { text: 'error', color: '#f87171', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)' }, warn: { text: 'warn', color: '#fb923c', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.3)' }, info: { text: 'info', color: '#22d3ee', bg: 'rgba(6,182,212,0.1)', border: 'rgba(6,182,212,0.3)' } };

function LevelBadge({ level }) {
  const cfg = LEVEL_LABELS[level] || { text: level, color: '#94a3b8', bg: 'transparent', border: 'rgba(148,163,184,0.3)' };
  return (
    <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, fontFamily: 'monospace', color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
      {cfg.text}
    </span>
  );
}

function matchEvent(e, q) {
  if (!q) return true;
  return q.split(/\s+/).every(tok => {
    const m = tok.match(/^(\w+):(.+)$/);
    if (m) {
      const field = m[1].toLowerCase();
      const val = m[2].toLowerCase();
      const fv = String(e[field] ?? '').toLowerCase();
      return fv.includes(val);
    }
    return e.msg.toLowerCase().includes(tok.toLowerCase());
  });
}

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '8px 12px' }}>
      <p style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '4px' }}>{label}</p>
      <p style={{ color: '#f8fafc', fontSize: '12px', fontWeight: 600 }}>{payload[0]?.value} sự kiện</p>
    </div>
  );
};

// =============================================================================
export default function SiemPage() {
  const { addToast } = useApp();
  const [query, setQuery] = useState('');
  const [timeRange, setTimeRange] = useState(86400000);
  const [events, setEvents] = useState(SAMPLE_EVENTS);
  const [loading, setLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const qRef = useRef(null);

  const results = useMemo(() => {
    const now = Date.now();
    return events.filter(e => now - e.t <= timeRange && matchEvent(e, query.trim()));
  }, [events, query, timeRange]);

  // Build histogram (24 bars for selected range)
  const histogram = useMemo(() => {
    const n = 24;
    const step = timeRange / n;
    const bins = Array(n).fill(0);
    const now = Date.now();
    results.forEach(e => {
      const i = Math.floor((now - e.t) / step);
      if (i >= 0 && i < n) bins[n - 1 - i]++;
    });
    return bins.map((count, i) => ({
      label: `T-${n - 1 - i}`,
      count,
    }));
  }, [results, timeRange]);

  const tryLoadFromApi = useCallback(async () => {
    setLoading(true);
    try {
      const res = await loadEvents({ q: query, limit: 500, from: new Date(Date.now() - timeRange).toISOString() });
      if (res?.data) setEvents(res.data);
    } catch {
      // silently use sample data
    } finally {
      setLoading(false);
    }
  }, [query, timeRange]);

  useEffect(() => { tryLoadFromApi(); }, []);

  const exportCSV = () => {
    if (!results.length) { addToast({ severity: 'info', title: 'Không có dữ liệu', message: 'Không có sự kiện để xuất' }); return; }
    const q = v => `"${String(v).replace(/"/g, '""')}"`;
    const header = ['time', 'host', 'source', 'level', 'user', 'ip', 'message'];
    const rows = results.map(e => [new Date(e.t).toISOString(), e.host, e.src, e.lv, e.user, e.ip, e.msg].map(q).join(','));
    const csv = [header.join(','), ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `siem-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    addToast({ severity: 'info', title: 'Đã xuất CSV', message: `${results.length} sự kiện` });
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 lg:px-6 py-5 flex flex-col gap-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2.5" style={{ color: '#f8fafc' }}>
            <span style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '10px', padding: '6px 8px', display: 'inline-flex', alignItems: 'center' }}>
              <FileSearch size={18} style={{ color: '#60a5fa' }} />
            </span>
            Nhật ký (SIEM)
          </h1>
          <p className="text-xs mt-1" style={{ color: '#64748b' }}>Tìm kiếm và điều tra sự kiện từ mọi nguồn log</p>
        </div>
        <button onClick={exportCSV} className="btn-ghost flex items-center gap-2 text-xs">
          <Download size={12} style={{ color: '#06b6d4' }} /> Xuất CSV
        </button>
      </div>

      {/* Search Bar */}
      <div className="soc-card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '280px' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
            <input
              ref={qRef}
              className="soc-input"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder='VD: powershell   hoặc   src:auth lv:error ip:185.220'
              style={{ paddingLeft: '32px', fontSize: '12px', fontFamily: 'JetBrains Mono, monospace' }}
              onKeyDown={e => e.key === 'Enter' && tryLoadFromApi()}
            />
          </div>
          <select
            className="soc-input"
            value={timeRange}
            onChange={e => setTimeRange(+e.target.value)}
            style={{ width: 'auto', fontSize: '12px', borderRadius: '8px' }}
          >
            {TIME_RANGES.map(r => (
              <option key={r.ms} value={r.ms}>{r.label}</option>
            ))}
          </select>
          <button onClick={tryLoadFromApi} disabled={loading} className="btn-primary flex items-center gap-2" style={{ fontSize: '12px', padding: '9px 18px' }}>
            {loading ? <RefreshCw size={12} className="animate-spin" /> : <Search size={12} />}
            Tìm kiếm
          </button>
        </div>

        {/* Saved queries */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: '#475569', flexShrink: 0 }}>Truy vấn lưu:</span>
          {SAVED_QUERIES.map(sq => (
            <button
              key={sq.label}
              onClick={() => { setQuery(sq.q); qRef.current?.focus(); }}
              style={{
                background: 'transparent', border: '1px solid #1e293b', borderRadius: '12px',
                padding: '3px 10px', fontSize: '11.5px', cursor: 'pointer', color: '#64748b',
                fontFamily: "'Inter', sans-serif", transition: 'all 0.18s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#06b6d4'; e.currentTarget.style.color = '#22d3ee'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.color = '#64748b'; }}
            >
              {sq.label}
            </button>
          ))}
        </div>

        <p style={{ fontSize: '11px', color: '#475569', marginTop: '10px' }}>
          Cú pháp: gõ từ khóa hoặc <b style={{ color: '#64748b' }}>trường:giá_trị</b> (host, src, lv, user, ip). Nhiều điều kiện nối bằng AND.
        </p>
      </div>

      {/* Histogram */}
      <div className="soc-card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <BarChart2 size={14} style={{ color: '#06b6d4' }} />
            Số sự kiện theo thời gian
          </h3>
          <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#06b6d4', fontWeight: 600 }}>
            {results.length.toLocaleString('vi-VN')} kết quả
          </span>
        </div>
        <ResponsiveContainer width="100%" height={110}>
          <BarChart data={histogram} margin={{ left: -20, right: 0 }}>
            <CartesianGrid strokeDasharray="3 4" stroke="#1e293b" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#475569' }} axisLine={false} tickLine={false} interval={5} />
            <YAxis tick={{ fontSize: 9, fill: '#475569' }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="count" fill="#06b6d4" radius={[3, 3, 0, 0]} maxBarSize={16} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Events Table */}
      <div className="soc-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', maxHeight: '520px', overflowY: 'auto' }}>
          <table className="soc-table">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Host</th>
                <th>Nguồn</th>
                <th>Mức</th>
                <th>Thông điệp</th>
                <th>User</th>
                <th>IP</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {results.slice(0, 100).length === 0 ? (
                <tr><td colSpan={8}>
                  <div className="empty-state">
                    <div className="empty-state-icon"><FileSearch size={22} /></div>
                    <p className="empty-state-title">Không tìm thấy sự kiện</p>
                    <p className="empty-state-desc">Thử mở rộng khoảng thời gian hoặc bỏ bớt điều kiện tìm kiếm</p>
                  </div>
                </td></tr>
              ) : (
                results.slice(0, 100).map(e => (
                  <tr
                    key={e.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedEvent(e)}
                    onMouseEnter={ev => ev.currentTarget.querySelectorAll('td').forEach(td => td.style.background = 'rgba(15,23,42,0.8)')}
                    onMouseLeave={ev => ev.currentTarget.querySelectorAll('td').forEach(td => td.style.background = '')}
                  >
                    <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>
                      {formatTime(e.t)}
                    </td>
                    <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11.5px', color: '#94a3b8' }}>{e.host}</td>
                    <td><span style={{ fontFamily: 'monospace', fontSize: '11px', padding: '2px 7px', borderRadius: '4px', background: 'rgba(30,41,59,0.8)', color: '#94a3b8', border: '1px solid #1e293b' }}>{e.src}</span></td>
                    <td><LevelBadge level={e.lv} /></td>
                    <td style={{ maxWidth: '380px' }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'JetBrains Mono, monospace', fontSize: '11.5px', color: '#e2e8f0' }}>
                        {e.msg}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '11px', color: '#64748b' }}>{e.user}</td>
                    <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: '#64748b' }}>{e.ip}</td>
                    <td>
                      <button className="btn-ghost" style={{ padding: '3px 10px', fontSize: '11px' }}>Xem</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {results.length > 100 && (
          <div style={{ padding: '10px 20px', borderTop: '1px solid #1e293b', fontSize: '12px', color: '#64748b' }}>
            Hiển thị 100 / {results.length} sự kiện mới nhất
          </div>
        )}
      </div>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={() => setSelectedEvent(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'linear-gradient(145deg,#111827,#0f172a)', border: '1px solid #1e293b', borderRadius: '16px', width: '100%', maxWidth: '560px', boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #1e293b' }}>
              <span style={{ fontWeight: 600, fontSize: '13px', color: '#f8fafc' }}>Sự kiện thô</span>
              <button onClick={() => setSelectedEvent(null)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <div style={{ padding: '16px 18px' }}>
              <pre className="json-block">{JSON.stringify({ ...selectedEvent, t: new Date(selectedEvent.t).toISOString() }, null, 2)}</pre>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 18px', borderTop: '1px solid #1e293b' }}>
              <button onClick={() => setSelectedEvent(null)} className="btn-ghost" style={{ fontSize: '12px' }}>Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
