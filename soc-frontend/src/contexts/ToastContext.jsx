// ==============================================================
// src/contexts/ToastContext.jsx
// Simple toast notification system
// ==============================================================
import React, { createContext, useContext, useState, useCallback } from 'react'

const ToastContext = createContext(null)

let _id = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const add = useCallback((msg, type = 'info', duration = 3500) => {
    const id = ++_id
    setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration)
  }, [])

  const toast = {
    success: (m) => add(m, 'success'),
    error:   (m) => add(m, 'error', 5000),
    warn:    (m) => add(m, 'warn'),
    info:    (m) => add(m, 'info'),
  }

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span>
              {t.type === 'success' && '✓ '}
              {t.type === 'error'   && '✕ '}
              {t.type === 'warn'    && '⚠ '}
              {t.type === 'info'    && 'ℹ '}
            </span>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be inside ToastProvider')
  return ctx
}
