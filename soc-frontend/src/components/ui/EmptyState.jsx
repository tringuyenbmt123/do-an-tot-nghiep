// ==============================================================
// src/components/ui/EmptyState.jsx
// ==============================================================
import React from 'react'
import { Inbox } from 'lucide-react'

export default function EmptyState({ message = 'Không có dữ liệu', sub, action }) {
  return (
    <div className="empty">
      <Inbox />
      <p>{message}</p>
      {sub && <small>{sub}</small>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  )
}
