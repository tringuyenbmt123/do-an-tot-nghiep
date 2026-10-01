// ==============================================================
// src/components/layout/Topbar.jsx
// ==============================================================
import React, { useState, useEffect } from 'react'
import { Menu, Sun, Moon, Wifi, WifiOff } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'

export default function Topbar({ title, onMenuToggle, wsStatus }) {
  const { isDark, toggle } = useTheme()
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const fmt = (d) =>
    d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <header className="topbar">
      <button className="topbar-hamburger" onClick={onMenuToggle} aria-label="Mở menu">
        <Menu size={20} />
      </button>

      <span className="topbar-title">{title}</span>

      <div className="topbar-spacer" />

      {/* WS Status */}
      <div className="ws-status" title={`WebSocket: ${wsStatus}`}>
        <span className={`ws-dot${wsStatus === 'connected' ? ' connected' : wsStatus === 'error' ? ' error' : ''}`} />
        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
          {wsStatus === 'connected' ? 'Realtime' : 'Offline'}
        </span>
      </div>

      {/* Clock */}
      <span className="topbar-clock">{fmt(time)}</span>

      {/* Theme toggle */}
      <button className="theme-btn" onClick={toggle} aria-label="Chuyển theme" title={isDark ? 'Chế độ sáng' : 'Chế độ tối'}>
        {isDark ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    </header>
  )
}
