// src/components/common/SeverityBadge.jsx
export default function SeverityBadge({ severity }) {
  const map = {
    critical: { label: 'Critical', cls: 'bg-red-900/50 text-red-400 border border-red-700/50',     dot: 'bg-red-400' },
    high:     { label: 'High',     cls: 'bg-orange-900/50 text-orange-400 border border-orange-700/50', dot: 'bg-orange-400' },
    medium:   { label: 'Medium',   cls: 'bg-yellow-900/50 text-yellow-400 border border-yellow-700/50', dot: 'bg-yellow-400' },
    low:      { label: 'Low',      cls: 'bg-green-900/50 text-green-400 border border-green-700/50',  dot: 'bg-green-400' },
    // numeric
    1:        { label: 'Critical', cls: 'bg-red-900/50 text-red-400 border border-red-700/50',     dot: 'bg-red-400' },
    2:        { label: 'High',     cls: 'bg-orange-900/50 text-orange-400 border border-orange-700/50', dot: 'bg-orange-400' },
    3:        { label: 'Medium',   cls: 'bg-yellow-900/50 text-yellow-400 border border-yellow-700/50', dot: 'bg-yellow-400' },
    4:        { label: 'Low',      cls: 'bg-green-900/50 text-green-400 border border-green-700/50',  dot: 'bg-green-400' },
  };

  const key = typeof severity === 'number' ? severity : (severity || '').toLowerCase();
  const cfg = map[key] || { label: severity || 'Unknown', cls: 'bg-gray-800 text-gray-400 border border-gray-700', dot: 'bg-gray-400' };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
