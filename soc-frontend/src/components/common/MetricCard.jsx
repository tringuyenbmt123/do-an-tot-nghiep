// src/components/common/MetricCard.jsx
// Enterprise-grade Metric Card — Cyberpunk v2
import { TrendingDown, TrendingUp } from 'lucide-react';

export default function MetricCard({ title, value, icon: Icon, color = 'cyan', trend, trendLabel, subtitle, loading }) {
  const colorMap = {
    cyan:   {
      text: '#06b6d4', bg: 'rgba(6,182,212,0.08)', border: 'rgba(6,182,212,0.2)',
      glow: '0 0 30px rgba(6,182,212,0.12)', grad: 'linear-gradient(135deg,rgba(6,182,212,0.15),rgba(6,182,212,0.03))'
    },
    red:    {
      text: '#ff3366', bg: 'rgba(255,51,102,0.08)', border: 'rgba(255,51,102,0.2)',
      glow: '0 0 30px rgba(255,51,102,0.12)', grad: 'linear-gradient(135deg,rgba(255,51,102,0.15),rgba(255,51,102,0.03))'
    },
    green:  {
      text: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)',
      glow: '0 0 30px rgba(16,185,129,0.12)', grad: 'linear-gradient(135deg,rgba(16,185,129,0.15),rgba(16,185,129,0.03))'
    },
    orange: {
      text: '#ff9900', bg: 'rgba(255,153,0,0.08)', border: 'rgba(255,153,0,0.2)',
      glow: '0 0 30px rgba(255,153,0,0.12)', grad: 'linear-gradient(135deg,rgba(255,153,0,0.15),rgba(255,153,0,0.03))'
    },
    blue:   {
      text: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)',
      glow: '0 0 30px rgba(59,130,246,0.12)', grad: 'linear-gradient(135deg,rgba(59,130,246,0.15),rgba(59,130,246,0.03))'
    },
  };

  const c = colorMap[color] || colorMap.cyan;

  if (loading) {
    return (
      <div className="soc-card p-5 flex flex-col gap-3">
        <div className="skeleton h-3 w-24 rounded" />
        <div className="skeleton h-9 w-20 rounded" />
        <div className="skeleton h-3 w-32 rounded" />
      </div>
    );
  }

  const isAlertCard = color === 'red'; // red alerts trending up = bad
  const trendUp     = trend != null && trend > 0;

  return (
    <div
      className="soc-card p-5 relative overflow-hidden cursor-default"
      style={{ boxShadow: `0 2px 12px rgba(0,0,0,0.3)` }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = c.glow; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.3)'; }}
    >
      {/* Background accent strip */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `linear-gradient(135deg, ${c.bg} 0%, transparent 60%)` }}
      />

      {/* Top row: label + icon */}
      <div className="relative flex items-start justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-[0.1em]" style={{ color: '#64748b' }}>
          {title}
        </p>
        {Icon && (
          <div
            className="rounded-xl p-2.5 flex items-center justify-center"
            style={{ background: c.grad, border: `1px solid ${c.border}` }}
          >
            <Icon size={16} style={{ color: c.text }} />
          </div>
        )}
      </div>

      {/* Value + Trend */}
      <div className="relative flex items-end gap-3 mb-1">
        <span className="text-3xl font-bold tracking-tight leading-none" style={{ color: c.text, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          {value ?? '—'}
        </span>
        {trend != null && (
          <div
            className="flex items-center gap-1 text-[11px] font-semibold mb-0.5 px-1.5 py-0.5 rounded-md"
            style={{
              color:      trendUp ? (isAlertCard ? '#ff3366' : '#10b981') : (isAlertCard ? '#10b981' : '#ff3366'),
              background: trendUp ? (isAlertCard ? 'rgba(255,51,102,0.12)' : 'rgba(16,185,129,0.12)') : (isAlertCard ? 'rgba(16,185,129,0.12)' : 'rgba(255,51,102,0.12)'),
            }}
          >
            {trendUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>

      {/* Subtitle */}
      {subtitle && (
        <p className="relative text-xs" style={{ color: '#64748b' }}>{subtitle}</p>
      )}
      {trendLabel && (
        <p className="relative text-[11px] mt-0.5" style={{ color: '#475569' }}>{trendLabel}</p>
      )}

      {/* Bottom accent line */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, ${c.text}40, transparent)` }}
      />
    </div>
  );
}
