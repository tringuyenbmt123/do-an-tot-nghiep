// =============================================================================
// src/pages/DetectionRulesPage.jsx
// Cyberpunk Enterprise Detection Rules Management GUI
// Full CRUD + Real-time Toggle + YAML Code & Form Bi-directional Editor
// =============================================================================

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Code,
  Edit3,
  FileCode,
  Filter,
  Layers,
  Loader,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Sliders,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as jsYaml from 'js-yaml';
import { PageLoader } from '../components/common/LoadingSpinner';
import { useApp } from '../context/AppContext';
import {
  createRule,
  deleteRule,
  getRules,
  toggleRule,
  updateRule,
} from '../services/api';

// ─── Helper Badge Components ──────────────────────────────────────────────────
const SeverityBadge = ({ severity }) => {
  const sev = (severity || 'medium').toLowerCase();
  const config = {
    critical: { bg: 'rgba(239,68,68,0.15)', text: '#f87171', border: 'rgba(239,68,68,0.4)', label: 'CRITICAL' },
    high:     { bg: 'rgba(249,115,22,0.15)', text: '#fb923c', border: 'rgba(249,115,22,0.4)', label: 'HIGH' },
    medium:   { bg: 'rgba(234,179,8,0.15)',  text: '#facc15', border: 'rgba(234,179,8,0.4)',  label: 'MEDIUM' },
    low:      { bg: 'rgba(59,130,246,0.15)',  text: '#60a5fa', border: 'rgba(59,130,246,0.4)',  label: 'LOW' },
  }[sev] || { bg: 'rgba(148,163,184,0.15)', text: '#94a3b8', border: 'rgba(148,163,184,0.4)', label: sev.toUpperCase() };

  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold font-mono tracking-wide"
      style={{ background: config.bg, color: config.text, border: `1px solid ${config.border}` }}
    >
      {config.label}
    </span>
  );
};

const SourceBadge = ({ source }) => {
  const isYaml = source === 'yaml_file';
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono"
      style={{
        background: isYaml ? 'rgba(168,85,247,0.12)' : 'rgba(6,182,212,0.12)',
        color: isYaml ? '#c084fc' : '#22d3ee',
        border: `1px solid ${isYaml ? 'rgba(168,85,247,0.3)' : 'rgba(6,182,212,0.3)'}`,
      }}
    >
      {isYaml ? <FileCode size={12} /> : <Layers size={12} />}
      {isYaml ? 'YAML File' : 'Database'}
    </span>
  );
};

