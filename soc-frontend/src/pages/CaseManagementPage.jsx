// =============================================================================
// src/pages/CaseManagementPage.jsx
// Tab 2: Case Management — TheHive-like investigation interface
// =============================================================================

import {
  BookOpen,
  ChevronRight,
  MessageSquare,
  Search,
  UserCheck,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import JsonViewer from '../components/common/JsonViewer';
import { PageLoader } from '../components/common/LoadingSpinner';
import SeverityBadge from '../components/common/SeverityBadge';
import StatusBadge from '../components/common/StatusBadge';
import { assignCase, addCaseNote, getCaseById, getCases, updateCaseStatus } from '../services/api';
import { useApp } from '../context/AppContext';

// ─── Timeline Event ────────────────────────────────────────────────────────────
const TimelineEvent = ({ event }) => {
  const sourceColor = {
    'Rule-based': 'bg-blue-500',
    AI:           'bg-cyan-500',
    'Human-HITL': 'bg-orange-500',
    Manual:       'bg-purple-500',
    SOAR:         'bg-green-500',
  }[event.source] || 'bg-gray-500';

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${sourceColor}`} />
        <div className="w-0.5 bg-gray-800 flex-1 mt-1" />
      </div>
      <div className="pb-4 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs px-2 py-0.5 rounded font-semibold`}
            style={{ background: 'rgba(0,212,255,0.1)', color: '#00d4ff' }}>
            {event.source}
          </span>
          <span className="text-xs text-gray-600">
            {new Date(event.timestamp).toLocaleString('en-GB')}
          </span>
        </div>
        <p className="text-sm text-gray-300">{event.description}</p>
        {event.detail && (
          <p className="text-xs text-gray-500 mt-1 font-mono">{event.detail}</p>
        )}
      </div>
    </div>
  );
};

