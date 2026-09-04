// src/components/layout/ToastContainer.jsx
// Real-time notification popups (bottom-right corner)
import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';

const SEVERITY_CONFIG = {
  critical: { icon: AlertCircle,   bg: 'bg-red-900/90',    border: 'border-red-500/50',    text: 'text-red-200',   iconCls: 'text-red-400', label: 'CRITICAL' },
  high:     { icon: AlertTriangle, bg: 'bg-orange-900/90', border: 'border-orange-500/50', text: 'text-orange-200',iconCls: 'text-orange-400', label: 'HIGH' },
  medium:   { icon: AlertTriangle, bg: 'bg-yellow-900/90', border: 'border-yellow-500/50', text: 'text-yellow-200',iconCls: 'text-yellow-400', label: 'MEDIUM' },
  low:      { icon: Info,          bg: 'bg-blue-900/90',   border: 'border-blue-500/50',   text: 'text-blue-200',  iconCls: 'text-blue-400', label: 'LOW' },
  success:  { icon: CheckCircle,   bg: 'bg-green-900/90',  border: 'border-green-500/50',  text: 'text-green-200', iconCls: 'text-green-400', label: 'OK' },
  info:     { icon: Info,          bg: 'bg-gray-800/90',   border: 'border-gray-600/50',   text: 'text-gray-200',  iconCls: 'text-gray-400', label: 'INFO' },
};

function Toast({ toast, onDismiss }) {
  const cfg = SEVERITY_CONFIG[toast.severity] || SEVERITY_CONFIG.info;
  const Icon = cfg.icon;

  return (
    <div
      className={`
        animate-slide-in flex gap-3 items-start p-4 rounded-xl border backdrop-blur-md
        shadow-2xl min-w-[300px] max-w-[380px] cursor-pointer
        ${cfg.bg} ${cfg.border}
      `}
      onClick={() => onDismiss(toast.id)}
      style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
    >
      <Icon size={18} className={`shrink-0 mt-0.5 ${cfg.iconCls}`} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-xs font-bold tracking-widest ${cfg.iconCls}`}>{cfg.label}</span>
          <span className="text-xs text-gray-600">
            {new Date(toast.timestamp).toLocaleTimeString('en-GB')}
          </span>
        </div>
        <p className={`text-sm font-medium leading-snug ${cfg.text} truncate`}>{toast.title}</p>
        {toast.message && (
          <p className="text-xs text-gray-400 mt-0.5 truncate">{toast.message}</p>
        )}
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(toast.id); }}
        className="shrink-0 p-0.5 rounded text-gray-500 hover:text-gray-200 transition-colors"
      >
        <X size={13} />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex flex-col-reverse gap-3"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={removeToast} />
      ))}
    </div>
  );
}
