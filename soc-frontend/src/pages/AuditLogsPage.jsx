// =============================================================================
// src/pages/AuditLogsPage.jsx — v2 Cyberpunk Enterprise Redesign
// =============================================================================

import {
  Activity,
  Check,
  FileText,
  Loader,
  RefreshCw,
  Save,
  Settings,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { PageLoader } from '../components/common/LoadingSpinner';
import { useApp } from '../context/AppContext';
import { getAuditLogs, getSystemSettings, saveSystemSettings } from '../services/api';

// ─── Source Badge ─────────────────────────────────────────────────────────────
const SourceBadge = ({ source }) => {
  const map = {
    'Rule-based': { color: '#3b82f6', bg: 'rgba(59,130,246,0.08)',   border: 'rgba(59,130,246,0.2)',  label: '⚙ Rule-based' },
    AI:           { color: '#06b6d4', bg: 'rgba(6,182,212,0.08)',    border: 'rgba(6,182,212,0.2)',   label: '🤖 AI' },
    'Human-HITL': { color: '#ff9900', bg: 'rgba(255,153,0,0.08)',    border: 'rgba(255,153,0,0.2)',   label: '👤 HITL' },
    Manual:       { color: '#a855f7', bg: 'rgba(168,85,247,0.08)',   border: 'rgba(168,85,247,0.2)', label: '🖱 Manual' },
    SOAR:         { color: '#10b981', bg: 'rgba(16,185,129,0.08)',   border: 'rgba(16,185,129,0.2)', label: '🔄 SOAR' },
  };
  const cfg = map[source] || { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.2)', label: source };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
      {cfg.label}
    </span>
  );
};

// ─── Action Badge ─────────────────────────────────────────────────────────────
const ActionBadge = ({ action }) => {
  const dangerous = ['block_ip', 'kill_process', 'isolate_network', 'quarantine_file'];
  const isDanger  = dangerous.includes(action);
  return (
    <span className="font-mono text-xs px-2 py-0.5 rounded-md"
      style={isDanger
        ? { background: 'rgba(255,51,102,0.08)', color: '#ff3366', border: '1px solid rgba(255,51,102,0.2)' }
        : { background: '#0a0e17', color: '#64748b', border: '1px solid #1e293b' }}>
      {action}
    </span>
  );
};

// ─── Mini Confidence Bar ───────────────────────────────────────────────────────
const ConfidenceBar = ({ value }) => {
  const pct = Math.round((value || 0) * 100);
  const color = pct >= 80 ? '#10b981' : pct >= 60 ? '#eab308' : '#ff9900';
  return (
    <div className="flex items-center gap-2">
      <div style={{ width:'56px', height:'4px', borderRadius:'999px', background:'#1e293b', overflow:'hidden', flexShrink:0 }}>
        <div style={{ height:'100%', width:`${pct}%`, background: color, borderRadius:'999px', transition:'width 0.4s ease' }} />
      </div>
      <span className="font-mono text-xs" style={{ color, minWidth:'30px' }}>{pct}%</span>
    </div>
  );
};