// ─── Case Detail Drawer ────────────────────────────────────────────────────────
function CaseDetailDrawer({ caseItem, onClose, onUpdated }) {
  const { addToast } = useApp();
  const [activePanel, setActivePanel]   = useState('timeline'); // timeline | payload | notes
  const [newStatus,   setNewStatus]     = useState(caseItem?.status || '');
  const [assignTo,    setAssignTo]      = useState(caseItem?.assigned_to || '');
  const [note,        setNote]          = useState('');
  const [saving,      setSaving]        = useState(false);

  // Build timeline events from case data
  const timeline = caseItem ? [
    {
      source:      'Rule-based',
      timestamp:   caseItem.created_at,
      description: 'Alert detected and Case automatically created by Detection Rule Engine.',
      detail:      `Case #${caseItem.id?.substring(0, 8)}`,
    },
    ...(caseItem.soar_status !== 'pending' ? [{
      source:    'AI',
      timestamp: caseItem.updated_at,
      description: caseItem.ai_reason || 'AI Zero-Trust analysis completed.',
      detail:    `Confidence: ${Math.round((caseItem.confidence || 0) * 100)}%`,
    }] : []),
    ...(caseItem.human_approved_by ? [{
      source:      'Human-HITL',
      timestamp:   caseItem.updated_at,
      description: `Approved via Telegram HITL by: ${caseItem.human_approved_by}`,
    }] : []),
    ...(caseItem.status === 'Closed' || caseItem.status === 'Rejected' ? [{
      source:      'Manual',
      timestamp:   caseItem.updated_at,
      description: `Case ${caseItem.status.toLowerCase()} by analyst.`,
    }] : []),
  ] : [];

  const handleSaveStatus = async () => {
    setSaving(true);
    try {
      await updateCaseStatus(caseItem.id, newStatus);
      addToast({ severity: 'success', title: 'Case status updated', message: `→ ${newStatus}` });
      onUpdated?.();
    } catch (e) {
      addToast({ severity: 'high', title: 'Update failed', message: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleAssign = async () => {
    if (!assignTo.trim()) return;
    setSaving(true);
    try {
      await assignCase(caseItem.id, assignTo);
      addToast({ severity: 'success', title: 'Case assigned', message: `→ ${assignTo}` });
      onUpdated?.();
    } catch (e) {
      addToast({ severity: 'high', title: 'Assign failed', message: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleAddNote = async () => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      await addCaseNote(caseItem.id, note);
      addToast({ severity: 'success', title: 'Note added' });
      setNote('');
    } catch (e) {
      addToast({ severity: 'high', title: 'Failed to add note', message: e.message });
    } finally {
      setSaving(false);
    }
  };

  const tags = (() => {
    try { return JSON.parse(caseItem?.tags || '[]'); }
    catch { return []; }
  })();

  if (!caseItem) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex"
      style={{ backgroundColor: 'rgba(5,8,14,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Drawer panel */}
      <div
        className="ml-auto h-full flex flex-col animate-slide-in"
        style={{
          width: '700px',
          maxWidth: '95vw',
          background: 'linear-gradient(160deg,#0d1520 0%,#0a0e17 100%)',
          borderLeft: '1px solid rgba(6,182,212,0.18)',
          boxShadow: '-16px 0 60px rgba(0,0,0,0.6)',
        }}
      >
        {/* Drawer header */}
        <div className="flex items-start justify-between px-6 py-5 shrink-0" style={{ borderBottom: '1px solid #1e293b' }}>
          <div>
            <p className="font-mono text-xs mb-1.5" style={{ color: '#06b6d4', letterSpacing: '0.1em' }}>CASE #{caseItem.id?.substring(0, 8).toUpperCase()}</p>
            <h2 className="text-base font-bold leading-snug" style={{ color: '#f8fafc' }}>{caseItem.title}</h2>
            <div className="flex items-center gap-2 mt-2.5">
              <SeverityBadge severity={caseItem.severity_num} />
              <StatusBadge status={caseItem.status} type="case" />
              <StatusBadge status={caseItem.soar_status} type="soar" />
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg transition-colors" style={{ color: '#64748b' }}
            onMouseEnter={e => { e.currentTarget.style.background='#1e293b'; e.currentTarget.style.color='#f8fafc'; }}
            onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#64748b'; }}>
            <X size={16} />
          </button>
        </div>

        {/* Drawer tabs */}
        <div className="flex px-6 shrink-0" style={{ borderBottom: '1px solid #1e293b' }}>
          {[
            { id: 'timeline', label: '📋 Timeline' },
            { id: 'payload',  label: '{ } Raw Payload' },
            { id: 'actions',  label: '⚡ Actions' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActivePanel(t.id)}
              className="px-4 py-3 text-xs font-semibold transition-colors border-b-2"
              style={activePanel === t.id
                ? { color: '#06b6d4', borderColor: '#06b6d4' }
                : { color: '#64748b', borderColor: 'transparent' }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Drawer content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* Timeline panel */}
          {activePanel === 'timeline' && (
            <div>
              <p className="text-xs text-gray-500 mb-4 uppercase tracking-widest">Investigation Timeline</p>
              {timeline.length > 0 ? (
                timeline.map((e, i) => <TimelineEvent key={i} event={e} />)
              ) : (
                <p className="text-sm text-gray-600">No timeline events yet.</p>
              )}
              {/* Tags */}
              {tags.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-gray-500 mb-2">MITRE / Tags</p>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag, i) => (
                      <span key={i} className="px-2 py-0.5 text-xs rounded bg-blue-900/40 text-blue-300 border border-blue-800/50">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {/* AI Reason */}
              {caseItem.ai_reason && (
                <div className="mt-4 p-3 rounded-lg bg-cyan-900/20 border border-cyan-800/30">
                  <p className="text-xs font-semibold text-cyan-400 mb-1">🤖 AI Analysis</p>
                  <p className="text-sm text-gray-300">{caseItem.ai_reason}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Confidence: {Math.round((caseItem.confidence || 0) * 100)}%
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Raw Payload panel */}
          {activePanel === 'payload' && (
            <div>
              <p className="text-xs text-gray-500 mb-3 uppercase tracking-widest">Raw Event Log / Payload</p>
              <JsonViewer data={caseItem.alert?.raw_payload || caseItem.description || '{}'} maxHeight="450px" />
              <p className="text-xs text-gray-600 mt-2">Alert ID: {caseItem.alert_id || '—'}</p>
            </div>
          )}

          {/* Actions panel */}
          {activePanel === 'actions' && (
            <div className="flex flex-col gap-5">
              {/* Change status */}
              <div className="p-4 rounded-lg bg-gray-900/50 border border-gray-800">
                <h4 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
                  <BookOpen size={14} className="text-cyan-400" />
                  Change Case Status
                </h4>
                <div className="flex gap-2">
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="soc-input flex-1"
                  >
                    <option value="New">New</option>
                    <option value="InProgress">In Progress</option>
                    <option value="Closed">Closed</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                  <button onClick={handleSaveStatus} disabled={saving} className="btn-primary whitespace-nowrap">
                    {saving ? 'Saving...' : 'Update'}
                  </button>
                </div>
              </div>

              {/* Assign analyst */}
              <div className="p-4 rounded-lg bg-gray-900/50 border border-gray-800">
                <h4 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
                  <UserCheck size={14} className="text-purple-400" />
                  Assign Analyst
                </h4>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={assignTo}
                    onChange={(e) => setAssignTo(e.target.value)}
                    placeholder="analyst@soc.local"
                    className="soc-input flex-1"
                  />
                  <button onClick={handleAssign} disabled={saving} className="btn-primary whitespace-nowrap">
                    Assign
                  </button>
                </div>
                {caseItem.assigned_to && (
                  <p className="text-xs text-gray-500 mt-1.5">Current: {caseItem.assigned_to}</p>
                )}
              </div>

              {/* Add note */}
              <div className="p-4 rounded-lg bg-gray-900/50 border border-gray-800">
                <h4 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
                  <MessageSquare size={14} className="text-green-400" />
                  Add Investigation Note
                </h4>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  placeholder="Describe your findings, next steps, or decisions..."
                  className="soc-input resize-none"
                />
                <div className="flex justify-end mt-2">
                  <button onClick={handleAddNote} disabled={saving || !note.trim()} className="btn-primary">
                    {saving ? 'Saving...' : 'Add Note'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================
export default function CaseManagementPage() {
  const [cases,          setCases]       = useState([]);
  const [loading,        setLoading]     = useState(true);
  const [search,         setSearch]      = useState('');
  const [filterStatus,   setFilterStatus] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [selectedCase,   setSelectedCase] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCases();
      setCases(res.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = cases.filter((c) => {
    const matchSearch   = !search || c.title.toLowerCase().includes(search.toLowerCase());
    const matchStatus   = !filterStatus || c.status === filterStatus;
    const matchSeverity = !filterSeverity || String(c.severity_num) === filterSeverity;
    return matchSearch && matchStatus && matchSeverity;
  });

  const severityLabel = { 1: 'Critical', 2: 'High', 3: 'Medium', 4: 'Low' };

  return (
    <div className="flex flex-col gap-6 p-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <BookOpen size={20} className="text-purple-400" />
            Case Management
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">{filtered.length} cases • TheHive-compatible investigation workflow</p>
        </div>
      </div>

      {/* Capsule Toolbar */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl" style={{ background: '#0a0e17', border: '1px solid #1e293b' }}>
        <div className="relative flex-1 min-w-48">
          <Search size={13} style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', color:'#475569' }} />
          <input
            type="text"
            placeholder="Search cases by title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ background:'transparent', border:'none', outline:'none', padding:'8px 12px 8px 34px',
              color:'#f8fafc', fontSize:'13px', width:'100%', fontFamily:"'Plus Jakarta Sans',sans-serif" }}
          />
        </div>
        <div style={{ width:'1px', height:'24px', background:'#1e293b', flexShrink:0 }} />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          style={{ background:'transparent', border:'none', outline:'none', color:'#94a3b8', fontSize:'13px',
            padding:'7px 12px', cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
          <option value="" style={{background:'#0a0e17'}}>All Status</option>
          <option value="New" style={{background:'#0a0e17'}}>New</option>
          <option value="InProgress" style={{background:'#0a0e17'}}>In Progress</option>
          <option value="Closed" style={{background:'#0a0e17'}}>Closed</option>
          <option value="Rejected" style={{background:'#0a0e17'}}>Rejected</option>
        </select>
        <div style={{ width:'1px', height:'24px', background:'#1e293b', flexShrink:0 }} />
        <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)}
          style={{ background:'transparent', border:'none', outline:'none', color:'#94a3b8', fontSize:'13px',
            padding:'7px 12px', cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
          <option value="" style={{background:'#0a0e17'}}>All Severity</option>
          <option value="1" style={{background:'#0a0e17'}}>⬤ Critical</option>
          <option value="2" style={{background:'#0a0e17'}}>⬤ High</option>
          <option value="3" style={{background:'#0a0e17'}}>⬤ Medium</option>
          <option value="4" style={{background:'#0a0e17'}}>⬤ Low</option>
        </select>
        <span className="ml-auto text-xs px-3 py-1 rounded-lg" style={{ background:'#1e293b', color:'#64748b' }}>
          {filtered.length} cases
        </span>
      </div>

      {/* Cases Table */}
      <div className="soc-card overflow-hidden">
        {loading ? <PageLoader /> : (
          <div className="overflow-x-auto">
            <table className="soc-table">
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Title</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>SOAR</th>
                  <th>Assigned To</th>
                  <th>Tags</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-gray-600">No cases found.</td></tr>
                ) : filtered.map((c) => {
                  const tags = (() => { try { return JSON.parse(c.tags || '[]'); } catch { return []; } })();
                  return (
                    <tr key={c.id} className="cursor-pointer" style={{ transition:'background 0.15s ease' }}
                      onClick={() => setSelectedCase(c)}
                      onMouseEnter={e => e.currentTarget.querySelectorAll('td').forEach(td => td.style.background='rgba(15,23,42,0.8)')}
                      onMouseLeave={e => e.currentTarget.querySelectorAll('td').forEach(td => td.style.background='')}>
                      <td>
                        <span className="font-mono text-xs px-2 py-1 rounded-md" style={{ background:'rgba(6,182,212,0.08)', color:'#06b6d4', border:'1px solid rgba(6,182,212,0.15)', letterSpacing:'0.05em' }}>
                          #{c.id?.substring(0, 8).toUpperCase()}
                        </span>
                      </td>
                      <td className="max-w-xs">
                        <p className="text-sm font-semibold truncate" style={{ color:'#f8fafc' }}>{c.title}</p>
                      </td>
                      <td><SeverityBadge severity={c.severity_num} /></td>
                      <td><StatusBadge status={c.status} type="case" /></td>
                      <td><StatusBadge status={c.soar_status} type="soar" /></td>
                      <td>
                        <span className="text-xs" style={{ color: c.assigned_to ? '#94a3b8' : '#475569', fontStyle: c.assigned_to ? 'normal' : 'italic' }}>
                          {c.assigned_to || 'Unassigned'}
                        </span>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {tags.slice(0, 3).map((tag, i) => (
                            <span key={i} className="pill-badge">{tag}</span>
                          ))}
                          {tags.length > 3 && <span style={{ color:'#475569', fontSize:'11px' }}>+{tags.length - 3}</span>}
                        </div>
                      </td>
                      <td className="font-mono whitespace-nowrap" style={{ color:'#64748b', fontSize:'11.5px' }}>
                        {new Date(c.created_at).toLocaleDateString('en-GB')}
                      </td>
                      <td>
                        <ChevronRight size={14} style={{ color:'#334155' }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Case Detail Drawer */}
      {selectedCase && (
        <CaseDetailDrawer
          caseItem={selectedCase}
          onClose={() => setSelectedCase(null)}
          onUpdated={() => { load(); setSelectedCase(null); }}
        />
      )}
    </div>
  );
}
