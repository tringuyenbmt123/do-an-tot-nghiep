// =============================================================================
// src/pages/FirewallPage.jsx
// Firewall / IDS — Rule firewall, cảnh báo IDS, IP blocklist
// API: /api/v1/firewall/rules, /api/v1/ids/alerts, /api/v1/blocklist
// =============================================================================

import { Network, Plus, RefreshCw, Search, Shield, ShieldOff, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';

// ─── Sample Data ──────────────────────────────────────────────────────────────
const SAMPLE_FW_RULES = [
  { id: 'FW-001', name: 'Block known C2 IPs', action: 'DENY', src: '185.220.101.0/24', dst: 'any', port: 'any', hits: 1840, enabled: true },
  { id: 'FW-002', name: 'Allow HTTPS outbound', action: 'ALLOW', src: '10.10.0.0/16', dst: 'any', port: '443', hits: 92000, enabled: true },
  { id: 'FW-003', name: 'Block Tor exit nodes', action: 'DENY', src: '91.132.147.0/24', dst: 'any', port: 'any', hits: 320, enabled: true },
  { id: 'FW-004', name: 'Allow DNS internal', action: 'ALLOW', src: '10.10.0.0/16', dst: '10.10.0.1', port: '53', hits: 145000, enabled: true },
  { id: 'FW-005', name: 'Block RDP from internet', action: 'DENY', src: 'any', dst: '10.10.0.0/16', port: '3389', hits: 7420, enabled: true },
  { id: 'FW-006', name: 'Test rule (disabled)', action: 'DENY', src: '192.168.1.0/24', dst: 'any', port: '8080', hits: 0, enabled: false },
];

const SAMPLE_IDS_ALERTS = [
  { id: 'IDS-1021', sid: '2027865', signature: 'ET SCAN Nmap TCP', severity: 'medium', src: '45.155.205.9', dst: '10.10.0.0/16', count: 142, last: new Date(Date.now() - 300000).toISOString() },
  { id: 'IDS-1020', sid: '2018959', signature: 'ET MALWARE CobaltStrike Beacon', severity: 'critical', src: '185.220.101.4', dst: 'FS-HN-02', count: 8, last: new Date(Date.now() - 600000).toISOString() },
  { id: 'IDS-1019', sid: '2100366', signature: 'ET DROP Dshield Block Listed', severity: 'high', src: '91.132.147.2', dst: 'VPN-01', count: 34, last: new Date(Date.now() - 1200000).toISOString() },
  { id: 'IDS-1018', sid: '2016476', signature: 'ET POLICY SSH Brute Force Login', severity: 'high', src: '45.155.205.9', dst: 'GW-DMZ-01', count: 1240, last: new Date(Date.now() - 900000).toISOString() },
  { id: 'IDS-1017', sid: '2021001', signature: 'ET WEB_CLIENT ETPRO Adobe Flash', severity: 'medium', src: '91.132.147.2', dst: 'PC-KT-17', count: 2, last: new Date(Date.now() - 3600000).toISOString() },
];

const SAMPLE_BLOCKLIST = [
  { id: 'BL-001', cidr: '185.220.101.0/24', reason: 'Known Tor Exit / C2',      expires_at: '2026-12-31', created_at: '2026-09-20' },
  { id: 'BL-002', cidr: '91.132.147.2',     reason: 'Brute-force SSH',           expires_at: '2026-10-15', created_at: '2026-09-28' },
  { id: 'BL-003', cidr: '45.155.205.9',     reason: 'Nmap scan / reconnaissance', expires_at: '2026-10-07', created_at: '2026-09-29' },
  { id: 'BL-004', cidr: '194.165.16.0/24',  reason: 'DDoS botnet',               expires_at: '2026-11-01', created_at: '2026-09-15' },
];

const ACTION_CONFIG  = { DENY: { color: '#f87171', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)' }, ALLOW: { color: '#4ade80', bg: 'rgba(74,222,128,0.1)', border: 'rgba(74,222,128,0.3)' } };
const IDS_SEV_CONFIG = { critical: { color: '#f87171', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)' }, high: { color: '#fb923c', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.3)' }, medium: { color: '#facc15', bg: 'rgba(234,179,8,0.1)', border: 'rgba(234,179,8,0.3)' }, low: { color: '#60a5fa', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)' } };

function SevBadge({ sev }) { const c = IDS_SEV_CONFIG[sev] || IDS_SEV_CONFIG.low; return <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, color: c.color, background: c.bg, border: `1px solid ${c.border}` }}>{sev}</span>; }
function ActionBadge({ action }) { const c = ACTION_CONFIG[action] || {}; return <span style={{ padding: '2px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, color: c.color, background: c.bg, border: `1px solid ${c.border}` }}>{action}</span>; }

const TABS = ['Firewall Rules', 'IDS Alerts', 'IP Blocklist'];

export default function FirewallPage() {
  const { addToast } = useApp();
  const [activeTab, setActiveTab] = useState(0);
  const [fwRules, setFwRules]     = useState(SAMPLE_FW_RULES);
  const [idsAlerts, setIdsAlerts] = useState(SAMPLE_IDS_ALERTS);
  const [blocklist, setBlocklist] = useState(SAMPLE_BLOCKLIST);
  const [query, setQuery]         = useState('');
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [blockIp, setBlockIp]     = useState('');
  const [blockReason, setBlockReason] = useState('');

  const toggleRule = (id) => {
    setFwRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
    addToast({ severity: 'info', title: 'Đã cập nhật rule', message: `Rule ${id}` });
  };

  const removeBlock = (id) => {
    if (!confirm('Xóa IP khỏi blocklist?')) return;
    setBlocklist(prev => prev.filter(b => b.id !== id));
    addToast({ severity: 'info', title: 'Đã xóa khỏi blocklist' });
  };

  const addBlock = () => {
    if (!blockIp.trim()) { addToast({ severity: 'critical', title: 'Nhập IP/CIDR hợp lệ' }); return; }
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    if (!ipRegex.test(blockIp.trim())) { addToast({ severity: 'critical', title: 'Định dạng IP không hợp lệ' }); return; }
    const id = `BL-${Date.now()}`;
    setBlocklist(prev => [{ id, cidr: blockIp.trim(), reason: blockReason.trim() || 'Thủ công', expires_at: null, created_at: new Date().toISOString().slice(0, 10) }, ...prev]);
    addToast({ severity: 'info', title: 'Đã thêm vào blocklist', message: blockIp.trim() });
    setBlockIp(''); setBlockReason(''); setShowBlockForm(false);
  };

  const filteredFw  = useMemo(() => { const q = query.toLowerCase(); return fwRules.filter(r => !q || (r.name + r.src + r.dst + r.id).toLowerCase().includes(q)); }, [fwRules, query]);
  const filteredIds = useMemo(() => { const q = query.toLowerCase(); return idsAlerts.filter(a => !q || (a.signature + a.src + a.sid).toLowerCase().includes(q)); }, [idsAlerts, query]);
  const filteredBl  = useMemo(() => { const q = query.toLowerCase(); return blocklist.filter(b => !q || (b.cidr + b.reason).toLowerCase().includes(q)); }, [blocklist, query]);

  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 lg:px-6 py-5 flex flex-col gap-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2.5" style={{ color: '#f8fafc' }}>
            <span style={{ background: 'rgba(244,114,182,0.15)', border: '1px solid rgba(244,114,182,0.3)', borderRadius: '10px', padding: '6px 8px', display: 'inline-flex', alignItems: 'center' }}>
              <Network size={18} style={{ color: '#f472b6' }} />
            </span>
            Firewall / IDS
          </h1>
          <p className="text-xs mt-1" style={{ color: '#64748b' }}>Quản lý rule firewall, cảnh báo IDS và danh sách IP chặn</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'FW Rules',         value: fwRules.filter(r => r.enabled).length + ' / ' + fwRules.length,  color: '#22d3ee', border: '#06b6d4' },
          { label: 'IDS Alerts hôm nay', value: idsAlerts.length,  color: '#fb923c', border: '#f97316' },
          { label: 'IDS Critical',     value: idsAlerts.filter(a => a.severity === 'critical').length, color: '#f87171', border: '#ef4444' },
          { label: 'IP bị chặn',       value: blocklist.length,    color: '#a78bfa', border: '#8b5cf6' },
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
              onClick={() => { setActiveTab(i); setQuery(''); }}
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

        {/* Toolbar */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #1e293b', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
            <input className="soc-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm kiếm…" style={{ paddingLeft: '32px', fontSize: '12px' }} />
          </div>
          {activeTab === 2 && (
            <button onClick={() => setShowBlockForm(f => !f)} className="btn-primary flex items-center gap-2" style={{ fontSize: '12px', padding: '8px 14px' }}>
              <Plus size={12} /> Thêm IP
            </button>
          )}
        </div>

        {/* Add IP form */}
        {activeTab === 2 && showBlockForm && (
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #1e293b', background: 'rgba(6,182,212,0.04)', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ display: 'grid', gap: '4px', flex: '1', minWidth: '180px' }}>
              <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>IP / CIDR</label>
              <input className="soc-input" value={blockIp} onChange={e => setBlockIp(e.target.value)} placeholder="192.168.1.1 hoặc 10.0.0.0/8" style={{ fontSize: '12px' }} />
            </div>
            <div style={{ display: 'grid', gap: '4px', flex: '2', minWidth: '200px' }}>
              <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Lý do</label>
              <input className="soc-input" value={blockReason} onChange={e => setBlockReason(e.target.value)} placeholder="VD: DDoS botnet" style={{ fontSize: '12px' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={addBlock} className="btn-primary" style={{ fontSize: '12px', padding: '9px 16px' }}>Thêm</button>
              <button onClick={() => setShowBlockForm(false)} className="btn-ghost" style={{ fontSize: '12px', padding: '9px 12px' }}><X size={13} /></button>
            </div>
          </div>
        )}

        {/* Tab content */}
        <div style={{ overflowX: 'auto', maxHeight: '500px', overflowY: 'auto' }}>
          {activeTab === 0 && (
            <table className="soc-table">
              <thead><tr><th>ID</th><th>Rule</th><th>Action</th><th>Nguồn</th><th>Đích</th><th>Cổng</th><th>Hits</th><th>Trạng thái</th></tr></thead>
              <tbody>
                {filteredFw.map(r => (
                  <tr key={r.id} style={{ opacity: r.enabled ? 1 : 0.45 }}>
                    <td style={{ fontFamily: 'monospace', fontSize: '11.5px', color: '#06b6d4' }}>{r.id}</td>
                    <td style={{ fontSize: '12.5px', fontWeight: 500, color: '#e2e8f0' }}>{r.name}</td>
                    <td><ActionBadge action={r.action} /></td>
                    <td style={{ fontFamily: 'monospace', fontSize: '11.5px', color: '#94a3b8' }}>{r.src}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '11.5px', color: '#94a3b8' }}>{r.dst}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '11.5px', color: '#94a3b8' }}>{r.port}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px', color: '#f8fafc' }}>{r.hits.toLocaleString('vi-VN')}</td>
                    <td>
                      <button
                        onClick={() => toggleRule(r.id)}
                        role="switch"
                        aria-checked={r.enabled}
                        aria-label={r.enabled ? 'Tắt rule' : 'Bật rule'}
                        style={{ width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer', position: 'relative', background: r.enabled ? '#22c55e' : '#374151', transition: 'background 0.2s ease' }}
                      >
                        <span style={{ position: 'absolute', top: '2px', left: r.enabled ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s ease' }} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === 1 && (
            <table className="soc-table">
              <thead><tr><th>ID</th><th>SID</th><th>Signature</th><th>Mức độ</th><th>Nguồn</th><th>Đích</th><th>Số lần</th><th>Lần cuối</th></tr></thead>
              <tbody>
                {filteredIds.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '11.5px', color: '#f472b6' }}>{a.id}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '11px', color: '#64748b' }}>{a.sid}</td>
                    <td style={{ fontSize: '12.5px', fontWeight: 500, color: '#e2e8f0', maxWidth: '280px' }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.signature}</span>
                    </td>
                    <td><SevBadge sev={a.severity} /></td>
                    <td style={{ fontFamily: 'monospace', fontSize: '11.5px', color: '#94a3b8' }}>{a.src}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '11.5px', color: '#94a3b8' }}>{a.dst}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 700, color: '#f8fafc' }}>{a.count.toLocaleString('vi-VN')}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>
                      {a.last ? new Date(a.last).toLocaleTimeString('vi-VN') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === 2 && (
            <table className="soc-table">
              <thead><tr><th>ID</th><th>IP / CIDR</th><th>Lý do</th><th>Hết hạn</th><th>Ngày thêm</th><th>Thao tác</th></tr></thead>
              <tbody>
                {filteredBl.length === 0 ? (
                  <tr><td colSpan={6}><div className="empty-state"><p className="empty-state-title">Danh sách chặn trống</p></div></td></tr>
                ) : filteredBl.map(b => (
                  <tr key={b.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '11.5px', color: '#a78bfa' }}>{b.id}</td>
                    <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', fontWeight: 700, color: '#f87171' }}>{b.cidr}</td>
                    <td style={{ fontSize: '12.5px', color: '#e2e8f0', maxWidth: '220px' }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.reason}</span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '11.5px', color: '#64748b' }}>{b.expires_at || 'Vĩnh viễn'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '11.5px', color: '#64748b' }}>{b.created_at}</td>
                    <td>
                      <button onClick={() => removeBlock(b.id)} className="btn-action-red" style={{ fontSize: '11px', padding: '3px 10px' }}>
                        <X size={11} /> Xóa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
