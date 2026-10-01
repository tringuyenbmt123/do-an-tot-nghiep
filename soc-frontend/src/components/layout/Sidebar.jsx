// ==============================================================
// src/components/layout/Sidebar.jsx
// ==============================================================
import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Bell, FolderOpen, Activity, Shield, AlertTriangle,
  BookOpen, Server, Flame, FileText, Settings, LogOut, ChevronDown, ChevronRight,
  Bug, Grid, TerminalSquare, BarChart2
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const NAV = [
  {
    group: 'Giám sát',
    items: [
      { to: '/',         icon: LayoutDashboard, label: 'Tổng quan' },
      { to: '/alerts',   icon: Bell,            label: 'Cảnh báo',   badge: true },
      { to: '/cases',    icon: FolderOpen,      label: 'Sự cố' },
      { to: '/siem',     icon: FileText,        label: 'Nhật ký (SIEM)' },
    ]
  },
  {
    group: 'Phân tích',
    items: [
      { to: '/agents',    icon: Activity,       label: 'Agents & EDR' },
      { to: '/intel',     icon: Shield,         label: 'Threat Intel' },
      { to: '/rules',     icon: AlertTriangle,  label: 'Detection Rules' },
      { to: '/mitre',     icon: Grid,           label: 'MITRE ATT&CK' },
      { to: '/vulns',     icon: Bug,            label: 'Lỗ hổng' },
      { to: '/assets',    icon: Server,         label: 'Tài sản & Endpoint' },
      { to: '/firewall',  icon: Flame,          label: 'Firewall / IDS' },
    ]
  },
  {
    group: 'Quản trị',
    items: [
      { to: '/playbooks', icon: TerminalSquare, label: 'Playbook' },
      { to: '/reports',   icon: BarChart2,      label: 'Báo cáo' },
      { to: '/audit',     icon: Settings,       label: 'Audit & Settings' },
    ]
  },
]

export default function Sidebar({ open, alertCount = 0, onClose }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  
  // Accordion state - all open by default
  const [expanded, setExpanded] = useState({
    'Giám sát': true,
    'Phân tích': true,
    'Quản trị': true
  })

  const toggleGroup = (group) => {
    setExpanded(prev => ({ ...prev, [group]: !prev[group] }))
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
            zIndex: 499, display: 'none'
          }}
          className="mobile-overlay"
          onClick={onClose}
        />
      )}
      <aside className={`sidebar${open ? ' open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <span>SOC Console</span>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          {NAV.map(g => (
            <div key={g.group} style={{ marginBottom: 4 }}>
              <button 
                onClick={() => toggleGroup(g.group)}
                style={{
                  display: 'flex', alignItems: 'center', width: '100%',
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '12px 20px 4px', color: 'var(--muted)',
                  fontSize: 12, fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: '1px', gap: 6
                }}
                aria-expanded={expanded[g.group]}
              >
                {expanded[g.group] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {g.group}
              </button>
              
              <div style={{
                display: expanded[g.group] ? 'block' : 'none',
                overflow: 'hidden',
                transition: 'all 0.3s'
              }}>
                {g.items.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                    onClick={onClose}
                    style={{ paddingLeft: 40 }} // indent slightly for nested look
                  >
                    <item.icon size={16} />
                    <span>{item.label}</span>
                    {item.badge && alertCount > 0 && (
                      <span className="badge-count">{alertCount > 99 ? '99+' : alertCount}</span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer – user info */}
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sidebar-username">{user?.username || 'Admin'}</div>
              <div className="sidebar-role">{user?.role || 'analyst'}</div>
            </div>
            <button
              onClick={handleLogout}
              title="Đăng xuất"
              style={{ color: 'var(--muted)', padding: '4px' }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
