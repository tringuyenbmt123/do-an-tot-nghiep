// ==============================================================
// src/contexts/ToastContext.jsx
// Simple toast notification system – stable references to prevent
// infinite re-render loops when used in useCallback dependencies
// ==============================================================
import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react'

const ToastContext = createContext(null)

let _id = 0
const MAX_TOASTS = 5 // Tối đa 5 toast cùng lúc

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const add = useCallback((msg, type = 'info', duration = 3500) => {
    const id = ++_id
    setToasts(t => {
      // Nếu đã đạt giới hạn thì xóa cái cũ nhất trước khi thêm
      const trimmed = t.length >= MAX_TOASTS ? t.slice(t.length - MAX_TOASTS + 1) : t
      return [...trimmed, { id, msg, type }]
    })
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration)
  }, [])

  // useMemo so the toast object reference stays stable across renders
  // This prevents useCallback hooks in consumers (e.g. Dashboard, Layout)
  // from being invalidated on every toast state update, which caused
  // an infinite refresh loop.
  const toast = useMemo(() => ({
    success: (m) => add(m, 'success'),
    error:   (m) => add(m, 'error', 5000),
    warn:    (m) => add(m, 'warn'),
    info:    (m) => add(m, 'info'),
  }), [add])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <ToastItem key={t.id} t={t} onRemove={(id) => setToasts(ts => ts.filter(x => x.id !== id))} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// Tách component riêng để có nút đóng và animation exit
function ToastItem({ t, onRemove }) {
  return (
    <div className={`toast ${t.type}`} role="alert">
      <span className="toast-msg">{t.msg}</span>
      <button
        className="toast-close"
        onClick={() => onRemove(t.id)}
        aria-label="Đóng thông báo"
      >×</button>
    </div>
  )
}

export const useToast = () => {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be inside ToastProvider')
  return ctx
}
