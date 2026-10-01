// =============================================================================
// src/pages/ReportsPage.jsx
// Báo cáo — Tạo/tải báo cáo CSV/JSON, lịch gửi
// API: POST /api/v1/reports, GET /api/v1/reports/:id/download, /api/v1/report-schedules
// =============================================================================

import { Download, FileBarChart2, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../context/AppContext';

// ─── Sample Data ──────────────────────────────────────────────────────────────
const REPORT_TYPES = [
  { value: 'summary',   label: 'Tổng kết bảo mật hàng tuần' },
  { value: 'alerts',    label: 'Báo cáo cảnh báo' },
  { value: 'incidents', label: 'Báo cáo sự cố' },
  { value: 'vulns',     label: 'Báo cáo lỗ hổng' },
  { value: 'audit',     label: 'Nhật ký audit' },
  { value: 'agents',    label: 'Tình trạng agent & EDR' },
];

const INIT_HIST = [
  { id: 'RPT-005', type: 'Tổng kết bảo mật hàng tuần', range: 'Tuần 39/2026', format: 'PDF', created_at: '2026-09-29 08:00', size: '1.2 MB', status: 'ready' },
  { id: 'RPT-004', type: 'Báo cáo cảnh báo',           range: '2026-09-28',    format: 'CSV', created_at: '2026-09-28 09:00', size: '340 KB', status: 'ready' },
  { id: 'RPT-003', type: 'Báo cáo lỗ hổng',            range: 'Tháng 9/2026',  format: 'JSON', created_at: '2026-09-25 10:00', size: '95 KB', status: 'ready' },
  { id: 'RPT-002', type: 'Báo cáo sự cố',              range: 'Q3/2026',        format: 'PDF', created_at: '2026-09-01 07:00', size: '2.4 MB', status: 'ready' },
  { id: 'RPT-001', type: 'Nhật ký audit',               range: 'Tháng 8/2026',  format: 'CSV', created_at: '2026-08-31 23:00', size: '890 KB', status: 'ready' },
];

const INIT_SCHEDULES = [
  { id: 'SCH-001', type: 'Tổng kết bảo mật hàng tuần', cron: 'Thứ 2 hàng tuần, 07:00',  format: 'PDF', recipients: 'ciso@company.vn, soc-team@company.vn', enabled: true },
  { id: 'SCH-002', type: 'Báo cáo cảnh báo',            cron: 'Hàng ngày, 08:00',         format: 'CSV', recipients: 'soc-team@company.vn', enabled: true },
  { id: 'SCH-003', type: 'Báo cáo lỗ hổng',             cron: 'Ngày 1 hàng tháng, 09:00', format: 'JSON', recipients: 'security@company.vn', enabled: false },
];

const FORMAT_CONFIG = {
  PDF:  { color: '#f87171', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)' },
  CSV:  { color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.3)' },
  JSON: { color: '#60a5fa', bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.3)' },
};

function FormatBadge({ fmt }) {
  const c = FORMAT_CONFIG[fmt] || { color: '#94a3b8', bg: 'transparent', border: '#334155' };
  return <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, fontFamily: 'monospace', color: c.color, background: c.bg, border: `1px solid ${c.border}` }}>{fmt}</span>;
}

const TABS = ['Tạo báo cáo', 'Lịch sử', 'Lịch tự động'];

