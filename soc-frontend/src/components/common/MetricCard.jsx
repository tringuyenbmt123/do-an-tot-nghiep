// =============================================================================
// src/components/common/MetricCard.jsx
// FIX: padding trong card, nhãn không còn dính viền / bị bo góc cắt chữ.
// Số liệu dùng tabular-nums để không nhảy layout khi cập nhật realtime.
// =============================================================================

const PALETTE = {
  cyan: { text: '#06b6d4', rgb: '6,182,212' },
  red: { text: '#ff3366', rgb: '255,51,102' },
  green: { text: '#10b981', rgb: '16,185,129' },
  orange: { text: '#ff9900', rgb: '255,153,0' },
  blue: { text: '#3b82f6', rgb: '59,130,246' },
  purple: { text: '#a855f7', rgb: '168,85,247' },
};

export default function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'cyan',
  loading = false,
}) {
  const c = PALETTE[color] ?? PALETTE.cyan;

  return (
    <div
      className="soc-card min-w-0"
      style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}
    >
      {/* hàng trên: nhãn + icon */}
      <div className="flex items-start justify-between gap-3 min-w-0">
        <p
          className="truncate"
          style={{
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            /* #9CA3AF theo spec — tăng tương phản so với nền đen */
            color: '#9CA3AF',
            lineHeight: 1.45,
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
          title={title}
        >
          {title}
        </p>

        {Icon && (
          <span
            className="flex items-center justify-center flex-shrink-0"
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '9px',
              background: `rgba(${c.rgb},0.1)`,
              border: `1px solid rgba(${c.rgb},0.22)`,
            }}
          >
            <Icon size={15} style={{ color: c.text }} />
          </span>
        )}
      </div>

      {/* số liệu */}
      {loading ? (
        <div
          style={{
            height: '34px',
            width: '58%',
            borderRadius: '8px',
            background: 'linear-gradient(90deg,#131c2e,#1c2840,#131c2e)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.3s linear infinite',
          }}
        />
      ) : (
        <p
          className="truncate"
          style={{
            /* số to và đậm hơn theo spec: 34px, font-weight 800 */
            fontSize: '34px',
            lineHeight: '40px',
            fontWeight: 800,
            color: c.text,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.02em',
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          {value ?? '—'}
        </p>
      )}

      {/* mô tả phụ */}
      {subtitle && (
        <p
          className="truncate"
          style={{
            fontSize: '12px',
            lineHeight: '18px',
            /* mỏng hơn (300) và dùng #9CA3AF theo spec */
            fontWeight: 300,
            color: '#9CA3AF',
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
          title={subtitle}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}