// ==============================================================
// src/utils/date.js - Timezone-aware date parser & formatter
// Xử lý chuẩn UTC từ backend và hiển thị theo giờ Việt Nam
// ==============================================================

export const parseDate = (ts) => {
  if (!ts) return null
  if (ts instanceof Date) return ts
  let s = String(ts).trim()
  if (!s) return null

  // Nếu chuỗi ISO chưa có chỉ định timezone (không có Z và không có +/- offset)
  // thì thêm Z để JS parse đúng theo chuẩn UTC từ Database
  if (!s.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(s)) {
    s = s.replace(' ', 'T') + 'Z'
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

export const formatDateTime = (ts) => {
  const d = parseDate(ts)
  if (!d) return '—'
  return d.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export const formatTime = (ts) => {
  const d = parseDate(ts)
  if (!d) return '—'
  return d.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export const ago = (ts) => {
  const d = parseDate(ts)
  if (!d) return '—'
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diffSec < 5) return 'Vừa xong'
  if (diffSec < 60) return `${diffSec}s trước`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}p trước`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h trước`
  return `${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
}