export default function ReportsPage() {
  const { addToast } = useApp();
  const [activeTab, setActiveTab] = useState(0);
  const [history, setHistory] = useState(INIT_HIST);
  const [schedules, setSchedules] = useState(INIT_SCHEDULES);

  // Form state
  const [form, setForm] = useState({ type: 'summary', range: 'today', format: 'CSV', notes: '' });
  const [generating, setGenerating] = useState(false);

  const generateReport = async () => {
    if (!form.type) { addToast({ severity: 'critical', title: 'Chọn loại báo cáo' }); return; }
    setGenerating(true);
    await new Promise(r => setTimeout(r, 1200));
    const typeLabel = REPORT_TYPES.find(t => t.value === form.type)?.label || form.type;
    const id = `RPT-${String(history.length + 6).padStart(3, '0')}`;
    setHistory(prev => [{
      id, type: typeLabel, range: form.range,
      format: form.format, created_at: new Date().toLocaleString('vi-VN'),
      size: `${Math.floor(Math.random() * 900 + 100)} KB`, status: 'ready',
    }, ...prev]);
    setGenerating(false);
    addToast({ severity: 'info', title: 'Đã tạo báo cáo', message: `${id} · ${typeLabel}` });
    setActiveTab(1);
  };

  const downloadReport = (rpt) => {
    addToast({ severity: 'info', title: 'Đang tải xuống', message: `${rpt.id} · ${rpt.format}` });
    // Simulate download: would call GET /api/v1/reports/:id/download
  };

  const deleteReport = (id) => {
    if (!confirm(`Xóa báo cáo ${id}?`)) return;
    setHistory(prev => prev.filter(r => r.id !== id));
    addToast({ severity: 'info', title: 'Đã xóa báo cáo', message: id });
  };

  const toggleSchedule = (id) => {
    setSchedules(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
    const s = schedules.find(x => x.id === id);
    addToast({ severity: 'info', title: s?.enabled ? 'Đã tắt lịch tự động' : 'Đã bật lịch tự động', message: id });
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 lg:px-6 py-5 flex flex-col gap-5 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2.5" style={{ color: '#f8fafc' }}>
          <span style={{ background: 'rgba(249,168,212,0.15)', border: '1px solid rgba(249,168,212,0.3)', borderRadius: '10px', padding: '6px 8px', display: 'inline-flex', alignItems: 'center' }}>
            <FileBarChart2 size={18} style={{ color: '#f9a8d4' }} />
          </span>
          Báo cáo
        </h1>
        <p className="text-xs mt-1" style={{ color: '#64748b' }}>Tạo, tải xuống và lên lịch báo cáo bảo mật</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: 'Báo cáo đã tạo', value: history.length, color: '#f9a8d4', border: '#f472b6' },
          { label: 'Lịch tự động',   value: schedules.filter(s => s.enabled).length + ' / ' + schedules.length, color: '#86efac', border: '#22c55e' },
          { label: 'Tuần này',       value: history.filter(r => r.created_at.includes('2026-09')).length, color: '#60a5fa', border: '#3b82f6' },
        ].map(kpi => (
          <div key={kpi.label} className="soc-card" style={{ borderLeft: `3px solid ${kpi.border}`, padding: '16px 18px' }}>
            <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>{kpi.label}</p>
            <p className="stat-number" style={{ color: kpi.color, fontSize: '24px' }}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="soc-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #1e293b', padding: '0 20px', gap: '4px' }}>
          {TABS.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '12px 14px',
                fontSize: '12.5px', fontWeight: activeTab === i ? 600 : 500,
                color: activeTab === i ? '#06b6d4' : '#64748b',
                borderBottom: activeTab === i ? '2px solid #06b6d4' : '2px solid transparent',
                transition: 'all 0.18s ease',
              }}
            >{tab}</button>
          ))}
        </div>

        {/* Tab 0: Tạo báo cáo */}
        {activeTab === 0 && (
          <div style={{ padding: '24px 24px', maxWidth: '560px' }}>
            <div style={{ display: 'grid', gap: '16px' }}>
              <div style={{ display: 'grid', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>Loại báo cáo</label>
                <select className="soc-input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={{ fontSize: '12px' }}>
                  {REPORT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'grid', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>Khoảng thời gian</label>
                  <select className="soc-input" value={form.range} onChange={e => setForm(f => ({ ...f, range: e.target.value }))} style={{ fontSize: '12px' }}>
                    <option value="today">Hôm nay</option>
                    <option value="yesterday">Hôm qua</option>
                    <option value="week">Tuần này</option>
                    <option value="last_week">Tuần trước</option>
                    <option value="month">Tháng này</option>
                    <option value="last_month">Tháng trước</option>
                    <option value="quarter">Quý này</option>
                  </select>
                </div>
                <div style={{ display: 'grid', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>Định dạng</label>
                  <select className="soc-input" value={form.format} onChange={e => setForm(f => ({ ...f, format: e.target.value }))} style={{ fontSize: '12px' }}>
                    <option value="CSV">CSV</option>
                    <option value="JSON">JSON</option>
                    <option value="PDF">PDF</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>Ghi chú (tùy chọn)</label>
                <textarea
                  className="soc-input"
                  rows={3}
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Ghi chú thêm về báo cáo này…"
                  style={{ fontSize: '12px', resize: 'vertical', fontFamily: "'Inter', sans-serif" }}
                />
              </div>
              <button
                onClick={generateReport}
                disabled={generating}
                className="btn-primary flex items-center gap-2"
                style={{ fontSize: '13px', padding: '11px 20px', justifyContent: 'center' }}
              >
                {generating ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                {generating ? 'Đang tạo báo cáo…' : 'Tạo báo cáo'}
              </button>
            </div>
          </div>
        )}

        {/* Tab 1: Lịch sử */}
        {activeTab === 1 && (
          <div style={{ overflowX: 'auto', maxHeight: '480px', overflowY: 'auto' }}>
            <table className="soc-table">
              <thead><tr><th>ID</th><th>Loại</th><th>Khoảng</th><th>Định dạng</th><th>Kích thước</th><th>Tạo lúc</th><th>Thao tác</th></tr></thead>
              <tbody>
                {history.length === 0 ? (
                  <tr><td colSpan={7}><div className="empty-state"><p className="empty-state-title">Chưa có báo cáo</p><p className="empty-state-desc">Tạo báo cáo đầu tiên ở tab Tạo báo cáo</p></div></td></tr>
                ) : history.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '11.5px', color: '#f9a8d4' }}>{r.id}</td>
                    <td style={{ fontSize: '12.5px', fontWeight: 500, color: '#e2e8f0', maxWidth: '200px' }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.type}</span>
                    </td>
                    <td style={{ fontSize: '11.5px', color: '#94a3b8', fontFamily: 'monospace' }}>{r.range}</td>
                    <td><FormatBadge fmt={r.format} /></td>
                    <td style={{ fontFamily: 'monospace', fontSize: '11px', color: '#64748b' }}>{r.size}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>{r.created_at}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => downloadReport(r)} className="btn-ghost" style={{ fontSize: '11px', padding: '3px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Download size={11} /> Tải
                        </button>
                        <button onClick={() => deleteReport(r.id)} className="btn-action-red" style={{ fontSize: '11px', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Lịch tự động */}
        {activeTab === 2 && (
          <div style={{ overflowX: 'auto', maxHeight: '480px', overflowY: 'auto' }}>
            <table className="soc-table">
              <thead><tr><th>ID</th><th>Loại</th><th>Lịch</th><th>Định dạng</th><th>Gửi đến</th><th>Trạng thái</th></tr></thead>
              <tbody>
                {schedules.map(s => (
                  <tr key={s.id} style={{ opacity: s.enabled ? 1 : 0.5 }}>
                    <td style={{ fontFamily: 'monospace', fontSize: '11.5px', color: '#86efac' }}>{s.id}</td>
                    <td style={{ fontSize: '12.5px', fontWeight: 500, color: '#e2e8f0', maxWidth: '180px' }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.type}</span>
                    </td>
                    <td style={{ fontSize: '11.5px', color: '#94a3b8' }}>{s.cron}</td>
                    <td><FormatBadge fmt={s.format} /></td>
                    <td style={{ fontSize: '11px', color: '#64748b', maxWidth: '220px' }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.recipients}</span>
                    </td>
                    <td>
                      <button
                        onClick={() => toggleSchedule(s.id)}
                        role="switch" aria-checked={s.enabled}
                        aria-label={s.enabled ? 'Tắt lịch' : 'Bật lịch'}
                        style={{ width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer', position: 'relative', background: s.enabled ? '#22c55e' : '#374151', transition: 'background 0.2s ease' }}
                      >
                        <span style={{ position: 'absolute', top: '2px', left: s.enabled ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s ease' }} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