// Parse conditions safely into array
function parseConditionsList(condInput) {
  if (!condInput) return [];
  if (Array.isArray(condInput)) return condInput;
  try {
    const parsed = JSON.parse(condInput);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Convert rule object to YAML string
function ruleToYamlString(rule) {
  const conds = parseConditionsList(rule.conditions);
  const yamlObj = {
    id: rule.id || '',
    name: rule.name || '',
    severity: rule.severity || 'medium',
    event_type: rule.event_type || 'custom_event',
    description: rule.description || '',
    mitre_tactic: rule.mitre_tactic || '',
    mitre_technique_id: rule.mitre_technique_id || '',
    is_active: rule.is_active !== false,
    conditions: conds,
  };
  try {
    return jsYaml.dump(yamlObj, { indent: 2 });
  } catch {
    return '# Error generating YAML';
  }
}

// Convert YAML string to rule object format
function yamlStringToRuleObject(yamlStr) {
  const parsed = jsYaml.load(yamlStr);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('YAML không đúng định dạng Object');
  }
  return {
    id: parsed.id || '',
    name: parsed.name || '',
    severity: parsed.severity || 'medium',
    event_type: parsed.event_type || 'custom_event',
    description: parsed.description || '',
    mitre_tactic: parsed.mitre_tactic || '',
    mitre_technique_id: parsed.mitre_technique_id || '',
    is_active: parsed.is_active !== false,
    conditions: JSON.stringify(parsed.conditions || []),
  };
}

export default function DetectionRulesPage() {
  const { addToast } = useApp();

  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' | 'edit'
  const [editorTab, setEditorTab] = useState('form'); // 'form' | 'yaml'
  const [saving, setSaving] = useState(false);

  // Form Fields State
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    severity: 'medium',
    event_type: 'sysmon_process_create',
    description: '',
    mitre_tactic: '',
    mitre_technique_id: '',
    is_active: true,
    conditions: [{ field: 'process_name', operator: 'equals', value: '' }],
  });

  // Raw YAML Editor State
  const [yamlText, setYamlText] = useState('');
  const [yamlError, setYamlError] = useState(null);

  // Fetch Rules from Backend API
  const fetchRulesList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getRules();
      const list = res.data || res || [];
      setRules(list);
    } catch (err) {
      addToast(`Lỗi tải danh sách Rule: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchRulesList();
  }, [fetchRulesList]);

  // Handle Toggle Active/Inactive
  const handleToggleRule = async (ruleId, currentStatus) => {
    const nextStatus = !currentStatus;
    // Optimistic UI update
    setRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, is_active: nextStatus } : r))
    );

    try {
      await toggleRule(ruleId, nextStatus);
      addToast(`Đã ${nextStatus ? 'bật' : 'tắt'} Rule [${ruleId}]`, 'success');
    } catch (err) {
      // Revert on error
      setRules((prev) =>
        prev.map((r) => (r.id === ruleId ? { ...r, is_active: currentStatus } : r))
      );
      addToast(`Lỗi cập nhật trạng thái: ${err.message}`, 'error');
    }
  };

  // Handle Delete Rule
  const handleDeleteRule = async (ruleId) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa Rule [${ruleId}]?`)) return;

    try {
      await deleteRule(ruleId);
      addToast(`Đã xóa thành công Rule [${ruleId}]`, 'success');
      fetchRulesList();
    } catch (err) {
      addToast(`Lỗi xóa Rule: ${err.message}`, 'error');
    }
  };

  // Open Modal for Creating Rule
  const openCreateModal = () => {
    const initialForm = {
      id: `RULE-${Date.now().toString().slice(-6)}`,
      name: '',
      severity: 'medium',
      event_type: 'sysmon_process_create',
      description: '',
      mitre_tactic: 'Execution',
      mitre_technique_id: 'T1059',
      is_active: true,
      conditions: [{ field: 'process_name', operator: 'equals', value: '' }],
    };
    setFormData(initialForm);
    setYamlText(ruleToYamlString({ ...initialForm, conditions: JSON.stringify(initialForm.conditions) }));
    setYamlError(null);
    setModalMode('create');
    setEditorTab('form');
    setModalOpen(true);
  };

  // Open Modal for Editing Rule
  const openEditModal = (rule) => {
    const conds = parseConditionsList(rule.conditions);
    const initialForm = {
      id: rule.id,
      name: rule.name || '',
      severity: rule.severity || 'medium',
      event_type: rule.event_type || 'sysmon_process_create',
      description: rule.description || '',
      mitre_tactic: rule.mitre_tactic || '',
      mitre_technique_id: rule.mitre_technique_id || '',
      is_active: rule.is_active !== false,
      conditions: conds.length > 0 ? conds : [{ field: 'process_name', operator: 'equals', value: '' }],
    };
    setFormData(initialForm);
    setYamlText(ruleToYamlString(rule));
    setYamlError(null);
    setModalMode('edit');
    setEditorTab('form');
    setModalOpen(true);
  };

  // Sync Form -> YAML when switching to YAML tab
  const handleTabSwitch = (tab) => {
    if (tab === 'yaml') {
      const payload = {
        ...formData,
        conditions: JSON.stringify(formData.conditions),
      };
      setYamlText(ruleToYamlString(payload));
      setYamlError(null);
    } else if (tab === 'form') {
      // Sync YAML -> Form if valid
      try {
        const parsedRule = yamlStringToRuleObject(yamlText);
        setFormData({
          ...parsedRule,
          conditions: parseConditionsList(parsedRule.conditions),
        });
        setYamlError(null);
      } catch (err) {
        setYamlError(`Lỗi YAML syntax: ${err.message}`);
        addToast(`Cảnh báo: Nội dung YAML có lỗi, chưa thể chuyển qua Form UI`, 'warning');
        return;
      }
    }
    setEditorTab(tab);
  };

  // Condition Form Handlers
  const handleAddCondition = () => {
    setFormData((prev) => ({
      ...prev,
      conditions: [...prev.conditions, { field: 'command_line', operator: 'contains', value: '' }],
    }));
  };

  const handleRemoveCondition = (index) => {
    setFormData((prev) => ({
      ...prev,
      conditions: prev.conditions.filter((_, i) => i !== index),
    }));
  };

  const handleConditionChange = (index, key, val) => {
    setFormData((prev) => {
      const updated = [...prev.conditions];
      updated[index] = { ...updated[index], [key]: val };
      return { ...prev, conditions: updated };
    });
  };

  // Save Rule Handler
  const handleSaveRule = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      let payload = {};

      if (editorTab === 'yaml') {
        // Parse from YAML Text
        try {
          payload = yamlStringToRuleObject(yamlText);
        } catch (err) {
          throw new Error(`YAML Syntax Error: ${err.message}`);
        }
      } else {
        // Prepare from Form State
        payload = {
          id: formData.id,
          name: formData.name,
          severity: formData.severity,
          event_type: formData.event_type,
          description: formData.description,
          mitre_tactic: formData.mitre_tactic,
          mitre_technique_id: formData.mitre_technique_id,
          is_active: formData.is_active,
          conditions: JSON.stringify(formData.conditions),
        };
      }

      if (!payload.name) throw new Error('Tên Rule không được để trống');
      if (!payload.id) throw new Error('ID Rule không được để trống');

      if (modalMode === 'create') {
        await createRule(payload);
        addToast(`Đã tạo thành công Rule [${payload.id}]`, 'success');
      } else {
        await updateRule(payload.id, payload);
        addToast(`Đã cập nhật thành công Rule [${payload.id}]`, 'success');
      }

      setModalOpen(false);
      fetchRulesList();
    } catch (err) {
      addToast(`Lỗi lưu Rule: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Filtered Rules List
  const filteredRules = useMemo(() => {
    return rules.filter((r) => {
      const matchSearch =
        search === '' ||
        (r.id && r.id.toLowerCase().includes(search.toLowerCase())) ||
        (r.name && r.name.toLowerCase().includes(search.toLowerCase())) ||
        (r.description && r.description.toLowerCase().includes(search.toLowerCase())) ||
        (r.mitre_technique_id && r.mitre_technique_id.toLowerCase().includes(search.toLowerCase()));

      const matchSev = severityFilter === 'all' || (r.severity || '').toLowerCase() === severityFilter;
      const matchSource =
        sourceFilter === 'all' ||
        (sourceFilter === 'yaml' && r.source === 'yaml_file') ||
        (sourceFilter === 'database' && r.source !== 'yaml_file');

      return matchSearch && matchSev && matchSource;
    });
  }, [rules, search, severityFilter, sourceFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = rules.length;
    const active = rules.filter((r) => r.is_active !== false).length;
    const inactive = total - active;
    const criticalOrHigh = rules.filter((r) => ['critical', 'high'].includes((r.severity || '').toLowerCase())).length;
    return { total, active, inactive, criticalOrHigh };
  }, [rules]);

  if (loading && rules.length === 0) {
    return <PageLoader />;
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto text-slate-100">
      {/* ─── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Sliders size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Detection Rules Management
                <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono">
                  Engine Ready
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Quản lý, tinh chỉnh luật phát hiện mối đe dọa trực tiếp (Chạy 100% Database & Hỗ trợ xem/sửa YAML Code)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchRulesList}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors border border-slate-700 cursor-pointer"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Làm mới
          </button>

          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
          >
            <Plus size={18} />
            Tạo Rule Mới
          </button>
        </div>
      </div>

      {/* ─── KPI Stats Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Tổng Số Rules</p>
            <p className="text-2xl font-bold font-mono text-white mt-1">{stats.total}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Shield size={20} />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Rules Đang Active</p>
            <p className="text-2xl font-bold font-mono text-emerald-400 mt-1">{stats.active}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CheckCircle2 size={20} />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Mức Độ Critical / High</p>
            <p className="text-2xl font-bold font-mono text-rose-400 mt-1">{stats.criticalOrHigh}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <AlertTriangle size={20} />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Rules Đang Đóng (Disabled)</p>
            <p className="text-2xl font-bold font-mono text-slate-400 mt-1">{stats.inactive}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400">
            <ToggleLeft size={20} />
          </div>
        </div>
      </div>

      {/* ─── Search & Filter Bar ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800">
        <div className="relative w-full sm:w-80">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo ID, Tên, MITRE T1059..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Severity filter */}
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Filter size={14} />
            <span>Severity:</span>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none"
            >
              <option value="all">Tất cả Mức Độ</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
      </div>

      {/* ─── Rules Table ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-xs font-mono text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Rule ID & Tên</th>
                <th className="px-4 py-3">Mức Độ</th>
                <th className="px-4 py-3">Event Type</th>
                <th className="px-4 py-3">MITRE ATT&CK</th>
                <th className="px-4 py-3">Điều Kiện Match</th>
                <th className="px-4 py-3 text-center">Trạng Thái</th>
                <th className="px-4 py-3 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredRules.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Không tìm thấy Rule nào phù hợp với bộ lọc
                  </td>
                </tr>
              ) : (
                filteredRules.map((rule) => {
                  const conds = parseConditionsList(rule.conditions);
                  const isActive = rule.is_active !== false;

                  return (
                    <tr key={rule.id} className="hover:bg-slate-800/30 transition-colors">
                      {/* ID & Name */}
                      <td className="px-4 py-3 max-w-[280px]">
                        <div className="font-mono text-xs font-bold text-cyan-400 truncate">{rule.id}</div>
                        <div className="text-sm font-medium text-slate-200 truncate" title={rule.name}>
                          {rule.name}
                        </div>
                      </td>

                      {/* Severity */}
                      <td className="px-4 py-3">
                        <SeverityBadge severity={rule.severity} />
                      </td>

                      {/* Event Type */}
                      <td className="px-4 py-3 font-mono text-xs text-slate-300">
                        <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                          {rule.event_type || 'sysmon_process_create'}
                        </span>
                      </td>

                      {/* MITRE ATT&CK */}
                      <td className="px-4 py-3">
                        {rule.mitre_technique_id ? (
                          <div className="font-mono text-xs">
                            <span className="text-orange-400 font-bold">{rule.mitre_technique_id}</span>
                            {rule.mitre_tactic && (
                              <span className="text-slate-400 block text-[11px]">{rule.mitre_tactic}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-600 text-xs">-</span>
                        )}
                      </td>

                      {/* Conditions Summary */}
                      <td className="px-4 py-3 max-w-[320px]">
                        <div className="space-y-1">
                          {conds.slice(0, 2).map((c, i) => (
                            <div key={i} className="text-xs font-mono text-slate-300 truncate" title={`${c.field} ${c.operator} ${c.value}`}>
                              <span className="text-blue-400 font-semibold">{c.field}</span>{' '}
                              <span className="text-amber-400">{c.operator}</span>{' '}
                              <span className="text-emerald-300">{c.value}</span>
                            </div>
                          ))}
                          {conds.length > 2 && (
                            <div className="text-[11px] text-slate-500">+{conds.length - 2} điều kiện nữa...</div>
                          )}
                        </div>
                      </td>

                      {/* Active Status Toggle */}
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleToggleRule(rule.id, isActive)}
                          className="inline-flex items-center justify-center cursor-pointer transition-transform active:scale-95"
                          title={isActive ? 'Nhấn để tắt Rule' : 'Nhấn để bật Rule'}
                        >
                          {isActive ? (
                            <ToggleRight size={28} className="text-emerald-400 hover:text-emerald-300" />
                          ) : (
                            <ToggleLeft size={28} className="text-slate-600 hover:text-slate-500" />
                          )}
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(rule)}
                            className="p-1.5 rounded-lg text-slate-300 hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors cursor-pointer"
                            title="Chỉnh sửa Rule (Form / YAML)"
                          >
                            <Edit3 size={16} />
                          </button>

                          <button
                            onClick={() => handleDeleteRule(rule.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            title="Xóa Rule"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Add / Edit Rule Modal ───────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <Sliders size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">
                    {modalMode === 'create' ? 'Tạo Detection Rule Mới' : `Chỉnh Sửa Rule [${formData.id}]`}
                  </h2>
                  <p className="text-xs text-slate-400">
                    Tùy chỉnh thông số Rule engine qua Form trực quan hoặc nhập trực tiếp YAML Code
                  </p>
                </div>
              </div>

              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Tabs Switcher */}
            <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-800 bg-slate-950/30">
              <button
                type="button"
                onClick={() => handleTabSwitch('form')}
                className={`flex items-center gap-2 px-4 py-2 border-b-2 font-medium text-sm transition-colors cursor-pointer ${
                  editorTab === 'form'
                    ? 'border-cyan-500 text-cyan-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Edit3 size={15} />
                Form Giao Diện (UI)
              </button>

              <button
                type="button"
                onClick={() => handleTabSwitch('yaml')}
                className={`flex items-center gap-2 px-4 py-2 border-b-2 font-medium text-sm transition-colors cursor-pointer ${
                  editorTab === 'yaml'
                    ? 'border-cyan-500 text-cyan-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Code size={15} />
                Trình Chỉnh Sửa YAML
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveRule} className="flex-1 overflow-y-auto p-6 space-y-5">
              {editorTab === 'form' ? (
                <>
                  {/* Basic Metadata Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-mono text-slate-400 mb-1">Rule ID *</label>
                      <input
                        type="text"
                        required
                        disabled={modalMode === 'edit'}
                        value={formData.id}
                        onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-cyan-400 font-mono disabled:opacity-60"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-mono text-slate-400 mb-1">Tên Rule *</label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="VD: Phát hiện PowerShell thực thi mã độc"
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-mono text-slate-400 mb-1">Mức Độ (Severity) *</label>
                      <select
                        value={formData.severity}
                        onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200"
                      >
                        <option value="critical">Critical</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-mono text-slate-400 mb-1">Loại Event (Event Type) *</label>
                      <select
                        value={formData.event_type}
                        onChange={(e) => setFormData({ ...formData, event_type: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200"
                      >
                        <option value="sysmon_process_create">sysmon_process_create (Process Create)</option>
                        <option value="sysmon_network_connect">sysmon_network_connect (Network Connect)</option>
                        <option value="file_integrity">file_integrity (File Integrity)</option>
                        <option value="ddos_event">ddos_event (DDoS Detection)</option>
                        <option value="phishing_event">phishing_event (Phishing Detection)</option>
                        <option value="custom_event">custom_event (Khác / Custom)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-mono text-slate-400 mb-1">MITRE ATT&CK Tactic</label>
                      <input
                        type="text"
                        value={formData.mitre_tactic}
                        onChange={(e) => setFormData({ ...formData, mitre_tactic: e.target.value })}
                        placeholder="VD: Execution, Impact, Defense Evasion"
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-mono text-slate-400 mb-1">MITRE Technique ID</label>
                      <input
                        type="text"
                        value={formData.mitre_technique_id}
                        onChange={(e) => setFormData({ ...formData, mitre_technique_id: e.target.value })}
                        placeholder="VD: T1059.001, T1490"
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-slate-400 mb-1">Mô Tả Chi Tiết</label>
                    <textarea
                      rows={2}
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Mô tả mục đích phát hiện mối đe dọa..."
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 resize-none"
                    />
                  </div>

                  {/* Conditions Builder */}
                  <div className="border border-slate-800 rounded-xl p-4 bg-slate-950/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                        <Code size={16} className="text-cyan-400" />
                        Danh Sách Điều Kiện Match (AND Logic)
                      </h3>
                      <button
                        type="button"
                        onClick={handleAddCondition}
                        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 cursor-pointer"
                      >
                        <Plus size={14} /> Thêm Điều Kiện
                      </button>
                    </div>

                    {formData.conditions.map((cond, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800">
                        {/* Field */}
                        <div className="flex-1">
                          <input
                            type="text"
                            placeholder="Field (VD: process_name, command_line)"
                            value={cond.field || ''}
                            onChange={(e) => handleConditionChange(idx, 'field', e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-xs font-mono text-cyan-300"
                          />
                        </div>

                        {/* Operator */}
                        <div className="w-36">
                          <select
                            value={cond.operator || 'equals'}
                            onChange={(e) => handleConditionChange(idx, 'operator', e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-xs font-mono text-amber-400"
                          >
                            <option value="equals">equals</option>
                            <option value="not_equals">not_equals</option>
                            <option value="contains">contains</option>
                            <option value="contains_any">contains_any</option>
                            <option value="in">in</option>
                            <option value="starts_with">starts_with</option>
                            <option value="ends_with">ends_with</option>
                            <option value="regex">regex</option>
                          </select>
                        </div>

                        {/* Value */}
                        <div className="flex-1">
                          <input
                            type="text"
                            placeholder="Value (VD: powershell.exe hoặc -EncodedCommand)"
                            value={cond.value || ''}
                            onChange={(e) => handleConditionChange(idx, 'value', e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-xs font-mono text-emerald-300"
                          />
                        </div>

                        {/* Remove */}
                        {formData.conditions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveCondition(idx)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                /* YAML Editor Tab */
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Soạn thảo Rule cấu hình trực tiếp dưới dạng YAML syntax:</span>
                    <span className="font-mono text-cyan-400">configs/rules/*.yaml</span>
                  </div>

                  {yamlError && (
                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono">
                      ⚠️ {yamlError}
                    </div>
                  )}

                  <textarea
                    rows={16}
                    value={yamlText}
                    onChange={(e) => {
                      setYamlText(e.target.value);
                      setYamlError(null);
                    }}
                    className="w-full p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-emerald-400 focus:outline-none focus:border-cyan-500/50 leading-relaxed"
                  />
                </div>
              )}

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors cursor-pointer"
                >
                  Hủy
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {saving ? <Loader size={16} className="animate-spin" /> : <Check size={16} />}
                  Lưu Rule & Reload Engine
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
