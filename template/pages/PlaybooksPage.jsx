// =============================================================================
// src/pages/PlaybooksPage.jsx
// Playbook SOAR — Tự động hóa quy trình phản ứng sự cố
// API: GET /api/v1/playbooks, POST /api/v1/playbooks, POST /api/v1/playbooks/:id/run
// =============================================================================

import { CheckCircle2, ChevronRight, Play, Plus, RefreshCw, Settings, ShieldAlert, Terminal, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatTime } from '../utils/date';

// ─── Constants & Sample Data ──────────────────────────────────────────────────
const STEP_TYPES = {
  enrich:  { label: 'Làm giàu',     color: '#64748b', bg: 'rgba(100,116,139,0.1)',  border: 'rgba(100,116,139,0.3)' },
  approve: { label: 'Phê duyệt',    color: '#fb923c', bg: 'rgba(249,115,22,0.1)',   border: 'rgba(249,115,22,0.3)' },
  isolate: { label: 'Cách ly',      color: '#f87171', bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.3)' },
  block:   { label: 'Chặn',         color: '#f87171', bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.3)' },
  notify:  { label: 'Thông báo',    color: '#60a5fa', bg: 'rgba(59,130,246,0.1)',   border: 'rgba(59,130,246,0.3)' },
  ticket:  { label: 'Tạo case',     color: '#a78bfa', bg: 'rgba(167,139,250,0.1)',  border: 'rgba(167,139,250,0.3)' },
};

const SAMPLE_PLAYBOOKS = [
  { id: 'PB-001', name: 'Ransomware Containment', trigger: 'Cảnh báo Nghiêm trọng + tag ransomware', enabled: true, success_rate: '96%', steps: [{ type: 'enrich', desc: 'Làm giàu IOC bằng Cortex Analyzer' }, { type: 'approve', desc: 'Xin duyệt qua Telegram' }, { type: 'isolate', desc: 'Cách ly endpoint khỏi mạng' }, { type: 'block', desc: 'Chặn IP C2 trên firewall' }, { type: 'ticket', desc: 'Tạo case và gán trưởng ca' }] },
  { id: 'PB-002', name: 'Phishing Triage', trigger: 'Email bị báo cáo bởi người dùng', enabled: true, success_rate: '91%', steps: [{ type: 'enrich', desc: 'Kiểm tra URL và tệp đính kèm' }, { type: 'block', desc: 'Chặn domain trên proxy' }, { type: 'notify', desc: 'Thông báo người nhận thư' }] },
  { id: 'PB-003', name: 'SSH Brute-force Response', trigger: 'Hơn 100 lần đăng nhập thất bại / 5 phút', enabled: false, success_rate: '88%', steps: [{ type: 'block', desc: 'Chặn IP nguồn 24 giờ' }, { type: 'notify', desc: 'Gửi cảnh báo vào kênh SOC' }] },
];

function StepBadge({ type }) {
  const cfg = STEP_TYPES[type] || STEP_TYPES.enrich;
  return (
    <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
      {cfg.label}
    </span>
  );
}

