// src/components/common/StatusBadge.jsx
export default function StatusBadge({ status, type = 'alert' }) {
  const alertMap = {
    new:            { label: 'New',           cls: 'bg-blue-900/50 text-blue-400 border border-blue-700/50' },
    in_progress:    { label: 'In Progress',   cls: 'bg-yellow-900/50 text-yellow-400 border border-yellow-700/50' },
    resolved:       { label: 'Resolved',      cls: 'bg-green-900/50 text-green-400 border border-green-700/50' },
    false_positive: { label: 'False Positive',cls: 'bg-gray-800 text-gray-400 border border-gray-700' },
    escalated:      { label: 'Escalated',     cls: 'bg-purple-900/50 text-purple-400 border border-purple-700/50' },
  };

  const caseMap = {
    New:        { label: 'New',         cls: 'bg-blue-900/50 text-blue-400 border border-blue-700/50' },
    InProgress: { label: 'In Progress', cls: 'bg-yellow-900/50 text-yellow-400 border border-yellow-700/50' },
    Closed:     { label: 'Closed',      cls: 'bg-green-900/50 text-green-400 border border-green-700/50' },
    Rejected:   { label: 'Rejected',    cls: 'bg-gray-800 text-gray-400 border border-gray-700' },
  };

  const soarMap = {
    pending:      { label: 'Pending',      cls: 'bg-gray-800 text-gray-400 border border-gray-700' },
    ai_analyzing: { label: 'AI Analyzing', cls: 'bg-cyan-900/50 text-cyan-400 border border-cyan-700/50' },
    human_review: { label: 'HITL Review',  cls: 'bg-orange-900/50 text-orange-400 border border-orange-700/50' },
    completed:    { label: 'Completed',    cls: 'bg-green-900/50 text-green-400 border border-green-700/50' },
  };

  const map = type === 'case' ? caseMap : type === 'soar' ? soarMap : alertMap;
  const cfg = map[status] || { label: status || '—', cls: 'bg-gray-800 text-gray-500 border border-gray-700' };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}