// ─── Settings Panel ────────────────────────────────────────────────────────────
function SettingsPanel() {
  const { addToast }              = useApp();
  const [settings, setSettings]  = useState(null);
  const [loading,  setLoading]   = useState(true);
  const [saving,   setSaving]    = useState(false);
  const [saved,    setSaved]     = useState(false);

  useEffect(() => {
    getSystemSettings().then(data => { setSettings(data); setLoading(false); });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSystemSettings(settings);
      setSaved(true);
      addToast({ severity: 'success', title: 'Settings saved', message: 'SOAR configuration updated.' });
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      addToast({ severity: 'high', title: 'Failed to save', message: e.message });
    } finally {
      setSaving(false);
    }
  };

  const Toggle = ({ field, label, description, accentColor = '#06b6d4' }) => {
    const on = settings?.[field];
    const r  = parseInt(accentColor.slice(1,3),16);
    const g  = parseInt(accentColor.slice(3,5),16);
    const b  = parseInt(accentColor.slice(5,7),16);
    return (
      <div className="flex items-start justify-between p-4 rounded-xl transition-all"
        style={{ background: on ? `rgba(${r},${g},${b},0.06)` : '#0a0e17', border: `1px solid ${on ? `rgba(${r},${g},${b},0.2)` : '#1e293b'}` }}>
        <div>
          <p className="text-sm font-semibold" style={{ color: on ? accentColor : '#94a3b8' }}>{label}</p>
          <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>{description}</p>
        </div>
        <button onClick={() => setSettings(s => ({ ...s, [field]: !s[field] }))} className="shrink-0 mt-0.5 ml-4">
          {on
            ? <ToggleRight size={26} style={{ color: accentColor }} />
            : <ToggleLeft  size={26} style={{ color: '#334155' }} />}
        </button>
      </div>
    );
  };

  if (loading) return <div className="h-32 flex items-center justify-center text-xs" style={{ color: '#475569' }}>Loading settings...</div>;

  return (
    <div className="flex flex-col gap-4">
      {/* Webhook URL */}
      <div>
        <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: '#475569' }}>n8n / SOAR Webhook URL</label>
        <div className="flex gap-2">
          <input type="text"
            value={settings?.n8n_webhook_url || ''}
            onChange={(e) => setSettings(s => ({ ...s, n8n_webhook_url: e.target.value }))}
            placeholder="http://localhost:5678/webhook/soc-callback"
            className="soc-input flex-1 font-mono text-xs" />
          <button onClick={() => window.open(settings?.n8n_webhook_url, '_blank')} disabled={!settings?.n8n_webhook_url} className="btn-ghost whitespace-nowrap text-xs">
            Test
          </button>
        </div>
        <p className="text-xs mt-1.5" style={{ color: '#475569' }}>SOAR automation callbacks will be POSTed to this URL when thresholds are met.</p>
      </div>

      {/* Toggles */}
      <div className="flex flex-col gap-2.5">
        <Toggle
          field="auto_response_enabled"
          label="🔥 Auto-Response Mode"
          description="Allow AI to automatically execute responses without human approval (≥0.95 confidence)."
          accentColor="#ff9900"
        />
        <Toggle
          field="telegram_hitl_enabled"
          label="📱 Telegram HITL (Human-in-the-Loop)"
          description="Send Telegram approval requests for critical actions before execution."
          accentColor="#06b6d4"
        />
        <Toggle
          field="ai_analysis_enabled"
          label="🤖 AI Analysis (Ollama Zero-Trust)"
          description="Enable AI-powered threat analysis using local Ollama LLM for each incoming alert."
          accentColor="#10b981"
        />
      </div>

      {/* Save */}
      <div className="flex justify-end pt-2">
        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
          {saving ? <Loader size={13} className="animate-spin" /> : saved ? <Check size={13} /> : <Save size={13} />}
          {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================
export default function AuditLogsPage() {
  const [logs,          setLogs]         = useState([]);
  const [loading,       setLoading]      = useState(true);
  const [filterSource,  setFilterSource] = useState('');
  const [filterAction,  setFilterAction] = useState('');
  const [activeTab,     setActiveTab]    = useState('logs');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAuditLogs();
      setLogs(res.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = logs.filter(log => {
    const matchSource = !filterSource || log.source === filterSource;
    const matchAction = !filterAction || log.action_taken === filterAction;
    return matchSource && matchAction;
  });

  const uniqueActions = [...new Set(logs.map(l => l.action_taken))];

  return (
    <div className="flex flex-col gap-5 p-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2.5" style={{ color: '#f8fafc' }}>
            <span style={{ background:'linear-gradient(135deg,rgba(59,130,246,0.2),rgba(59,130,246,0.05))', border:'1px solid rgba(59,130,246,0.25)', borderRadius:'10px', padding:'6px 8px', display:'inline-flex' }}>
              <Activity size={18} style={{ color: '#3b82f6' }} />
            </span>
            Audit Logs &amp; System Settings
          </h1>
          <p className="text-xs mt-1" style={{ color: '#64748b' }}>Complete audit trail • SOAR configuration</p>
        </div>
        {activeTab === 'logs' && (
          <button onClick={load} className="btn-ghost flex items-center gap-2 text-xs">
            <RefreshCw size={12} />Refresh
          </button>
        )}
      </div>

      {/* Sub-tabs */}
      <div style={{ borderBottom: '1px solid #1e293b' }}>
        <div className="flex">
          {[
            { id: 'logs',     label: '📋 Audit Logs' },
            { id: 'settings', label: '⚙ System Settings' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className="px-5 py-3 text-xs font-semibold transition-colors border-b-2"
              style={activeTab === t.id
                ? { color: '#06b6d4', borderColor: '#06b6d4' }
                : { color: '#64748b', borderColor: 'transparent' }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Logs Tab */}
      {activeTab === 'logs' && (
        <>
          {/* Filters */}
          <div className="flex gap-3 flex-wrap">
            <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="soc-input" style={{ width: '160px' }}>
              <option value="">All Sources</option>
              {['Rule-based','AI','Human-HITL','Manual','SOAR'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)} className="soc-input" style={{ width: '160px' }}>
              <option value="">All Actions</option>
              {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <span className="self-center text-xs px-3 py-1.5 rounded-lg" style={{ background: '#0a0e17', border: '1px solid #1e293b', color: '#64748b' }}>
              {filtered.length} entries
            </span>
          </div>

          {/* Logs Table */}
          <div className="soc-card overflow-hidden">
            {loading ? <PageLoader /> : (
              <div className="overflow-x-auto">
                <table className="soc-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Source</th>
                      <th>Actor</th>
                      <th>Event Type</th>
                      <th>Action</th>
                      <th>Confidence</th>
                      <th>Payload</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-16" style={{ color: '#475569' }}>No audit logs found.</td></tr>
                    ) : filtered.map((log) => {
                      const payload = (() => { try { return JSON.parse(log.payload_summary || '{}'); } catch { return {}; } })();
                      return (
                        <tr key={log.id}>
                          <td>
                            <span className="font-mono text-xs" style={{ color: '#64748b' }}>
                              {new Date(log.created_at).toLocaleString('en-GB')}
                            </span>
                          </td>
                          <td><SourceBadge source={log.source} /></td>
                          <td>
                            <span className="font-mono text-xs" style={{ color: '#94a3b8' }}>{log.actor}</span>
                          </td>
                          <td>
                            <span className="text-xs" style={{ color: '#64748b' }}>{log.event_type}</span>
                          </td>
                          <td><ActionBadge action={log.action_taken} /></td>
                          <td><ConfidenceBar value={log.confidence} /></td>
                          <td>
                            <div className="flex gap-1.5 text-xs font-mono" style={{ color: '#475569' }}>
                              {payload.target_ip  && <span>ip:{payload.target_ip}</span>}
                              {payload.alert_id   && <span>alert:{String(payload.alert_id).substring(0,6)}</span>}
                              {payload.result && (
                                <span style={{ color: payload.result === 'success' ? '#10b981' : '#ff3366', fontWeight: 600 }}>
                                  [{payload.result}]
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="soc-card p-6">
          <div className="flex items-center gap-2.5 mb-6" style={{ paddingBottom:'16px', borderBottom:'1px solid #1e293b' }}>
            <Settings size={16} style={{ color: '#06b6d4' }} />
            <h3 className="text-sm font-semibold" style={{ color: '#f8fafc' }}>SOAR / n8n Integration Configuration</h3>
          </div>
          <SettingsPanel />
        </div>
      )}
    </div>
  );
}
