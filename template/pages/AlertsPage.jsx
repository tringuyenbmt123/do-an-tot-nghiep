// =============================================================================
// src/pages/AlertsPage.jsx
// Hàng đợi cảnh báo – lọc, chọn nhiều, nhận/đóng/false positive
// Gọi API: GET /api/v1/alerts, PATCH /api/v1/alerts/:id/status
// =============================================================================

import {
  AlertTriangle,
  Bell,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SeverityBadge from '../components/common/SeverityBadge';
import StatusBadge from '../components/common/StatusBadge';
import { useApp } from '../context/AppContext';
import { getAlerts, updateAlertStatus, escalateAlertToCase } from '../services/api';
import { formatTime } from '../utils/date';

// ─── Severity config ──────────────────────────────────────────────────────────
const SEVERITY_FILTERS = [
  { id: 'all', label: 'Tất cả', dot: null },
  { id: 'critical', label: 'Nghiêm trọng', dot: '#ef4444', activeBg: 'rgba(239,68,68,0.15)', activeBorder: 'rgba(239,68,68,0.4)', activeColor: '#f87171' },
  { id: 'high',     label: 'Cao',          dot: '#f97316', activeBg: 'rgba(249,115,22,0.15)', activeBorder: 'rgba(249,115,22,0.4)', activeColor: '#fb923c' },
  { id: 'medium',   label: 'Trung bình',   dot: '#eab308', activeBg: 'rgba(234,179,8,0.15)',  activeBorder: 'rgba(234,179,8,0.4)',  activeColor: '#facc15' },
  { id: 'low',      label: 'Thấp',         dot: '#3b82f6', activeBg: 'rgba(59,130,246,0.15)', activeBorder: 'rgba(59,130,246,0.4)', activeColor: '#60a5fa' },
];

const STATUS_LABELS = {
  new:    { text: 'Mới',             color: '#60a5fa', bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.3)' },
  ack:    { text: 'Đang xử lý',      color: '#fb923c', bg: 'rgba(249,115,22,0.1)',  border: 'rgba(249,115,22,0.3)' },
  fp:     { text: 'False positive',  color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.3)' },
  closed: { text: 'Đã đóng',         color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.3)' },
};

const PAGE_SIZE = 25;

// ─── Status chip component ────────────────────────────────────────────────────
function StatusChip({ status }) {
  const cfg = STATUS_LABELS[status] || { text: status, color: '#94a3b8', bg: 'transparent', border: 'rgba(148,163,184,0.3)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 10px',
      borderRadius: '12px', fontSize: '11.5px', fontWeight: 600,
      color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
    }}>
      {cfg.text}
    </span>
  );
}

