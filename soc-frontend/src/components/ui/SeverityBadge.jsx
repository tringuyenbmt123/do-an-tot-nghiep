// ==============================================================
// src/components/ui/SeverityBadge.jsx
// ==============================================================
import React from 'react'

const MAP = {
  critical: { cls: 's-crit', label: 'Nghiêm trọng' },
  crit:     { cls: 's-crit', label: 'Nghiêm trọng' },
  high:     { cls: 's-high', label: 'Cao' },
  medium:   { cls: 's-med',  label: 'Trung bình' },
  med:      { cls: 's-med',  label: 'Trung bình' },
  low:      { cls: 's-low',  label: 'Thấp' },
  info:     { cls: 's-info', label: 'Thông tin' },
}

export default function SeverityBadge({ value }) {
  const key = (value || '').toLowerCase()
  const { cls, label } = MAP[key] || { cls: 's-info', label: value || '—' }
  return <span className={`sev ${cls}`}>{label}</span>
}
