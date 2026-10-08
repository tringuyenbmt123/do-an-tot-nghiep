// ==============================================================
// src/components/layout/Layout.jsx
// Main layout shell wrapping sidebar + topbar + main
// Dùng WebSocketContext singleton – không tự tạo WS riêng nữa
// ==============================================================
import React, { useState, useCallback, useEffect, useRef } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import { useWebSocketContext } from '../../contexts/WebSocketContext'
import { useToast } from '../../contexts/ToastContext'

export default function Layout({ children, title = 'SOC Console' }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [alertBadge, setAlertBadge] = useState(0)
  const toast = useToast()
  const { status: wsStatus, subscribe } = useWebSocketContext()

  // Ref để handler không tạo lại mỗi render
  const toastRef = useRef(toast)
  toastRef.current = toast

  // Dedup: tránh hiện cùng 1 alert 2 lần trong 15s
  const shownAlertsRef = useRef(new Set())

  useEffect(() => {
    const handleWsMessage = (data) => {
      const alertData = data?.payload || data
      const isAlert =
        data?.type === 'new_alert' ||
        data?.type === 'alert' ||
        !!alertData?.severity ||
        !!alertData?.event_type

      if (!isAlert || !alertData) return

      const alertId = alertData.id || `${alertData.title}-${alertData.created_at}`
      if (shownAlertsRef.current.has(alertId)) return

      shownAlertsRef.current.add(alertId)
      setTimeout(() => shownAlertsRef.current?.delete(alertId), 15000)

      setAlertBadge(n => n + 1)
      const sev = (alertData.severity || 'high').toLowerCase()
      const title = alertData.title || alertData.event_type || 'Cảnh báo mới'
      const hostname = alertData.agent?.hostname || alertData.hostname || ''
      const text = ` [${sev.toUpperCase()}] ${title}${hostname ? ` (${hostname})` : ''}`

      if (['critical', 'high'].includes(sev)) {
        toastRef.current.error(text)
      } else if (sev === 'medium') {
        toastRef.current.warn(text)
      } else {
        toastRef.current.info(text)
      }

      // Phát event để Dashboard / Alerts cập nhật ngầm
      window.dispatchEvent(new CustomEvent('soc:new_alert', { detail: alertData }))
    }

    // subscribe trả về hàm unsubscribe → tự động cleanup khi component unmount
    const unsubscribe = subscribe(handleWsMessage)
    return unsubscribe
  }, [subscribe]) // subscribe là stable ref, chỉ đăng ký 1 lần

  const toggleSidebar = useCallback(() => setSidebarOpen(v => !v), [])
  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

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
