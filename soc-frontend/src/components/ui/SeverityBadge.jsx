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
  '1':      { cls: 's-crit', label: 'Nghiêm trọng' },
  '2':      { cls: 's-high', label: 'Cao' },
  '3':      { cls: 's-med',  label: 'Trung bình' },
  '4':      { cls: 's-low',  label: 'Thấp' },
}

export default function SeverityBadge({ value }) {
  const key = String(value ?? '').toLowerCase().trim()
  const { cls, label } = MAP[key] || { cls: 's-info', label: value || '—' }
  return <span className={`sev ${cls}`}>{label}</span>
}
