// ==============================================================
// src/components/ui/StatusBadge.jsx
// ==============================================================
import React from 'react'

const MAP = {
  new:       { cls: 'b',  label: 'Mới' },
  ack:       { cls: 'c',  label: 'Đã nhận' },
  progress:  { cls: 'c',  label: 'Đang xử lý' },
  pending:   { cls: 'c',  label: 'Chờ xử lý' },
  closed:    { cls: 'd',  label: 'Đóng' },
  fp:        { cls: 'd',  label: 'False Positive' },
  online:    { cls: 'a',  label: 'Online' },
  offline:   { cls: 'd',  label: 'Offline' },
  open:      { cls: 'b',  label: 'Mở' },
  patching:  { cls: 'c',  label: 'Vá lỗi' },
  fixed:     { cls: 'a',  label: 'Đã vá' },
  accepted:  { cls: 'd',  label: 'Chấp nhận' },
  active:    { cls: 'a',  label: 'Hoạt động' },
  disabled:  { cls: 'd',  label: 'Tắt' },
  queued:    { cls: 'c',  label: 'Xếp hàng' },
  sent:      { cls: 'b',  label: 'Đã gửi' },
  done:      { cls: 'a',  label: 'Hoàn tất' },
  failed:    { cls: 'e',  label: 'Thất bại' },
}

export default function StatusBadge({ value }) {
  const key = (value || '').toLowerCase()
  const { cls, label } = MAP[key] || { cls: 'd', label: value || '—' }
  return <span className={`stt ${cls}`}>{label}</span>
}
