// =============================================================================
// src/components/alerts/AlertDetailDrawer.jsx
// Detailed investigation drawer for Security Alerts with Escalate to Case & SOAR
// =============================================================================

import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Cpu,
  Flame,
  Globe,
  Radio,
  Send,
  Shield,
  ShieldAlert,
  Terminal,
  UserCheck,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { blockIP, dispatchAlertToSOAR, escalateAlertToCase, killProcess, updateAlertStatus } from '../../services/api';
import JsonViewer from '../common/JsonViewer';
import SeverityBadge from '../common/SeverityBadge';
import StatusBadge from '../common/StatusBadge';

export default function AlertDetailDrawer({ alert, onClose, onUpdated, onNavigateToCases }) {
  const { addToast } = useApp();
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'payload' | 'actions' | 'escalate'
  const [currentStatus, setCurrentStatus] = useState(alert?.status || 'new');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [soarDispatching, setSoarDispatching] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Escalate form state
  const [caseTitle, setCaseTitle] = useState('');
  const [caseDesc, setCaseDesc] = useState('');
  const [caseAssignee, setCaseAssignee] = useState('soc_analyst');

  // Active Response form state
  const [targetPid, setTargetPid] = useState('');
  const [targetIp, setTargetIp] = useState('');

  // Parse raw payload safely
  const parsedPayload = (() => {
    if (!alert?.raw_payload) return {};
    if (typeof alert.raw_payload === 'object') return alert.raw_payload;
    try {
      return JSON.parse(alert.raw_payload);
    } catch {
      return {};
    }
  })();

  // Initialize form states when alert changes
  useEffect(() => {
    if (!alert) return;
    setCurrentStatus(alert.status || 'new');
    setCaseTitle(`[Escalated] ${alert.title || alert.event_type || 'Security Incident'}`);
    setCaseDesc(
      `## Incident Context\n- **Alert ID**: \`${alert.id}\`\n- **Event Type**: \`${alert.event_type}\`\n- **Severity**: \`${alert.severity}\`\n- **Rule ID**: \`${alert.rule_id || 'N/A'}\`\n- **Agent**: \`${alert.agent?.hostname || alert.agent_id || 'Unknown'}\`\n- **MITRE Tactic**: \`${alert.mitre_tactic || 'N/A'}\`\n\n### Description\n${alert.description || 'No description provided'}`
    );

    // Auto-extract PID or IP from payload
    const pid = parsedPayload.pid || parsedPayload.process_id || parsedPayload.target_pid || '';
    const ip = parsedPayload.src_ip || parsedPayload.ip || parsedPayload.remote_ip || parsedPayload.destination_ip || '';
    setTargetPid(pid ? String(pid) : '');
    setTargetIp(ip || '');
  }, [alert]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!alert) return null;

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleStatusChange = async (newStatus) => {
    setUpdatingStatus(true);
    try {
      await updateAlertStatus(alert.id, newStatus);
      setCurrentStatus(newStatus);
      addToast({
        severity: 'success',
        title: 'Alert Status Updated',
        message: `Status changed to ${newStatus}`,
      });
      onUpdated?.();
    } catch (err) {
      addToast({
        severity: 'high',
        title: 'Update Failed',
        message: err.message,
      });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDispatchSOAR = async () => {
    setSoarDispatching(true);
    try {
      await dispatchAlertToSOAR(alert.id);
      addToast({
        severity: 'success',
        title: 'SOAR Playbook Triggered',
        message: `Alert #${alert.id.substring(0, 8)} dispatched to n8n workflow for AI analysis`,
      });
      onUpdated?.();
    } catch (err) {
      addToast({
        severity: 'high',
        title: 'SOAR Dispatch Failed',
        message: err.message,
      });
    } finally {
      setSoarDispatching(false);
    }
  };

  const handleEscalate = async (e) => {
    e?.preventDefault();
    if (!caseTitle.trim()) return;

    setEscalating(true);
    try {
      const res = await escalateAlertToCase(alert.id, {
        title: caseTitle,
        description: caseDesc,
        assigned_to: caseAssignee,
      });
      setCurrentStatus('escalated');
      addToast({
        severity: 'success',
        title: 'Alert Escalated to Case',
        message: `Created Case #${res?.case?.id?.substring(0, 8) || ''}`,
      });
      onUpdated?.();
      setActiveTab('overview');
    } catch (err) {
      addToast({
        severity: 'high',
        title: 'Escalation Failed',
        message: err.message,
      });
    } finally {
      setEscalating(false);
    }
  };

  const handleKillProcess = async () => {
    if (!targetPid || !alert.agent_id) return;
    setActionLoading(true);
    try {
      await killProcess(alert.agent_id, parseInt(targetPid, 10));
      addToast({
        severity: 'success',
        title: 'Kill Process Command Sent',
        message: `Command dispatched to Agent ${alert.agent?.hostname || alert.agent_id} (PID: ${targetPid})`,
      });
    } catch (err) {
      addToast({
        severity: 'high',
        title: 'Command Failed',
        message: err.message,
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleBlockIP = async () => {
    if (!targetIp || !alert.agent_id) return;
    setActionLoading(true);
    try {
      await blockIP(alert.agent_id, targetIp);
      addToast({
        severity: 'success',
        title: 'Block IP Command Sent',
        message: `Block rule for IP ${targetIp} dispatched to agent`,
      });
    } catch (err) {
      addToast({
        severity: 'high',
        title: 'Command Failed',
        message: err.message,
      });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end"
      style={{ backgroundColor: 'rgba(5,8,14,0.78)', backdropFilter: 'blur(10px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Drawer Container */}
      <div
        className="h-full flex flex-col animate-slide-in shadow-2xl relative"
        style={{
          width: '740px',
          maxWidth: '96vw',
          background: 'linear-gradient(170deg,#0d1520 0%,#090d16 100%)',
          borderLeft: '1px solid rgba(6,182,212,0.22)',
          boxShadow: '-20px 0 70px rgba(0,0,0,0.7)',
        }}
      >
        {/* Top Header */}
        <div className="p-6 shrink-0" style={{ borderBottom: '1px solid #1e293b' }}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(6,182,212,0.1)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.2)' }}>
                  ALERT #{alert.id?.substring(0, 8).toUpperCase()}
                </span>
                <SeverityBadge severity={alert.severity} />
                <StatusBadge status={currentStatus} type="alert" />
                {alert.rule_id && (
                  <span className="font-mono text-xs px-2 py-0.5 rounded text-gray-400 bg-slate-800/80 border border-slate-700">
                    Rule: {alert.rule_id}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold text-slate-100 leading-snug break-words">
                {alert.title || alert.event_type || 'Security Alert'}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors shrink-0"
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>

          {/* Quick Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-slate-800/80">
            {/* Escalate button */}
            <button
              onClick={() => setActiveTab(activeTab === 'escalate' ? 'overview' : 'escalate')}
              className="btn-primary flex items-center gap-1.5 text-xs py-1.5 px-3"
              style={{
                background: activeTab === 'escalate' ? 'linear-gradient(135deg, #a855f7, #6366f1)' : undefined,
              }}
            >
              <ShieldAlert size={14} />
              {currentStatus === 'escalated' ? 'Escalated to Case' : 'Escalate to Case'}
            </button>

            {/* Trigger SOAR button */}
            <button
              onClick={handleDispatchSOAR}
              disabled={soarDispatching}
              className="btn-ghost flex items-center gap-1.5 text-xs py-1.5 px-3 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-950/30"
            >
              <Zap size={14} className={soarDispatching ? 'animate-spin' : ''} />
              {soarDispatching ? 'Dispatching...' : 'Trigger SOAR (n8n/AI)'}
            </button>

            {/* Status change select */}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-slate-500">Status:</span>
              <select
                value={currentStatus}
                onChange={(e) => handleStatusChange(e.target.value)}
                disabled={updatingStatus}
                className="soc-input py-1 px-2.5 text-xs"
                style={{ background: '#0f172a', borderColor: '#334155' }}
              >
                <option value="new">New</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="false_positive">False Positive</option>
                <option value="escalated">Escalated</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex px-6 shrink-0 bg-slate-900/40 border-b border-slate-800">
          {[
            { id: 'overview', label: '📋 Overview & Context' },
            { id: 'payload', label: '{ } Raw Payload' },
            { id: 'actions', label: '⚡ Active Response' },
            { id: 'escalate', label: '🛡️ Escalate Case Form' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-4 py-3 text-xs font-semibold transition-colors border-b-2"
              style={
                activeTab === tab.id
                  ? { color: '#06b6d4', borderColor: '#06b6d4' }
                  : { color: '#64748b', borderColor: 'transparent' }
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-fade-in">
              {/* Alert Summary Metadata Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-slate-900/70 border border-slate-800 flex items-start gap-3">
                  <Cpu size={16} className="text-cyan-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Monitored Agent</p>
                    <p className="text-sm font-semibold text-slate-200 font-mono">
                      {alert.agent?.hostname || alert.agent_id || 'Unknown'}
                    </p>
                    {alert.agent?.ip_address && (
                      <p className="text-xs text-slate-400 font-mono mt-0.5">{alert.agent.ip_address} • {alert.agent.os_type || 'OS'}</p>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-900/70 border border-slate-800 flex items-start gap-3">
                  <Clock size={16} className="text-purple-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Detection Time</p>
                    <p className="text-sm font-semibold text-slate-200 font-mono">
                      {new Date(alert.created_at).toLocaleString('en-GB')}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">Event Type: <span className="font-mono text-cyan-300">{alert.event_type}</span></p>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-900/70 border border-slate-800 flex items-start gap-3">
                  <Shield size={16} className="text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-500 font-medium">MITRE ATT&CK</p>
                    <p className="text-sm font-semibold text-slate-200">
                      {alert.mitre_tactic ? (
                        <span className="text-blue-300">{alert.mitre_tactic}</span>
                      ) : (
                        <span className="text-slate-500">Unmapped</span>
                      )}
                    </p>
                    {alert.mitre_technique_id && (
                      <p className="text-xs text-slate-400 font-mono mt-0.5">Technique ID: {alert.mitre_technique_id}</p>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-900/70 border border-slate-800 flex items-start gap-3">
                  <Radio size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Detection Engine</p>
                    <p className="text-sm font-semibold text-slate-200">Real-time Rule Engine</p>
                    <p className="text-xs text-slate-400 mt-0.5">Rule: <span className="font-mono text-emerald-300">{alert.rule_id || 'System'}</span></p>
                  </div>
                </div>
              </div>

              {/* Event Description */}
              <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Flame size={14} className="text-orange-400" />
                  Alert Context & Description
                </h4>
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                  {alert.description || 'No detailed description recorded for this alert.'}
                </p>
              </div>

              {/* Quick Payload Highlight snippet */}
              <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <Terminal size={14} className="text-cyan-400" />
                    Key Event Fields
                  </h4>
                  <button
                    onClick={() => setActiveTab('payload')}
                    className="text-xs text-cyan-400 hover:underline flex items-center gap-1"
                  >
                    View Full JSON <ArrowUpRight size={12} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  {Object.entries(parsedPayload).slice(0, 8).map(([k, v]) => (
                    <div key={k} className="p-2 rounded bg-slate-950/60 border border-slate-800/80 truncate">
                      <span className="text-slate-500">{k}: </span>
                      <span className="text-cyan-300">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: RAW PAYLOAD */}
          {activeTab === 'payload' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500 uppercase tracking-wider">Telemetry JSON Payload</p>
              </div>
              <JsonViewer data={alert.raw_payload || '{}'} maxHeight="520px" />
            </div>
          )}

          {/* TAB 3: ACTIVE RESPONSE */}
          {activeTab === 'actions' && (
            <div className="space-y-6 animate-fade-in">
              <div className="p-4 rounded-lg bg-red-950/20 border border-red-800/30">
                <h4 className="text-sm font-semibold text-red-400 mb-1 flex items-center gap-2">
                  <ShieldAlert size={16} />
                  Agent Active Response Interventions
                </h4>
                <p className="text-xs text-slate-400">
                  Directly dispatch containment commands to Endpoint Agent <strong>{alert.agent?.hostname || alert.agent_id}</strong> via secure gRPC mTLS channel.
                </p>
              </div>

              {/* Kill Process Action */}
              <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800">
                <h4 className="text-sm font-semibold text-slate-200 mb-2 flex items-center gap-2">
                  <Terminal size={15} className="text-red-400" />
                  Terminate Process (Kill PID)
                </h4>
                <p className="text-xs text-slate-500 mb-3">Forces immediate termination of a malicious process on the target agent.</p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={targetPid}
                    onChange={(e) => setTargetPid(e.target.value)}
                    placeholder="Enter Process PID (e.g., 4092)"
                    className="soc-input flex-1 font-mono text-sm"
                  />
                  <button
                    onClick={handleKillProcess}
                    disabled={actionLoading || !targetPid || !alert.agent_id}
                    className="btn-danger whitespace-nowrap text-xs px-4"
                  >
                    Kill Process
                  </button>
                </div>
              </div>

              {/* Block IP Action */}
              <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800">
                <h4 className="text-sm font-semibold text-slate-200 mb-2 flex items-center gap-2">
                  <Globe size={15} className="text-orange-400" />
                  Block Malicious IP Address
                </h4>
                <p className="text-xs text-slate-500 mb-3">Applies OS firewall drop rule (iptables/netsh) on the agent host.</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={targetIp}
                    onChange={(e) => setTargetIp(e.target.value)}
                    placeholder="Enter IP Address (e.g., 198.51.100.24)"
                    className="soc-input flex-1 font-mono text-sm"
                  />
                  <button
                    onClick={handleBlockIP}
                    disabled={actionLoading || !targetIp || !alert.agent_id}
                    className="btn-danger whitespace-nowrap text-xs px-4"
                    style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)' }}
                  >
                    Block IP
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ESCALATE FORM */}
          {activeTab === 'escalate' && (
            <form onSubmit={handleEscalate} className="space-y-4 animate-fade-in">
              <div className="p-4 rounded-lg bg-purple-950/20 border border-purple-800/30">
                <h4 className="text-sm font-semibold text-purple-300 mb-1 flex items-center gap-2">
                  <ShieldAlert size={16} />
                  Escalate Alert to Incident Case
                </h4>
                <p className="text-xs text-slate-400">
                  Creates an investigation case (TheHive-compatible workflow) linked to this alert and marks the alert status as escalated.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Case Title *</label>
                <input
                  type="text"
                  required
                  value={caseTitle}
                  onChange={(e) => setCaseTitle(e.target.value)}
                  className="soc-input w-full text-sm"
                  placeholder="e.g., Investigation of Brute Force Attack on WS-01"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Assigned SOC Analyst</label>
                <div className="relative">
                  <UserCheck size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={caseAssignee}
                    onChange={(e) => setCaseAssignee(e.target.value)}
                    className="soc-input w-full pl-9 text-sm"
                    placeholder="analyst@soc.local"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Case Description & Context (Markdown supported)</label>
                <textarea
                  rows={6}
                  value={caseDesc}
                  onChange={(e) => setCaseDesc(e.target.value)}
                  className="soc-input w-full text-xs font-mono leading-relaxed"
                  placeholder="Incident notes and initial observations..."
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveTab('overview')}
                  className="btn-ghost text-xs px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={escalating || !caseTitle.trim()}
                  className="btn-primary text-xs px-5 py-2 flex items-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #a855f7, #6366f1)' }}
                >
                  <ShieldAlert size={14} />
                  {escalating ? 'Creating Case...' : 'Confirm Escalation'}
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