// ─── Alert Row ────────────────────────────────────────────────────────────────
function AlertRow({ alert, selected, onSelect, onClick }) {
  return (
    <tr
      onClick={(e) => {
        if (e.target.type === 'checkbox') return;
        onClick(alert);
      }}
      style={{ cursor: 'pointer' }}
      onMouseEnter={(e) => e.currentTarget.querySelectorAll('td').forEach(td => td.style.background = 'rgba(15,23,42,0.8)')}
      onMouseLeave={(e) => e.currentTarget.querySelectorAll('td').forEach(td => td.style.background = '')}
    >
      <td onClick={e => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={e => onSelect(alert.id, e.target.checked)}
          aria-label={`Chọn ${alert.id || alert.title}`}
          style={{ cursor: 'pointer', accentColor: '#06b6d4', width: '14px', height: '14px' }}
        />
      </td>
      <td><SeverityBadge severity={alert.severity} /></td>
      <td><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11.5px', color: '#06b6d4' }}>{alert.id}</span></td>
      <td>
        <span className="block truncate max-w-xs font-semibold" style={{ fontSize: '12.5px', color: '#e2e8f0' }}>
          {alert.title || alert.event_type}
        </span>
      </td>
      <td><span style={{ fontSize: '12px', color: '#94a3b8' }}>{alert.source || alert.src || '—'}</span></td>
      <td>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11.5px', color: '#94a3b8' }}>
          {alert.agent?.hostname || alert.asset || alert.agent_id || '—'}
        </span>
      </td>
      <td>
        {alert.mitre_tactic || alert.mitre ? (
          <span style={{ fontFamily: 'monospace', fontSize: '11px', padding: '2px 7px', borderRadius: '4px', background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}>
            {alert.mitre_tactic || alert.mitre}
          </span>
        ) : <span style={{ color: '#475569' }}>—</span>}
      </td>
      <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>
        {formatTime(alert.created_at || alert.t)}
      </td>
      <td><StatusChip status={alert.status || alert.st || 'new'} /></td>
    </tr>
  );
}

// ─── Alert Detail Modal ────────────────────────────────────────────────────────
function AlertDetailModal({ alert, onClose, onStatusChange }) {
  const { addToast } = useApp();
  const [updating, setUpdating] = useState(false);

  const changeStatus = async (newStatus) => {
    if (!alert.id) return;
    setUpdating(true);
    try {
      await updateAlertStatus(alert.id, newStatus);
      onStatusChange(alert.id, newStatus);
      addToast({ severity: 'info', title: 'Đã cập nhật trạng thái', message: `Alert ${alert.id} → ${STATUS_LABELS[newStatus]?.text}` });
      onClose();
    } catch (err) {
      addToast({ severity: 'critical', title: 'Lỗi cập nhật', message: err.message });
    } finally {
      setUpdating(false);
    }
  };

  const escalate = async () => {
    if (!alert.id) return;
    if (!confirm(`Tạo case từ alert ${alert.id}?`)) return;
    setUpdating(true);
    try {
      await escalateAlertToCase(alert.id);
      addToast({ severity: 'info', title: 'Đã tạo case', message: `Case tạo từ ${alert.id}` });
      onClose();
    } catch (err) {
      addToast({ severity: 'critical', title: 'Lỗi tạo case', message: err.message });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(145deg, #111827 0%, #0f172a 100%)',
          border: '1px solid #1e293b', borderRadius: '16px', padding: '0',
          width: '100%', maxWidth: '640px', boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #1e293b' }}>
          <div>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: '#06b6d4' }}>{alert.id}</span>
            <p style={{ fontWeight: 600, fontSize: '14px', color: '#f8fafc', marginTop: '4px' }}>{alert.title || alert.event_type}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', display: 'grid', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {[
              ['Mức độ', <SeverityBadge severity={alert.severity} />],
              ['Trạng thái', <StatusChip status={alert.status || alert.st || 'new'} />],
              ['Nguồn', alert.source || alert.src || '—'],
              ['Tài sản', alert.agent?.hostname || alert.asset || '—'],
              ['MITRE Tactic', alert.mitre_tactic || alert.mitre || '—'],
              ['Thời gian', formatTime(alert.created_at || alert.t)],
            ].map(([label, val]) => (
              <div key={label} style={{ background: 'rgba(30,41,59,0.4)', borderRadius: '8px', padding: '10px 12px' }}>
                <p style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</p>
                <div style={{ marginTop: '4px', fontSize: '12.5px', color: '#e2e8f0' }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Raw JSON */}
          {alert.raw && (
            <div>
              <p style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Dữ liệu thô</p>
              <pre className="json-block">{JSON.stringify(alert.raw, null, 2)}</pre>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderTop: '1px solid #1e293b', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={escalate} disabled={updating} className="btn-ghost" style={{ fontSize: '12px' }}>
            Tạo Case
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => changeStatus('fp')} disabled={updating} className="btn-ghost" style={{ fontSize: '12px', color: '#94a3b8' }}>False Positive</button>
            <button onClick={() => changeStatus('closed')} disabled={updating} className="btn-ghost" style={{ fontSize: '12px' }}>Đóng</button>
            <button onClick={() => changeStatus('ack')} disabled={updating} className="btn-primary" style={{ fontSize: '12px' }}>Nhận xử lý</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================
export default function AlertsPage() {
  const { addToast } = useApp();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const searchRef = useRef(null);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAlerts({ limit: 300 });
      setAlerts(res.data || res || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAlerts(); }, [loadAlerts]);

  const filteredAlerts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return alerts.filter(a => {
      const sev = (a.severity || '').toLowerCase();
      const st = a.status || a.st || 'new';
      const src = a.source || a.src || '';
      if (severityFilter !== 'all' && sev !== severityFilter) return false;
      if (statusFilter !== 'all' && st !== statusFilter) return false;
      if (sourceFilter !== 'all' && src !== sourceFilter) return false;
      if (q) {
        const searchable = `${a.id} ${a.title} ${a.event_type} ${a.agent?.hostname} ${a.asset} ${a.mitre_tactic} ${a.mitre}`.toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });
  }, [alerts, severityFilter, statusFilter, sourceFilter, query]);

  const totalPages = Math.ceil(filteredAlerts.length / PAGE_SIZE) || 1;
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const pagedAlerts = filteredAlerts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const severityCounts = useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0, low: 0 };
    alerts.forEach(a => { const s = (a.severity || '').toLowerCase(); if (s in c) c[s]++; });
    return c;
  }, [alerts]);

  const kpiOpen   = alerts.filter(a => ['new','ack'].includes(a.status || a.st)).length;
  const kpiCrit   = alerts.filter(a => (a.severity || '').toLowerCase() === 'critical' && ['new','ack'].includes(a.status || a.st)).length;
  const kpiNew    = alerts.filter(a => (a.status || a.st) === 'new').length;
  const kpiAck    = alerts.filter(a => (a.status || a.st) === 'ack').length;

  const handleSelect = (id, checked) => {
    setSelected(prev => { const n = new Set(prev); checked ? n.add(id) : n.delete(id); return n; });
  };
  const handleSelectAll = (checked) => {
    setSelected(checked ? new Set(pagedAlerts.map(a => a.id)) : new Set());
  };

  const handleBulkAction = async (newStatus) => {
    if (!selected.size) return;
    const ids = [...selected];
    try {
      await Promise.all(ids.map(id => updateAlertStatus(id, newStatus)));
      setAlerts(prev => prev.map(a => ids.includes(a.id) ? { ...a, status: newStatus } : a));
      setSelected(new Set());
      addToast({ severity: 'info', title: 'Đã cập nhật', message: `${ids.length} cảnh báo → ${STATUS_LABELS[newStatus]?.text}` });
    } catch (err) {
      addToast({ severity: 'critical', title: 'Lỗi cập nhật', message: err.message });
    }
  };

  const handleStatusChange = (id, newStatus) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a));
  };

  const allPageSelected = pagedAlerts.length > 0 && pagedAlerts.every(a => selected.has(a.id));

  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 lg:px-6 py-5 flex flex-col gap-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2.5" style={{ color: '#f8fafc' }}>
            <span style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '6px 8px', display: 'inline-flex', alignItems: 'center' }}>
              <Bell size={18} style={{ color: '#f87171' }} />
            </span>
            Hàng đợi Cảnh báo
          </h1>
          <p className="text-xs mt-1" style={{ color: '#64748b' }}>Cảnh báo từ SIEM, EDR và IDS · Lọc, xử lý hàng loạt</p>
        </div>
        <button onClick={loadAlerts} className="btn-ghost flex items-center gap-2 text-xs" disabled={loading}>
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} style={{ color: '#06b6d4' }} />
          Làm mới
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Đang mở', value: kpiOpen, color: '#06b6d4', borderColor: '#06b6d4' },
          { label: 'Nghiêm trọng mở', value: kpiCrit, color: '#f87171', borderColor: '#ef4444' },
          { label: 'Chưa nhận xử lý', value: kpiNew, color: '#fb923c', borderColor: '#f97316' },
          { label: 'Đang xử lý', value: kpiAck, color: '#4ade80', borderColor: '#22c55e' },
        ].map(kpi => (
          <div key={kpi.label} className="soc-card" style={{ borderLeft: `3px solid ${kpi.borderColor}`, padding: '16px 18px' }}>
            <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>{kpi.label}</p>
            {loading
              ? <div className="skeleton h-8 w-16 rounded" />
              : <p className="stat-number" style={{ color: kpi.color }}>{kpi.value}</p>
            }
          </div>
        ))}
      </div>

      {/* Filter bar + Table */}
      <div className="soc-card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #1e293b', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
            <input
              ref={searchRef}
              className="soc-input"
              value={query}
              onChange={e => { setQuery(e.target.value); setCurrentPage(1); }}
              placeholder="Tìm mã, tiêu đề, tài sản, MITRE…"
              style={{ paddingLeft: '32px', fontSize: '12px', borderRadius: '8px' }}
            />
          </div>

          {/* Status filter */}
          <select
            className="soc-input"
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            style={{ width: 'auto', fontSize: '12px', borderRadius: '8px' }}
          >
            <option value="all">Mọi trạng thái</option>
            <option value="new">Mới</option>
            <option value="ack">Đang xử lý</option>
            <option value="fp">False positive</option>
            <option value="closed">Đã đóng</option>
          </select>

          {/* Source filter */}
          <select
            className="soc-input"
            value={sourceFilter}
            onChange={e => { setSourceFilter(e.target.value); setCurrentPage(1); }}
            style={{ width: 'auto', fontSize: '12px', borderRadius: '8px' }}
          >
            <option value="all">Mọi nguồn</option>
            <option value="SIEM">SIEM</option>
            <option value="EDR">EDR</option>
            <option value="IDS">IDS</option>
          </select>
        </div>

        {/* Severity chips */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid #1e293b', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {SEVERITY_FILTERS.map(f => {
            const isActive = severityFilter === f.id;
            const count = f.id === 'all' ? filteredAlerts.length : severityCounts[f.id] || 0;
            return (
              <button
                key={f.id}
                onClick={() => { setSeverityFilter(f.id); setCurrentPage(1); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '4px 12px', borderRadius: '12px', cursor: 'pointer',
                  fontSize: '12px', fontWeight: 600, fontFamily: "'Inter', sans-serif",
                  transition: 'all 0.18s ease',
                  border: isActive ? `1px solid ${f.activeBorder || 'rgba(6,182,212,0.4)'}` : '1px solid #1e293b',
                  background: isActive ? (f.activeBg || 'rgba(6,182,212,0.15)') : 'transparent',
                  color: isActive ? (f.activeColor || '#22d3ee') : '#64748b',
                }}
              >
                {f.dot && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: f.dot, flexShrink: 0 }} />}
                {f.label}
                <span style={{ fontFamily: 'monospace', fontSize: '10px', opacity: 0.8 }}>{count}</span>
              </button>
            );
          })}
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#64748b', fontFamily: 'monospace' }}>
            {filteredAlerts.length} kết quả
          </span>
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div style={{ padding: '10px 20px', borderBottom: '1px solid #1e293b', background: 'rgba(6,182,212,0.06)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#06b6d4' }}>Đã chọn {selected.size} cảnh báo</span>
            <button onClick={() => handleBulkAction('ack')} className="btn-ghost" style={{ fontSize: '12px', padding: '5px 12px' }}>Nhận xử lý</button>
            <button onClick={() => handleBulkAction('fp')} className="btn-ghost" style={{ fontSize: '12px', padding: '5px 12px' }}>False Positive</button>
            <button onClick={() => handleBulkAction('closed')} className="btn-ghost" style={{ fontSize: '12px', padding: '5px 12px' }}>Đóng</button>
            <button onClick={() => setSelected(new Set())} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
              <X size={12} /> Bỏ chọn
            </button>
          </div>
        )}

        {/* Table */}
        <div style={{ overflowX: 'auto', maxHeight: '560px', overflowY: 'auto' }}>
          <table className="soc-table">
            <thead>
              <tr>
                <th style={{ width: '36px' }}>
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={e => handleSelectAll(e.target.checked)}
                    aria-label="Chọn tất cả"
                    style={{ cursor: 'pointer', accentColor: '#06b6d4', width: '14px', height: '14px' }}
                  />
                </th>
                <th>Mức độ</th>
                <th>Mã</th>
                <th>Cảnh báo</th>
                <th>Nguồn</th>
                <th>Tài sản</th>
                <th>MITRE</th>
                <th>Thời gian</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j}><div className="skeleton h-4 rounded" style={{ width: j === 3 ? '180px' : '80px' }} /></td>
                    ))}
                  </tr>
                ))
              ) : error ? (
                <tr><td colSpan={9}>
                  <div className="empty-state">
                    <div className="empty-state-icon"><AlertTriangle size={22} /></div>
                    <p className="empty-state-title">Lỗi tải dữ liệu</p>
                    <p className="empty-state-desc">{error}</p>
                    <button onClick={loadAlerts} className="btn-ghost" style={{ marginTop: '12px', fontSize: '12px' }}>Thử lại</button>
                  </div>
                </td></tr>
              ) : pagedAlerts.length === 0 ? (
                <tr><td colSpan={9}>
                  <div className="empty-state">
                    <div className="empty-state-icon"><Bell size={22} /></div>
                    <p className="empty-state-title">Không có cảnh báo</p>
                    <p className="empty-state-desc">Không có cảnh báo khớp bộ lọc hiện tại</p>
                  </div>
                </td></tr>
              ) : (
                pagedAlerts.map(alert => (
                  <AlertRow
                    key={alert.id}
                    alert={alert}
                    selected={selected.has(alert.id)}
                    onSelect={handleSelect}
                    onClick={setSelectedAlert}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid #1e293b', gap: '10px' }}>
            <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#64748b' }}>
              {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredAlerts.length)} / {filteredAlerts.length}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safePage === 1} className="btn-ghost" style={{ padding: '5px 10px', fontSize: '12px' }}>
                <ChevronLeft size={13} />
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(n => (
                <button
                  key={n}
                  onClick={() => setCurrentPage(n)}
                  style={{
                    width: '28px', height: '28px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                    border: safePage === n ? '1px solid rgba(6,182,212,0.4)' : '1px solid #1e293b',
                    background: safePage === n ? 'rgba(6,182,212,0.15)' : 'transparent',
                    color: safePage === n ? '#22d3ee' : '#64748b',
                  }}
                >{n}</button>
              ))}
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className="btn-ghost" style={{ padding: '5px 10px', fontSize: '12px' }}>
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedAlert && (
        <AlertDetailModal
          alert={selectedAlert}
          onClose={() => setSelectedAlert(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}
