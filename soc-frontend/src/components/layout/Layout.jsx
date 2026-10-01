// ==============================================================
// src/components/layout/Layout.jsx
// Main layout shell wrapping sidebar + topbar + main
// ==============================================================
import React, { useState, useCallback, useRef } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import { useWebSocket } from '../../hooks/useWebSocket'
import { useToast } from '../../contexts/ToastContext'

export default function Layout({ children, title = 'SOC Console' }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [alertBadge, setAlertBadge] = useState(0)
  const toast = useToast()

  const handleWsMessage = useCallback((data) => {
    if (data.type === 'alert' || data.severity) {
      setAlertBadge(n => n + 1)
      const sev = data.severity || ''
      if (['critical', 'high'].includes(sev)) {
        toast.error(`🚨 Cảnh báo ${sev.toUpperCase()}: ${data.title || data.event_type || 'Alert mới'}`)
      }
    }
  }, [toast])

  const { status: wsStatus } = useWebSocket(handleWsMessage)

  const toggleSidebar = useCallback(() => setSidebarOpen(v => !v), [])
  const closeSidebar  = useCallback(() => setSidebarOpen(false), [])

  return (
    <div className="shell">
      <Sidebar open={sidebarOpen} alertCount={alertBadge} onClose={closeSidebar} />
      <Topbar title={title} onMenuToggle={toggleSidebar} wsStatus={wsStatus} />
      <main>
        {children}
      </main>
    </div>
  )
}
