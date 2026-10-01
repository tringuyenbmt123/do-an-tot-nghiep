// ==============================================================
// src/components/ui/Pagination.jsx
// ==============================================================
import React from 'react'

export default function Pagination({ page, total, pageSize = 50, onChange }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to   = Math.min(page * pageSize, total)

  return (
    <div className="pagination">
      <span className="pagination-info">
        {total === 0 ? 'Không có dữ liệu' : `${from}–${to} / ${total} mục`}
      </span>
      <div className="pagination-btns">
        <button
          className="pg-btn"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Trang trước"
        >‹</button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          let p
          if (totalPages <= 5) {
            p = i + 1
          } else if (page <= 3) {
            p = i + 1
          } else if (page >= totalPages - 2) {
            p = totalPages - 4 + i
          } else {
            p = page - 2 + i
          }
          return (
            <button
              key={p}
              className={`pg-btn${p === page ? ' on' : ''}`}
              onClick={() => onChange(p)}
            >{p}</button>
          )
        })}
        <button
          className="pg-btn"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          aria-label="Trang sau"
        >›</button>
      </div>
    </div>
  )
}
