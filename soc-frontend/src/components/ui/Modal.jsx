// ==============================================================
// src/components/ui/Modal.jsx
// ==============================================================
import React, { useEffect } from 'react'

export default function Modal({ open, onClose, title, children, footer, size = '' }) {
  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className={`modal${size ? ` modal-${size}` : ''}`} role="dialog" aria-modal="true">
        <div className="dh">
          <h3>{title}</h3>
          <button className="dh-close" onClick={onClose} aria-label="Đóng">×</button>
        </div>
        <div className="db">{children}</div>
        {footer && <div className="df">{footer}</div>}
      </div>
    </div>
  )
}
