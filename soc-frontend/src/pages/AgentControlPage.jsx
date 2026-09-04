// =============================================================================
// src/pages/AgentControlPage.jsx — v2 Cyberpunk Enterprise Redesign
// =============================================================================

import {
  Cpu,
  HardDrive,
  Loader,
  Monitor,
  RefreshCw,
  Shield,
  Terminal,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import Modal from '../components/common/Modal';
import { PageLoader } from '../components/common/LoadingSpinner';
import { useApp } from '../context/AppContext';
import { blockIP, getAgents, killProcess } from '../services/api';

// ─── OS Badge ─────────────────────────────────────────────────────────────────
const OSBadge = ({ os }) => {
  const map = {
    windows: { label: 'Windows', color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)', Icon: Monitor },
    linux:   { label: 'Linux',   color: '#ff9900', bg: 'rgba(255,153,0,0.08)',  border: 'rgba(255,153,0,0.2)',  Icon: Terminal },
    macos:   { label: 'macOS',   color: '#a855f7', bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.2)', Icon: HardDrive },
  };
  const cfg = map[os?.toLowerCase()] || { label: os || '?', color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.2)', Icon: Cpu };
  const { Icon } = cfg;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
      <Icon size={11} />
      {cfg.label}
    </span>
  );
};

// ─── Kill Process Modal ────────────────────────────────────────────────────────
function KillProcessModal({ agent, isOpen, onClose }) {
  const { addToast }    = useApp();
  const [pid,  setPid]  = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    const pidNum = parseInt(pid, 10);
    if (!pidNum || pidNum < 1) {
      addToast({ severity: 'medium', title: 'Invalid PID', message: 'Enter a valid positive integer PID.' });
      return;
    }
    setBusy(true);
    try {
      await killProcess(agent.id, pidNum);
      addToast({ severity: 'success', title: 'Kill command sent', message: `PID ${pidNum} → ${agent.hostname}` });
      setPid(''); onClose();
    } catch (e) {
      addToast({ severity: 'high', title: 'Command failed', message: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`⚡ Kill Process — ${agent?.hostname}`} size="sm"
      footer={<>
        <button onClick={onClose} className="btn-ghost">Cancel</button>
        <button onClick={handleSubmit} disabled={busy || !pid} className="btn-danger flex items-center gap-2">
          {busy ? <Loader size={13} className="animate-spin" /> : <XCircle size={13} />}
          {busy ? 'Sending...' : 'Send Kill'}
        </button>
      </>}>
      <div className="flex flex-col gap-4">
        <div className="p-3.5 rounded-xl text-sm" style={{ background:'rgba(255,51,102,0.07)', border:'1px solid rgba(255,51,102,0.2)', color:'#fda4af' }}>
          ⚠ This will forcefully terminate the specified process on the remote endpoint via Active Response.
        </div>
        <div>
          <label className="block text-xs mb-1.5" style={{ color: '#64748b' }}>Target Agent</label>
          <p className="text-sm font-mono" style={{ color: '#06b6d4' }}>{agent?.hostname} ({agent?.ip_address})</p>
        </div>
        <div>
          <label className="block text-xs mb-1.5" style={{ color: '#64748b' }}>Process ID (PID) *</label>
          <input type="number" min={1} placeholder="e.g. 4284" value={pid}
            onChange={(e) => setPid(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            className="soc-input" autoFocus />
        </div>
      </div>
    </Modal>
  );
}

// ─── Block IP Modal ────────────────────────────────────────────────────────────
function BlockIPModal({ agent, isOpen, onClose }) {
  const { addToast }  = useApp();
  const [ip,   setIp] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    if (!ipRegex.test(ip.trim())) {
      addToast({ severity: 'medium', title: 'Invalid IP', message: 'Enter a valid IPv4 address or CIDR range.' });
      return;
    }
    setBusy(true);
    try {
      await blockIP(agent.id, ip.trim());
      addToast({ severity: 'success', title: 'Block command sent', message: `IP ${ip} → ${agent.hostname}` });
      setIp(''); onClose();
    } catch (e) {
      addToast({ severity: 'high', title: 'Command failed', message: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`🔒 Block IP — ${agent?.hostname}`} size="sm"
      footer={<>
        <button onClick={onClose} className="btn-ghost">Cancel</button>
        <button onClick={handleSubmit} disabled={busy || !ip} className="btn-danger flex items-center gap-2">
          {busy ? <Loader size={13} className="animate-spin" /> : <Shield size={13} />}
          {busy ? 'Sending...' : 'Block IP'}
        </button>
      </>}>
      <div className="flex flex-col gap-4">
        <div className="p-3.5 rounded-xl text-sm" style={{ background:'rgba(255,153,0,0.07)', border:'1px solid rgba(255,153,0,0.2)', color:'#fdba74' }}>
          ⚠ This will add a firewall DENY rule for the specified IP on the target endpoint.
        </div>
        <div>
          <label className="block text-xs mb-1.5" style={{ color: '#64748b' }}>Target Agent</label>
          <p className="text-sm font-mono" style={{ color: '#06b6d4' }}>{agent?.hostname} ({agent?.ip_address})</p>
        </div>
        <div>
          <label className="block text-xs mb-1.5" style={{ color: '#64748b' }}>IP Address / CIDR *</label>
          <input type="text" placeholder="e.g. 192.168.1.100 or 10.0.0.0/8" value={ip}
            onChange={(e) => setIp(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            className="soc-input" autoFocus />
        </div>
      </div>
    </Modal>
  );
}

// ─── Agent Row ─────────────────────────────────────────────────────────────────
function AgentRow({ agent }) {
  const [killOpen,  setKillOpen]  = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const isOnline = agent.status === 'online';

  return (
    <>
      <tr>
        <td>
          <span className="font-mono text-xs px-2 py-0.5 rounded-md"
            style={{ background:'#0a0e17', color:'#64748b', border:'1px solid #1e293b', letterSpacing:'0.05em' }}>
            #{agent.id?.substring(0, 8).toUpperCase()}
          </span>
        </td>
        <td>
          <div className="flex items-center gap-2.5">
            {isOnline
              ? <span className="status-dot-online" />
              : <span className="status-dot-offline" />}
            <span className="font-semibold text-sm" style={{ color: '#f8fafc' }}>{agent.hostname}</span>
          </div>
        </td>
        <td>
          <span className="font-mono text-xs" style={{ color: '#94a3b8' }}>{agent.ip_address}</span>
        </td>
        <td><OSBadge os={agent.os_type} /></td>
        <td>
          <span className="font-mono text-xs" style={{ color: '#64748b' }}>
            {agent.last_heartbeat_at ? new Date(agent.last_heartbeat_at).toLocaleString('en-GB') : 'Never'}
          </span>
        </td>
        <td>
          <span className="font-mono text-xs" style={{ color: '#475569' }}>{agent.agent_version || '—'}</span>
        </td>
        <td>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setKillOpen(true)}
              disabled={!isOnline}
              className="btn-action-red"
            >
              <XCircle size={11} />
              Kill PID
            </button>
            <button
              onClick={() => setBlockOpen(true)}
              disabled={!isOnline}
              className="btn-action-orange"
            >
              <Shield size={11} />
              Block IP
            </button>
          </div>
        </td>
      </tr>

      <KillProcessModal  agent={agent} isOpen={killOpen}  onClose={() => setKillOpen(false)} />
      <BlockIPModal      agent={agent} isOpen={blockOpen} onClose={() => setBlockOpen(false)} />
    </>
  );
}

// =============================================================================
// Main Component
// =============================================================================
export default function AgentControlPage() {
  const [agents,  setAgents]  = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAgents();
      setAgents(res.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const online  = agents.filter(a => a.status === 'online').length;
  const offline = agents.length - online;

  return (
    <div className="flex flex-col gap-5 p-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2.5" style={{ color: '#f8fafc' }}>
            <span style={{ background:'linear-gradient(135deg,rgba(16,185,129,0.2),rgba(16,185,129,0.05))', border:'1px solid rgba(16,185,129,0.25)', borderRadius:'10px', padding:'6px 8px', display:'inline-flex' }}>
              <Cpu size={18} style={{ color: '#10b981' }} />
            </span>
            Agent &amp; Endpoint Control
          </h1>
          <p className="text-xs mt-1" style={{ color: '#64748b' }}>EDR Agent Management • Active Response Console</p>
        </div>
        <button onClick={load} className="btn-ghost flex items-center gap-2 text-xs">
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Online', value: online,         color: '#10b981', icon: Wifi },
          { label: 'Offline', value: offline,        color: '#ff3366', icon: WifiOff },
          { label: 'Total',  value: agents.length,  color: '#3b82f6', icon: Cpu },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="soc-card p-4 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: `rgba(${color === '#10b981' ? '16,185,129' : color === '#ff3366' ? '255,51,102' : '59,130,246'},0.1)`, border: `1px solid rgba(${color === '#10b981' ? '16,185,129' : color === '#ff3366' ? '255,51,102' : '59,130,246'},0.2)` }}>
              <Icon size={18} style={{ color }} />
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color }}>{value}</p>
              <p className="text-xs" style={{ color: '#64748b' }}>Agents {label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Agents Table */}
      <div className="soc-card overflow-hidden">
        {loading ? <PageLoader /> : (
          <div className="overflow-x-auto">
            <table className="soc-table">
              <thead>
                <tr>
                  <th>Agent ID</th>
                  <th>Hostname</th>
                  <th>IP Address</th>
                  <th>OS</th>
                  <th>Last Heartbeat</th>
                  <th>Version</th>
                  <th>Active Response</th>
                </tr>
              </thead>
              <tbody>
                {agents.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-16" style={{ color: '#475569' }}>No agents registered.</td></tr>
                ) : (
                  agents.map(agent => <AgentRow key={agent.id} agent={agent} />)
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-xs" style={{ color: '#475569' }}>
        <span className="flex items-center gap-1.5"><span className="status-dot-online" />Online — Agent active &amp; accepting commands</span>
        <span className="flex items-center gap-1.5"><span className="status-dot-offline" />Offline — No heartbeat for &gt;5 minutes</span>
        <span style={{ color: '#334155' }}>|</span>
        <span>Action buttons are disabled for offline agents</span>
      </div>
    </div>
  );
}
