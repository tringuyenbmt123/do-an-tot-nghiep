// =============================================================================
// src/pages/ThreatIntelPage.jsx — v2 Cyberpunk Enterprise Redesign
// =============================================================================

import {
  AlertCircle,
  CheckCircle,
  Database,
  Edit3,
  ExternalLink,
  Loader,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import Modal from '../components/common/Modal';
import { PageLoader } from '../components/common/LoadingSpinner';
import { useApp } from '../context/AppContext';
import {
  analyzeIOC,
  createIndicator,
  createRule,
  deleteIndicator,
  deleteRule,
  getIndicators,
  getRules,
  toggleRule,
  updateIndicator,
  updateRule,
} from '../services/api';

// ─── Gradient Risk Score Bar ───────────────────────────────────────────────────
const RiskBar = ({ score }) => {
  const pct = Math.min(100, Math.max(0, score));
  // Color: 0-35 green → 36-65 yellow → 66-85 orange → 86-100 red
  const getColor = (s) => {
    if (s >= 86) return '#ff3366';
    if (s >= 66) return '#ff9900';
    if (s >= 36) return '#eab308';
    return '#10b981';
  };
  const color = getColor(pct);
  return (
    <div className="flex items-center gap-2.5">
      <div className="risk-bar-track">
        <div className="risk-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-bold font-mono" style={{ color, minWidth: '24px' }}>{pct}</span>
    </div>
  );
};

// ─── IOC Type Badge ────────────────────────────────────────────────────────────
const IOCTypeBadge = ({ type }) => {
  const map = {
    'ip-src':  { label: 'IP-SRC',  color: '#ff3366', bg: 'rgba(255,51,102,0.08)',  border: 'rgba(255,51,102,0.2)' },
    'ip-dst':  { label: 'IP-DST',  color: '#ff9900', bg: 'rgba(255,153,0,0.08)',   border: 'rgba(255,153,0,0.2)' },
    domain:    { label: 'DOMAIN',  color: '#a855f7', bg: 'rgba(168,85,247,0.08)',  border: 'rgba(168,85,247,0.2)' },
    sha256:    { label: 'SHA256',  color: '#3b82f6', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.2)' },
    md5:       { label: 'MD5',     color: '#06b6d4', bg: 'rgba(6,182,212,0.08)',   border: 'rgba(6,182,212,0.2)' },
    url:       { label: 'URL',     color: '#eab308', bg: 'rgba(234,179,8,0.08)',   border: 'rgba(234,179,8,0.2)' },
    email:     { label: 'EMAIL',   color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.2)' },
  };
  const cfg = map[type] || { label: type?.toUpperCase(), color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.2)' };
  return (
    <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-md"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`, letterSpacing: '0.06em' }}>
      {cfg.label}
    </span>
  );
};

// ─── Cortex Result Modal ───────────────────────────────────────────────────────
function CortexResultModal({ result, onClose }) {
  if (!result) return null;
  const isMalicious = result.verdict === 'malicious';
  return (
    <Modal isOpen={!!result} onClose={onClose} title="🔬 Cortex Analyzer — IOC Enrichment Result" size="lg">
      {/* Verdict banner */}
      <div className="flex items-center gap-4 p-5 rounded-2xl mb-5"
        style={{
          background: isMalicious ? 'rgba(255,51,102,0.08)' : 'rgba(16,185,129,0.08)',
          border: `1px solid ${isMalicious ? 'rgba(255,51,102,0.25)' : 'rgba(16,185,129,0.25)'}`,
        }}>
        {isMalicious
          ? <AlertCircle size={30} style={{ color: '#ff3366', flexShrink: 0 }} />
          : <CheckCircle size={30} style={{ color: '#10b981', flexShrink: 0 }} />}
        <div className="flex-1">
          <p className="text-lg font-bold" style={{ color: isMalicious ? '#ff3366' : '#10b981' }}>
            {isMalicious ? '⚠ MALICIOUS' : '✓ CLEAN / SAFE'}
          </p>
          <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>
            Analyzer: {result.analyzer} • {new Date(result.last_analysis).toLocaleString()}
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold" style={{ color: '#f8fafc', fontFamily: "'JetBrains Mono', monospace" }}>
            {result.risk_score}<span className="text-base" style={{ color: '#475569' }}>/100</span>
          </p>
          <p className="text-xs" style={{ color: '#64748b' }}>Risk Score</p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Detections', value: `${result.detections} / ${result.total_engines}`, color: isMalicious ? '#ff3366' : '#10b981' },
          { label: 'Community Score', value: result.community_score, color: result.community_score < 0 ? '#ff3366' : '#10b981' },
          { label: 'First Seen', value: result.first_seen ? new Date(result.first_seen).toLocaleDateString() : '—', color: '#94a3b8' },
        ].map(item => (
          <div key={item.label} className="p-3 rounded-xl" style={{ background: '#0a0e17', border: '1px solid #1e293b' }}>
            <p className="text-xs mb-1.5" style={{ color: '#64748b' }}>{item.label}</p>
            <p className="text-base font-bold font-mono" style={{ color: item.color }}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Tags */}
      {result.tags?.length > 0 && (
        <div className="mb-4">
          <p className="text-[10.5px] uppercase tracking-widest mb-2" style={{ color: '#475569' }}>Threat Tags</p>
          <div className="flex flex-wrap gap-2">
            {result.tags.map((tag, i) => (
              <span key={i} className="px-2.5 py-1 rounded-full text-xs font-semibold"
                style={{ background: 'rgba(255,51,102,0.1)', color: '#ff3366', border: '1px solid rgba(255,51,102,0.25)' }}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Details */}
      {result.details && (
        <div className="p-4 rounded-xl" style={{ background: '#0a0e17', border: '1px solid #1e293b' }}>
          <p className="text-[10.5px] uppercase tracking-widest mb-3" style={{ color: '#475569' }}>Intelligence Details</p>
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            {Object.entries(result.details).map(([k, v]) => (
              <div key={k}>
                <span className="capitalize" style={{ color: '#64748b' }}>{k.replace(/_/g, ' ')}: </span>
                <span style={{ color: '#94a3b8' }}>{Array.isArray(v) ? v.join(', ') : v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex justify-end mt-5">
        <button onClick={onClose} className="btn-ghost">Close</button>
      </div>
    </Modal>
  );
}

// ─── Add IOC Modal ─────────────────────────────────────────────────────────────
function AddIOCModal({ isOpen, onClose, onAdded, initialData = null }) {
  const { addToast } = useApp();
  const emptyForm = { type: 'ip-src', value: '', category: 'malware', source: 'analyst', mitre_tactic: '', risk_score: 50 };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialData) {
      setForm({
        type: initialData.type || 'ip-src',
        value: initialData.value || '',
        category: initialData.category || 'malware',
        source: initialData.source || 'analyst',
        mitre_tactic: initialData.mitre_tactic || '',
        risk_score: initialData.risk_score || 50,
      });
    } else {
      setForm(emptyForm);
    }
  }, [initialData, isOpen]);

  const handle = async () => {
    if (!form.value.trim()) return;
    setSaving(true);
    try {
      if (initialData?.id) {
        await updateIndicator(initialData.id, form);
        addToast({ severity: 'success', title: 'IOC updated successfully' });
      } else {
        await createIndicator(form);
        addToast({ severity: 'success', title: 'IOC added successfully' });
      }
      setForm(emptyForm);
      onAdded?.();
      onClose();
    } catch (e) {
      addToast({ severity: 'high', title: initialData?.id ? 'Failed to update IOC' : 'Failed to add IOC', message: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initialData?.id ? '✏️ Edit IOC Indicator' : '➕ Add New IOC Indicator'} size="md"
      footer={<><button onClick={onClose} className="btn-ghost">Cancel</button><button onClick={handle} disabled={saving} className="btn-primary">{saving ? 'Saving...' : initialData?.id ? 'Update IOC' : 'Add IOC'}</button></>}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: '#64748b' }}>IOC Type</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="soc-input">
              {['ip-src','ip-dst','domain','sha256','md5','url','email'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1.5" style={{ color: '#64748b' }}>Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="soc-input">
              {['malware','phishing','c2_server','ransomware'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs mb-1.5" style={{ color: '#64748b' }}>Value *</label>
          <input type="text" placeholder="192.168.1.1 / malware.com / sha256hash..."
            value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="soc-input" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: '#64748b' }}>Source</label>
            <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="soc-input">
              {['analyst','osint','misp_feed','internal'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1.5" style={{ color: '#64748b' }}>Risk Score (0-100)</label>
            <input type="number" min={0} max={100} value={form.risk_score}
              onChange={(e) => setForm({ ...form, risk_score: Number(e.target.value) })} className="soc-input" />
          </div>
        </div>
        <div>
          <label className="block text-xs mb-1.5" style={{ color: '#64748b' }}>MITRE Tactic</label>
          <input type="text" placeholder="e.g. Execution, Phishing..." value={form.mitre_tactic}
            onChange={(e) => setForm({ ...form, mitre_tactic: e.target.value })} className="soc-input" />
        </div>
      </div>
    </Modal>
  );
}

function RuleFormModal({ isOpen, onClose, initialData, onSaved }) {
  const { addToast } = useApp();
  const [form, setForm] = useState({
    id: initialData?.id || '',
    name: initialData?.name || '',
    description: initialData?.description || '',
    severity: initialData?.severity || 'medium',
    event_type: initialData?.event_type || 'custom_event',
    mitre_tactic: initialData?.mitre_tactic || '',
    mitre_technique_id: initialData?.mitre_technique_id || '',
    is_active: initialData?.is_active ?? true,
    conditions: initialData?.conditions || JSON.stringify([
      { field: 'event_type', operator: 'equals', value: 'custom_event' }
    ], null, 2),
  });

  useEffect(() => {
    if (initialData) {
      setForm({
        id: initialData.id || '',
        name: initialData.name || '',
        description: initialData.description || '',
        severity: initialData.severity || 'medium',
        event_type: initialData.event_type || 'custom_event',
        mitre_tactic: initialData.mitre_tactic || '',
        mitre_technique_id: initialData.mitre_technique_id || '',
        is_active: initialData.is_active ?? true,
        conditions: initialData.conditions || JSON.stringify([
          { field: 'event_type', operator: 'equals', value: 'custom_event' }
        ], null, 2),
      });
    }
  }, [initialData]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      addToast({ severity: 'high', title: 'Rule name is required' });
      return;
    }

    try {
      const payload = {
        ...form,
        conditions: typeof form.conditions === 'string' ? form.conditions : JSON.stringify(form.conditions),
      };
      if (initialData?.id) {
        await updateRule(initialData.id, payload);
        addToast({ severity: 'success', title: 'Rule updated' });
      } else {
        await createRule(payload);
        addToast({ severity: 'success', title: 'Rule created' });
      }
      onSaved?.();
      onClose();
    } catch (e) {
      addToast({ severity: 'high', title: 'Failed to save rule', message: e.message });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initialData?.id ? '✏️ Edit Rule' : '➕ New Custom Rule'} size="lg"
      footer={<>
        <button onClick={onClose} className="btn-ghost">Cancel</button>
        <button onClick={handleSave} className="btn-primary">Save Rule</button>
      </>}
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-xs mb-1.5" style={{ color: '#64748b' }}>Rule name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="soc-input" />
        </div>
        <div>
          <label className="block text-xs mb-1.5" style={{ color: '#64748b' }}>Severity</label>
          <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} className="soc-input">
            {['low','medium','high','critical'].map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs mb-1.5" style={{ color: '#64748b' }}>Event type</label>
          <input value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value })} className="soc-input" />
        </div>
        <div>
          <label className="block text-xs mb-1.5" style={{ color: '#64748b' }}>MITRE tactic</label>
          <input value={form.mitre_tactic} onChange={(e) => setForm({ ...form, mitre_tactic: e.target.value })} className="soc-input" />
        </div>
        <div>
          <label className="block text-xs mb-1.5" style={{ color: '#64748b' }}>MITRE technique</label>
          <input value={form.mitre_technique_id} onChange={(e) => setForm({ ...form, mitre_technique_id: e.target.value })} className="soc-input" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs mb-1.5" style={{ color: '#64748b' }}>Description</label>
          <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="soc-input" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs mb-1.5" style={{ color: '#64748b' }}>Conditions JSON</label>
          <textarea rows={8} value={form.conditions} onChange={(e) => setForm({ ...form, conditions: e.target.value })} className="soc-input font-mono text-xs" />
        </div>
      </div>
    </Modal>
  );
}

function IndicatorsManager({ indicators, onRefresh, onEdit, onDelete }) {
  return (
    <div className="soc-card overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: '#1e293b' }}>
        <div className="flex items-center gap-2.5">
          <Database size={15} style={{ color: '#06b6d4' }} />
          <span className="text-sm font-semibold" style={{ color: '#f8fafc' }}>Blacklist / IOC Manager</span>
        </div>
        <button onClick={onRefresh} className="btn-ghost text-xs">Refresh</button>
      </div>
      <div className="overflow-x-auto">
        <table className="soc-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Value</th>
              <th>Risk</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {indicators.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10" style={{ color: '#475569' }}>No blacklist entries found.</td></tr>
            ) : indicators.map((item) => (
              <tr key={item.id}>
                <td><IOCTypeBadge type={item.type} /></td>
                <td className="font-mono text-xs" style={{ color: '#94a3b8' }}>{item.value}</td>
                <td><RiskBar score={item.risk_score} /></td>
                <td><span className={item.is_active ? 'status-dot-online' : 'status-dot-offline'} /> {item.is_active ? 'Active' : 'Inactive'}</td>
                <td>
                  <div className="flex gap-2">
                    <button onClick={() => onEdit(item)} className="btn-ghost text-xs flex items-center gap-1.5 ml-1"><Edit3 size={12} />Edit</button>
                    <button onClick={() => onDelete(item)} className="btn-ghost text-xs flex items-center gap-1.5 ml-1" style={{ color: '#f87171' }}><Trash2 size={12} />Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RulesManager({ rules, onRefresh, onEdit, onDelete, onToggle }) {
  return (
    <div className="soc-card overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: '#1e293b' }}>
        <div className="flex items-center gap-2.5">
          <ShieldCheck size={15} style={{ color: '#10b981' }} />
          <span className="text-sm font-semibold" style={{ color: '#f8fafc' }}>Custom Rule Manager</span>
        </div>
        <button onClick={onRefresh} className="btn-ghost text-xs">Refresh</button>
      </div>
      <div className="overflow-x-auto">
        <table className="soc-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Severity</th>
              <th>Event</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10" style={{ color: '#475569' }}>No custom rules found.</td></tr>
            ) : rules.map((rule) => (
              <tr key={rule.id}>
                <td>
                  <div className="font-semibold" style={{ color: '#f8fafc' }}>{rule.name}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: '#64748b' }}>{rule.description || 'No description'}</div>
                </td>
                <td className="text-xs font-semibold" style={{ color: rule.severity === 'critical' ? '#ff3366' : '#94a3b8' }}>{rule.severity}</td>
                <td className="font-mono text-xs" style={{ color: '#94a3b8' }}>{rule.event_type}</td>
                <td>
                  <button onClick={() => onToggle(rule)} className="text-xs px-2 py-1 rounded-md" style={{ background: rule.is_active ? 'rgba(16,185,129,0.1)' : 'rgba(148,163,184,0.1)', color: rule.is_active ? '#10b981' : '#94a3b8', border: '1px solid rgba(148,163,184,0.2)' }}>
                    {rule.is_active ? 'Enabled' : 'Disabled'}
                  </button>
                </td>
                <td>
                  <div className="flex gap-2">
                    <button onClick={() => onEdit(rule)} className="btn-ghost text-xs flex items-center gap-1.5 ml-1"><Edit3 size={12} />Edit</button>
                    <button onClick={() => onDelete(rule)} className="btn-ghost text-xs flex items-center gap-1.5 ml-1" style={{ color: '#f87171' }}><Trash2 size={12} />Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================
export default function ThreatIntelPage() {
  const { addToast }                      = useApp();
  const [indicators, setIndicators]       = useState([]);
  const [rules, setRules]                 = useState([]);
  const [loading, setLoading]             = useState(true);
  const [search, setSearch]               = useState('');
  const [filterType, setFilterType]       = useState('');
  const [lookupVal, setLookupVal]         = useState('');
  const [lookupType, setLookupType]       = useState('ip-src');
  const [analyzing, setAnalyzing]         = useState(false);
  const [cortexResult, setCortexResult]   = useState(null);
  const [showAddModal, setShowAddModal]   = useState(false);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRule, setEditingRule]     = useState(null);
  const [editingIndicator, setEditingIndicator] = useState(null);
  const [activePanel, setActivePanel] = useState('ioc');

  const loadRules = useCallback(async () => {
    try {
      const res = await getRules();
      setRules(res.data || []);
    } catch (e) {
      addToast({ severity: 'high', title: 'Failed to load rules', message: e.message });
    }
  }, [addToast]);

  const loadIndicators = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getIndicators();
      setIndicators(res.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    await Promise.all([loadIndicators(), loadRules()]);
  }, [loadIndicators, loadRules]);

  useEffect(() => { load(); }, [load]);

  const handleAnalyze = async () => {
    if (!lookupVal.trim()) return;
    setAnalyzing(true);
    try {
      const result = await analyzeIOC(lookupType, lookupVal);
      setCortexResult(result);
    } catch (e) {
      addToast({ severity: 'high', title: 'Analysis failed', message: e.message });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleToggleRule = async (rule) => {
    try {
      await toggleRule(rule.id, !rule.is_active);
      await loadRules();
      addToast({ severity: 'success', title: 'Rule status updated' });
    } catch (e) {
      addToast({ severity: 'high', title: 'Failed to update rule', message: e.message });
    }
  };

  const handleDeleteRule = async (rule) => {
    try {
      await deleteRule(rule.id);
      await loadRules();
      addToast({ severity: 'success', title: 'Rule deleted' });
    } catch (e) {
      addToast({ severity: 'high', title: 'Failed to delete rule', message: e.message });
    }
  };

  const handleDeleteIndicator = async (indicator) => {
    try {
      await deleteIndicator(indicator.id);
      await loadIndicators();
      addToast({ severity: 'success', title: 'Blacklist removed' });
    } catch (e) {
      addToast({ severity: 'high', title: 'Failed to delete blacklist', message: e.message });
    }
  };

  const handleSaveIndicator = async (payload) => {
    try {
      if (editingIndicator?.id) {
        await updateIndicator(editingIndicator.id, payload);
      } else {
        await createIndicator(payload);
      }
      setEditingIndicator(null);
      await loadIndicators();
      addToast({ severity: 'success', title: 'Blacklist saved' });
    } catch (e) {
      addToast({ severity: 'high', title: 'Failed to save blacklist', message: e.message });
    }
  };

  const filtered = indicators.filter((ind) => {
    const matchSearch = !search || ind.value.toLowerCase().includes(search.toLowerCase());
    const matchType   = !filterType || ind.type === filterType;
    return matchSearch && matchType;
  });

  return (
    <div className="flex flex-col gap-5 p-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2.5" style={{ color: '#f8fafc' }}>
            <span style={{ background:'linear-gradient(135deg,rgba(255,153,0,0.2),rgba(255,153,0,0.05))', border:'1px solid rgba(255,153,0,0.25)', borderRadius:'10px', padding:'6px 8px', display:'inline-flex' }}>
              <Shield size={18} style={{ color: '#ff9900' }} />
            </span>
            Threat Intelligence &amp; IOCs
          </h1>
          <p className="text-xs mt-1" style={{ color: '#64748b' }}>MISP-compatible IOC management • Cortex Analyzer integration</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn-primary flex items-center gap-2 ml-3">
          <Plus size={13} />
          Add IOC
        </button>
      </div>

      <div className="flex items-center gap-2.5 mb-3">
        <button onClick={() => setActivePanel('ioc')} className="px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center" style={{ background: activePanel === 'ioc' ? '#0ea5e9' : '#0a0e17', color: activePanel === 'ioc' ? '#03131a' : '#94a3b8', border: '1px solid #1e293b', marginRight: '4px' }}>IOC / Blacklist</button>
        <button onClick={() => setActivePanel('rules')} className="px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center" style={{ background: activePanel === 'rules' ? '#10b981' : '#0a0e17', color: activePanel === 'rules' ? '#04150d' : '#94a3b8', border: '1px solid #1e293b', marginLeft: '4px' }}>Custom Rules</button>
      </div>

      {activePanel === 'ioc' && (
        <>
          {/* ── Cortex Analyzer Search Widget ── */}
          <div className="soc-card p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <div style={{ background:'rgba(6,182,212,0.1)', border:'1px solid rgba(6,182,212,0.2)', borderRadius:'8px', padding:'6px' }}>
                <Zap size={14} style={{ color: '#06b6d4' }} />
              </div>
              <div>
                <h3 className="text-sm font-semibold" style={{ color: '#f8fafc' }}>Cortex Analyzer — Quick IOC Enrichment</h3>
                <p className="text-xs" style={{ color: '#64748b' }}>Powered by VirusTotal / MISP intelligence feeds</p>
              </div>
              <span className="ml-auto text-[10.5px] px-2.5 py-1 rounded-full font-semibold"
                style={{ background:'rgba(6,182,212,0.1)', color:'#06b6d4', border:'1px solid rgba(6,182,212,0.2)' }}>
                LIVE ANALYSIS
              </span>
            </div>

            <div className="flex gap-2 p-2 rounded-2xl" style={{ background: '#0a0e17', border: '1px solid #1e293b' }}>
              <select value={lookupType} onChange={(e) => setLookupType(e.target.value)}
                style={{ background:'#111827', border:'1px solid #1e293b', borderRadius:'10px', color:'#94a3b8',
                  fontSize:'12px', padding:'8px 10px', cursor:'pointer', flexShrink:0, minWidth:'80px', outline:'none' }}>
                {['ip-src','domain','sha256','url','md5'].map(t => <option key={t} value={t} style={{background:'#111827'}}>{t}</option>)}
              </select>

              <div className="relative flex-1">
                <Search size={14} style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', color:'#06b6d4' }} />
                <input
                  type="text"
                  placeholder="Enter IP address, domain name, file hash, or URL to analyze..."
                  value={lookupVal}
                  onChange={(e) => setLookupVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAnalyze(); }}
                  style={{ background:'transparent', border:'none', outline:'none', padding:'9px 12px 9px 34px',
                    color:'#f8fafc', fontSize:'13px', width:'100%', fontFamily:"'Plus Jakarta Sans',sans-serif" }}
                />
              </div>

              <button
                onClick={handleAnalyze}
                disabled={analyzing || !lookupVal.trim()}
                className="flex items-center gap-2 px-5 rounded-xl text-sm font-semibold whitespace-nowrap"
                style={{
                  background: (analyzing || !lookupVal.trim()) ? '#1e293b' : 'linear-gradient(135deg,#06b6d4,#3b82f6)',
                  color: (analyzing || !lookupVal.trim()) ? '#475569' : '#f8fafc',
                  border: 'none', cursor: (analyzing || !lookupVal.trim()) ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease', boxShadow: lookupVal.trim() ? '0 4px 16px rgba(6,182,212,0.3)' : 'none',
                }}
              >
                {analyzing ? <Loader size={13} className="animate-spin" /> : <ExternalLink size={13} />}
                {analyzing ? 'Analyzing...' : 'Enrich IOC'}
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="relative flex-1 min-w-52">
              <Search size={13} style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', color:'#475569' }} />
              <input type="text" placeholder="Search IOC value..." value={search}
                onChange={(e) => setSearch(e.target.value)} className="soc-input" style={{ paddingLeft: '34px' }} />
            </div>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="soc-input" style={{ width: '140px' }}>
              <option value="">All Types</option>
              {['ip-src','ip-dst','domain','sha256','md5','url','email'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="soc-card overflow-hidden">
            {loading ? <PageLoader /> : (
              <div className="overflow-x-auto">
                <table className="soc-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Value</th>
                      <th>Category</th>
                      <th>Source</th>
                      <th>MITRE Tactic</th>
                      <th>Risk Score</th>
                      <th>Active</th>
                      <th>Added</th>
                      <th>Analyze</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={9} className="text-center py-16" style={{ color: '#475569' }}>
                        No indicators found.
                      </td></tr>
                    ) : filtered.map((ind) => (
                      <tr key={ind.id}>
                        <td><IOCTypeBadge type={ind.type} /></td>
                        <td className="max-w-xs">
                          <span className="font-mono text-xs break-all" style={{ color: '#94a3b8' }}>{ind.value}</span>
                        </td>
                        <td><span className="text-xs" style={{ color: '#64748b' }}>{ind.category}</span></td>
                        <td><span className="text-xs font-mono" style={{ color: '#475569' }}>{ind.source}</span></td>
                        <td>
                          {ind.mitre_tactic && (
                            <span className="text-xs px-2 py-0.5 rounded-md"
                              style={{ background:'rgba(59,130,246,0.1)', color:'#60a5fa', border:'1px solid rgba(59,130,246,0.2)' }}>
                              {ind.mitre_tactic}
                            </span>
                          )}
                        </td>
                        <td><RiskBar score={ind.risk_score} /></td>
                        <td>
                          <div className="flex items-center gap-1.5">
                            <span className={ind.is_active ? 'status-dot-online' : 'status-dot-offline'} />
                            <span className="text-xs" style={{ color: ind.is_active ? '#10b981' : '#475569' }}>
                              {ind.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </td>
                        <td className="font-mono whitespace-nowrap" style={{ color: '#475569', fontSize: '11px' }}>
                          {new Date(ind.created_at).toLocaleDateString('en-GB')}
                        </td>
                        <td>
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setLookupVal(ind.value); setLookupType(ind.type); }}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                              style={{ background:'rgba(6,182,212,0.08)', color:'#06b6d4', border:'1px solid rgba(6,182,212,0.15)' }}
                              onMouseEnter={e => { e.currentTarget.style.background='rgba(6,182,212,0.2)'; }}
                              onMouseLeave={e => { e.currentTarget.style.background='rgba(6,182,212,0.08)'; }}
                            >
                              <Zap size={11} />
                              Enrich
                            </button>
                            <button
                              onClick={() => { setEditingIndicator(ind); setShowAddModal(true); }}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                              style={{ background:'rgba(59,130,246,0.08)', color:'#60a5fa', border:'1px solid rgba(59,130,246,0.15)' }}
                            >
                              <Edit3 size={11} />
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteIndicator(ind)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                              style={{ background:'rgba(239,68,68,0.08)', color:'#f87171', border:'1px solid rgba(239,68,68,0.15)' }}
                            >
                              <Trash2 size={11} />
                              Del
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {activePanel === 'rules' && (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end mt-1 mb-2">
            <button onClick={() => { setEditingRule(null); setShowRuleModal(true); }} className="btn-primary flex items-center gap-2 ml-2">
              <Plus size={13} /> Add Rule
            </button>
          </div>
          <RulesManager rules={rules} onRefresh={loadRules} onEdit={(rule) => { setEditingRule(rule); setShowRuleModal(true); }} onDelete={handleDeleteRule} onToggle={handleToggleRule} />
        </div>
      )}

      <CortexResultModal result={cortexResult} onClose={() => setCortexResult(null)} />
      <AddIOCModal isOpen={showAddModal} onClose={() => { setShowAddModal(false); setEditingIndicator(null); }} onAdded={load} initialData={editingIndicator} />
      <RuleFormModal isOpen={showRuleModal} onClose={() => setShowRuleModal(false)} initialData={editingRule} onSaved={loadRules} />
    </div>
  );
}