// =============================================================================
export default function PlaybooksPage() {
  const { addToast } = useApp();
  const [playbooks, setPlaybooks] = useState(SAMPLE_PLAYBOOKS);
  const [activePb, setActivePb] = useState(SAMPLE_PLAYBOOKS[0]);
  const [runs, setRuns] = useState([]);
  
  // Create Modal State
  const [showCreate, setShowCreate] = useState(false);
  const [newPb, setNewPb] = useState({ name: '', trigger: '' });

  // Run State
  const [running, setRunning] = useState(false);
  const [runLog, setRunLog] = useState([]);

  // Editor State
  const [newStepType, setNewStepType] = useState('enrich');
  const [newStepDesc, setNewStepDesc] = useState('');

  const toggleEnabled = () => {
    if (running) return;
    const newState = !activePb.enabled;
    const updated = { ...activePb, enabled: newState };
    setPlaybooks(prev => prev.map(p => p.id === activePb.id ? updated : p));
    setActivePb(updated);
    addToast({ severity: 'info', title: newState ? 'Đã bật' : 'Đã tắt', message: activePb.name });
  };

  const removeStep = (idx) => {
    if (running) return;
    const updated = { ...activePb, steps: activePb.steps.filter((_, i) => i !== idx) };
    setPlaybooks(prev => prev.map(p => p.id === activePb.id ? updated : p));
    setActivePb(updated);
  };

  const addStep = () => {
    if (!newStepDesc.trim() || running) return;
    const updated = { ...activePb, steps: [...activePb.steps, { type: newStepType, desc: newStepDesc.trim() }] };
    setPlaybooks(prev => prev.map(p => p.id === activePb.id ? updated : p));
    setActivePb(updated);
    setNewStepDesc('');
  };

  const handleCreate = () => {
    if (!newPb.name.trim()) { addToast({ severity: 'critical', title: 'Tên không được để trống' }); return; }
    const id = `PB-00${playbooks.length + 1}`;
    const pb = { id, name: newPb.name.trim(), trigger: newPb.trigger.trim() || 'Thủ công', enabled: false, success_rate: '—', steps: [] };
    setPlaybooks(prev => [...prev, pb]);
    setActivePb(pb);
    setShowCreate(false);
    setNewPb({ name: '', trigger: '' });
    addToast({ severity: 'info', title: 'Đã tạo playbook', message: pb.name });
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const runPlaybook = async () => {
    if (!activePb.steps.length) { addToast({ severity: 'info', title: 'Không thể chạy', message: 'Playbook chưa có bước nào' }); return; }
    setRunning(true);
    setRunLog([]);
    addToast({ severity: 'info', title: 'Đang chạy', message: activePb.name });

    for (const step of activePb.steps) {
      setRunLog(prev => [...prev, { text: `▶ ${STEP_TYPES[step.type].label}: ${step.desc}`, color: '#94a3b8' }]);
      await sleep(800);
      setRunLog(prev => [...prev, { text: `✓ Hoàn tất${step.type === 'approve' ? ' (mô phỏng: đã duyệt)' : ''}`, color: '#4ade80' }]);
    }
    
    setRunLog(prev => [...prev, { text: 'Playbook hoàn tất (mô phỏng).', color: '#4ade80' }]);
    setRuns(prev => [{ pb: activePb.name, t: new Date().toISOString(), status: 'Thành công' }, ...prev]);
    setRunning(false);
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 lg:px-6 py-5 flex flex-col gap-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2.5" style={{ color: '#f8fafc' }}>
            <span style={{ background: 'rgba(134,239,172,0.15)', border: '1px solid rgba(134,239,172,0.3)', borderRadius: '10px', padding: '6px 8px', display: 'inline-flex', alignItems: 'center' }}>
              <Settings size={18} style={{ color: '#86efac' }} />
            </span>
            Playbook SOAR
          </h1>
          <p className="text-xs mt-1" style={{ color: '#64748b' }}>Tự động hóa quy trình phản ứng sự cố (Incident Response)</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 text-xs" disabled={running}>
          <Plus size={12} /> Tạo playbook
        </button>
      </div>

      <div className="grid lg:grid-cols-12 gap-5 items-start">
        {/* Left Col: List */}
        <div className="lg:col-span-4 soc-card" style={{ padding: '16px 18px', minHeight: '600px' }}>
          <h2 className="text-sm font-semibold text-white mb-4 flex justify-between">
            Danh sách Playbook <span style={{ color: '#64748b', fontWeight: 400 }}>{playbooks.length}</span>
          </h2>
          <div className="flex flex-col gap-2">
            {playbooks.map(pb => (
              <button
                key={pb.id}
                onClick={() => !running && setActivePb(pb)}
                disabled={running}
                style={{
                  display: 'flex', gap: '10px', alignItems: 'center', textAlign: 'left',
                  padding: '12px 14px', borderRadius: '8px', cursor: running ? 'not-allowed' : 'pointer',
                  border: activePb?.id === pb.id ? '1px solid rgba(6,182,212,0.5)' : '1px solid transparent',
                  background: activePb?.id === pb.id ? 'rgba(6,182,212,0.1)' : 'rgba(30,41,59,0.5)',
                  transition: 'all 0.2s',
                  opacity: running && activePb?.id !== pb.id ? 0.5 : 1
                }}
                onMouseEnter={e => { if(!running && activePb?.id !== pb.id) e.currentTarget.style.background = 'rgba(30,41,59,0.8)'; }}
                onMouseLeave={e => { if(!running && activePb?.id !== pb.id) e.currentTarget.style.background = 'rgba(30,41,59,0.5)'; }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: 'block', fontSize: '13px', color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pb.name}</b>
                  <small style={{ color: '#94a3b8', fontSize: '11.5px' }}>{pb.steps.length} bước · tỷ lệ OK {pb.success_rate}</small>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 600, color: pb.enabled ? '#4ade80' : '#64748b', padding: '2px 6px', borderRadius: '4px', background: pb.enabled ? 'rgba(74,222,128,0.1)' : 'rgba(100,116,139,0.1)' }}>
                  {pb.enabled ? 'BẬT' : 'TẮT'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Right Col: Editor & Logs */}
        <div className="lg:col-span-8 flex flex-col gap-5">
          {activePb ? (
            <>
              {/* Editor */}
              <div className="soc-card" style={{ padding: '20px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div>
                    <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#f8fafc', marginBottom: '4px' }}>{activePb.name}</h2>
                    <p style={{ fontSize: '12.5px', color: '#94a3b8' }}>
                      Kích hoạt khi: <b style={{ color: '#e2e8f0', fontWeight: 500 }}>{activePb.trigger}</b>
                    </p>
                  </div>
                  <button
                    onClick={toggleEnabled}
                    role="switch" aria-checked={activePb.enabled}
                    aria-label={activePb.enabled ? 'Tắt' : 'Bật'}
                    style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer', position: 'relative', background: activePb.enabled ? '#22c55e' : '#374151', transition: 'background 0.2s ease' }}
                  >
                    <span style={{ position: 'absolute', top: '2px', left: activePb.enabled ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s ease' }} />
                  </button>
                </div>

                <div style={{ background: 'rgba(15,23,42,0.4)', borderRadius: '12px', padding: '16px', border: '1px solid #1e293b' }}>
                  {activePb.steps.length === 0 ? (
                    <div className="empty-state" style={{ padding: '20px' }}>
                      <p className="empty-state-title">Chưa có bước nào</p>
                      <p className="empty-state-desc">Thêm bước xử lý bên dưới</p>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {activePb.steps.map((step, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(30,41,59,0.6)', border: '1px solid #334155', borderRadius: '8px', padding: '10px 14px' }}>
                          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#06b6d4', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>
                            {i + 1}
                          </div>
                          <StepBadge type={step.type} />
                          <span style={{ flex: 1, fontSize: '12.5px', color: '#e2e8f0', marginLeft: '4px' }}>{step.desc}</span>
                          <button onClick={() => removeStep(i)} disabled={running} className="btn-action-red" style={{ padding: '4px 8px', fontSize: '11px' }}>Xóa</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Step Tool */}
                  <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
                    <select className="soc-input" value={newStepType} onChange={e => setNewStepType(e.target.value)} disabled={running} style={{ width: '140px', fontSize: '12px' }}>
                      {Object.entries(STEP_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <input className="soc-input" value={newStepDesc} onChange={e => setNewStepDesc(e.target.value)} disabled={running} placeholder="Mô tả hành động…" style={{ flex: 1, fontSize: '12px', minWidth: '200px' }} onKeyDown={e => e.key === 'Enter' && addStep()} />
                    <button onClick={addStep} disabled={running || !newStepDesc.trim()} className="btn-ghost" style={{ fontSize: '12px', padding: '8px 16px' }}>Thêm bước</button>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                  <button onClick={runPlaybook} disabled={running || !activePb.steps.length} className="btn-primary flex items-center gap-2" style={{ padding: '10px 24px' }}>
                    {running ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
                    {running ? 'Đang chạy…' : 'Chạy thử Playbook'}
                  </button>
                </div>
              </div>

              {/* Run Logs */}
              <div className="soc-card" style={{ padding: '20px 24px' }}>
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Terminal size={16} style={{ color: '#06b6d4' }} /> Nhật ký chạy thử
                </h3>
                
                <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px 16px', minHeight: '100px', maxHeight: '200px', overflowY: 'auto', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {runLog.length === 0 ? (
                    <span style={{ color: '#475569' }}>Chưa có phiên chạy thử nào trong phiên làm việc này.</span>
                  ) : (
                    runLog.map((log, i) => (
                      <div key={i} style={{ color: log.color }}>{log.text}</div>
                    ))
                  )}
                </div>

                {runs.length > 0 && (
                  <div style={{ marginTop: '16px', overflowX: 'auto' }}>
                    <table className="soc-table">
                      <thead><tr><th>Playbook</th><th>Thời gian</th><th>Kết quả</th></tr></thead>
                      <tbody>
                        {runs.map((r, i) => (
                          <tr key={i}>
                            <td style={{ fontSize: '12px', color: '#e2e8f0' }}>{r.pb}</td>
                            <td style={{ fontFamily: 'monospace', fontSize: '11px', color: '#94a3b8' }}>{formatTime(r.t)}</td>
                            <td><span style={{ color: '#4ade80', fontSize: '11.5px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={12} /> {r.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="empty-state" style={{ height: '600px' }}>
              <div className="empty-state-icon"><ShieldAlert size={32} /></div>
              <p className="empty-state-title">Chưa chọn Playbook</p>
              <p className="empty-state-desc">Chọn một playbook bên trái hoặc tạo mới</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={() => setShowCreate(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'linear-gradient(145deg,#111827,#0f172a)', border: '1px solid #1e293b', borderRadius: '16px', width: '100%', maxWidth: '480px', boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #1e293b' }}>
              <span style={{ fontWeight: 600, fontSize: '14px', color: '#f8fafc' }}>Tạo Playbook mới</span>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <div style={{ padding: '20px', display: 'grid', gap: '16px' }}>
              <div style={{ display: 'grid', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>Tên playbook</label>
                <input className="soc-input" value={newPb.name} onChange={e => setNewPb(p => ({ ...p, name: e.target.value }))} placeholder="VD: Xử lý tài khoản bị lộ" autoFocus />
              </div>
              <div style={{ display: 'grid', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>Điều kiện kích hoạt</label>
                <input className="soc-input" value={newPb.trigger} onChange={e => setNewPb(p => ({ ...p, trigger: e.target.value }))} placeholder="VD: Cảnh báo mức Cao + tag credential" />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 20px', borderTop: '1px solid #1e293b', gap: '8px' }}>
              <button onClick={() => setShowCreate(false)} className="btn-ghost" style={{ fontSize: '12px', padding: '8px 16px' }}>Hủy</button>
              <button onClick={handleCreate} className="btn-primary" style={{ fontSize: '12px', padding: '8px 16px' }}>Tạo Playbook</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
