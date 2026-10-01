// =============================================================================
// src/pages/MitrePage.jsx
// MITRE ATT&CK — Ma trận độ phủ phát hiện theo chiến thuật và kỹ thuật
// API: GET /api/v1/mitre/coverage
// =============================================================================

import { Layers, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';

// ─── Sample MITRE data (replace with API) ────────────────────────────────────
const RAW_DATA = {
  'Reconnaissance':        'T1595|Active Scanning|14|SCAN-001;T1592|Gather Victim Host Info|0|',
  'Initial Access':        'T1566|Phishing|38|PHISH-001,MAIL-004;T1190|Exploit Public App|9|WAF-002;T1078|Valid Accounts|6|AUTH-007',
  'Execution':             'T1059.001|PowerShell|52|PS-SUSPICIOUS-001,RULE-PS-ENCODED;T1204|User Execution|11|EDR-010;T1047|WMI|0|',
  'Persistence':           'T1547|Boot/Logon Autostart|21|REG-003;T1053|Scheduled Task|0|;T1136|Create Account|4|AUTH-011',
  'Privilege Escalation':  'T1068|Exploitation for Priv Esc|0|;T1548|Abuse Elevation Control|33|UAC-002',
  'Defense Evasion':       'T1564|Hide Artifacts|29|FIM-001;T1070|Indicator Removal|47|LOG-005;T1027|Obfuscated Files|0|',
  'Credential Access':     'T1110|Brute Force|60|SSH-BF-001,AUTH-002;T1003|OS Credential Dumping|8|EDR-021',
  'Discovery':             'T1046|Network Service Discovery|18|SCAN-002;T1082|System Info Discovery|0|',
  'Lateral Movement':      'T1021|Remote Services|24|RDP-004;T1570|Lateral Tool Transfer|0|',
  'Collection':            'T1005|Data from Local System|9|FIM-002;T1114|Email Collection|0|',
  'Command and Control':   'T1071|Application Layer Protocol|31|RULE-NETWORK-C2;T1105|Ingress Tool Transfer|14|PROXY-003',
  'Exfiltration':          'T1041|Exfiltration Over C2|12|DLP-001;T1567|Exfil to Web Service|0|',
  'Impact':                'T1490|Inhibit System Recovery|17|RANSOMWARE-VSS-001;T1486|Data Encrypted for Impact|22|RANSOM-ENC-002;T1498|Network DoS|0|',
};

const tactics = Object.entries(RAW_DATA).map(([tactic, raw]) => ({
  tactic,
  techniques: raw.split(';').map(s => {
    const [id, name, hits, rulesStr] = s.split('|');
    return { id, name, hits: +hits, rules: rulesStr ? rulesStr.split(',').filter(Boolean) : [] };
  }),
}));

const allTechniques = tactics.flatMap(t => t.techniques);

// ─── Heatmap color helpers ────────────────────────────────────────────────────
function getTechClass(t) {
  if (!t.rules.length) return 'gap';
  if (t.hits >= 30) return 'hi';
  if (t.hits > 0) return 'md';
  return 'lo';
}

const TECH_STYLES = {
  gap: { background: 'rgba(30,41,59,0.5)', border: '1px dashed rgba(71,85,105,0.5)', color: '#475569' },
  lo:  { background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)', color: '#67e8f9' },
  md:  { background: 'rgba(6,182,212,0.25)', border: '1px solid rgba(6,182,212,0.4)', color: '#22d3ee' },
  hi:  { background: 'rgba(6,182,212,0.6)', border: '1px solid rgba(6,182,212,0.8)', color: '#0c0f1a' },
};

// =============================================================================
export default function MitrePage() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all'); // all | cov | gap
  const [selected, setSelected] = useState(null);
  const { addToast } = { addToast: () => {} };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tactics.map(({ tactic, techniques }) => ({
      tactic,
      techniques: techniques.filter(t => {
        if (filter === 'cov' && !t.rules.length) return false;
        if (filter === 'gap' && t.rules.length) return false;
        if (q && !(t.id + t.name).toLowerCase().includes(q)) return false;
        return true;
      }),
    })).filter(({ techniques }) => techniques.length > 0);
  }, [query, filter]);

  const covered = allTechniques.filter(t => t.rules.length).length;
  const detected = allTechniques.filter(t => t.hits > 0).length;
  const gap = Math.round((allTechniques.length - covered) / allTechniques.length * 100);

  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 lg:px-6 py-5 flex flex-col gap-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2.5" style={{ color: '#f8fafc' }}>
            <span style={{ background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.3)', borderRadius: '10px', padding: '6px 8px', display: 'inline-flex', alignItems: 'center' }}>
              <Layers size={18} style={{ color: '#a78bfa' }} />
            </span>
            MITRE ATT&amp;CK
          </h1>
          <p className="text-xs mt-1" style={{ color: '#64748b' }}>Độ phủ phát hiện theo chiến thuật và kỹ thuật</p>
        </div>
        <button
          onClick={() => window.open('https://attack.mitre.org', '_blank')}
          className="btn-ghost text-xs"
        >
          Mở MITRE ATT&amp;CK
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Tổng kỹ thuật', value: allTechniques.length, color: '#06b6d4', border: '#06b6d4' },
          { label: 'Đã có rule',      value: covered,               color: '#4ade80', border: '#22c55e' },
          { label: 'Có phát hiện',    value: detected,              color: '#fb923c', border: '#f97316' },
          { label: 'Khoảng trống %',  value: `${gap}%`,             color: '#f87171', border: '#ef4444' },
        ].map(kpi => (
          <div key={kpi.label} className="soc-card" style={{ borderLeft: `3px solid ${kpi.border}`, padding: '16px 18px' }}>
            <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>{kpi.label}</p>
            <p className="stat-number" style={{ color: kpi.color }}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', fontSize: '12px', color: '#64748b' }}>
        {[
          { cls: 'lo',  label: 'Có rule (chưa phát hiện)' },
          { cls: 'md',  label: 'Có phát hiện' },
          { cls: 'hi',  label: 'Phát hiện nhiều (≥30)' },
          { cls: 'gap', label: 'Chưa có rule (khoảng trống)' },
        ].map(({ cls, label }) => (
          <span key={cls} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '3px', flexShrink: 0, ...TECH_STYLES[cls] }} />
            {label}
          </span>
        ))}
      </div>

      {/* Filter bar */}
      <div className="soc-card" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
            <input
              className="soc-input"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Tìm kỹ thuật: T1059, PowerShell…"
              style={{ paddingLeft: '32px', fontSize: '12px' }}
            />
          </div>
          <select
            className="soc-input"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{ width: 'auto', fontSize: '12px' }}
          >
            <option value="all">Tất cả kỹ thuật</option>
            <option value="cov">Đã có rule</option>
            <option value="gap">Chưa có rule (khoảng trống)</option>
          </select>
        </div>
      </div>

      {/* MITRE Matrix */}
      <div className="soc-card" style={{ padding: '16px 18px', overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: '12px', minWidth: 'max-content' }}>
          {filtered.map(({ tactic, techniques }) => (
            <div key={tactic} style={{ minWidth: '160px', flex: 1 }}>
              {/* Tactic header */}
              <div style={{
                fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                color: '#64748b', padding: '6px 4px', borderBottom: '2px solid #1e293b', marginBottom: '8px',
              }}>
                {tactic} <span style={{ color: '#475569', fontWeight: 400 }}>({techniques.length})</span>
              </div>

              {/* Techniques */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {techniques.map(t => {
                  const cls = getTechClass(t);
                  const style = TECH_STYLES[cls];
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelected(t)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        borderRadius: '6px', padding: '7px 9px', cursor: 'pointer',
                        fontSize: '11.5px', lineHeight: 1.4,
                        transition: 'all 0.18s ease',
                        ...style,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.2)'; }}
                      onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
                    >
                      <span style={{ display: 'block', fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', fontWeight: 700, marginBottom: '2px', opacity: 0.9 }}>{t.id}</span>
                      <span style={{ display: 'block' }}>{t.name}</span>
                      {t.hits > 0 && <span style={{ fontSize: '10px', opacity: 0.7, fontFamily: 'monospace' }}>· {t.hits} phát hiện</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="empty-state" style={{ flex: 1 }}>
              <p className="empty-state-title">Không tìm thấy kỹ thuật nào</p>
              <p className="empty-state-desc">Thử đổi bộ lọc hoặc từ khóa</p>
            </div>
          )}
        </div>
      </div>

      {/* Technique Detail Modal */}
      {selected && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={() => setSelected(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'linear-gradient(145deg,#111827,#0f172a)', border: '1px solid #1e293b', borderRadius: '16px', width: '100%', maxWidth: '520px', boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #1e293b' }}>
              <div>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: '#a78bfa' }}>{selected.id}</span>
                <p style={{ fontWeight: 600, fontSize: '14px', color: '#f8fafc', marginTop: '3px' }}>{selected.name}</p>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <div style={{ padding: '16px 18px', display: 'grid', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1, background: 'rgba(30,41,59,0.4)', borderRadius: '8px', padding: '10px 12px' }}>
                  <p style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Phát hiện gần đây</p>
                  <p style={{ fontSize: '22px', fontWeight: 800, color: '#f8fafc', fontFamily: 'monospace', marginTop: '4px' }}>{selected.hits}</p>
                </div>
                <div style={{ flex: 1, background: 'rgba(30,41,59,0.4)', borderRadius: '8px', padding: '10px 12px' }}>
                  <p style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Rules đang phủ</p>
                  <p style={{ fontSize: '22px', fontWeight: 800, color: selected.rules.length ? '#4ade80' : '#f87171', fontFamily: 'monospace', marginTop: '4px' }}>{selected.rules.length}</p>
                </div>
              </div>

              <div>
                <p style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                  Rule đang phủ kỹ thuật này
                </p>
                {selected.rules.length ? (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {selected.rules.map(r => (
                      <span key={r} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', padding: '3px 10px', borderRadius: '5px', background: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.2)' }}>
                        {r}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state" style={{ padding: '20px 16px' }}>
                    <p className="empty-state-title" style={{ color: '#f87171' }}>Chưa có rule nào</p>
                    <p className="empty-state-desc">Đây là khoảng trống phủ. Hãy tạo rule phát hiện mới.</p>
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '12px 18px', borderTop: '1px solid #1e293b' }}>
              <button onClick={() => setSelected(null)} className="btn-ghost" style={{ fontSize: '12px' }}>Đóng</button>
              <button className="btn-primary" style={{ fontSize: '12px' }}>Tạo / Sửa Rule</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
