// =============================================================================
// src/components/layout/Sidebar.jsx
// Collapsible sidebar navigation with 5 main tabs
// =============================================================================

import {
  Activity,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Cpu,
  LayoutDashboard,
  Shield,
} from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../../context/AppContext';

const NAV_ITEMS = [
  {
    id:      'dashboard',
    label:   'Dashboard & SIEM',
    icon:    LayoutDashboard,
    color:   'text-cyan-400',
    badge:   null,
  },
  {
    id:      'cases',
    label:   'Case Management',
    icon:    BookOpen,
    color:   'text-purple-400',
    badge:   null,
  },
  {
    id:      'threats',
    label:   'Threat Intelligence',
    icon:    Shield,
    color:   'text-orange-400',
    badge:   null,
  },
  {
    id:      'agents',
    label:   'Agents & EDR',
    icon:    Cpu,
    color:   'text-green-400',
    badge:   null,
  },
  {
    id:      'audit',
    label:   'Audit & Settings',
    icon:    Activity,
    color:   'text-blue-400',
    badge:   null,
  },
];

export default function Sidebar() {
  const { activeTab, setActiveTab, liveAlerts } = useApp();
  const [collapsed, setCollapsed] = useState(false);

  // Count new/unread alerts for badge
  const newAlertCount = liveAlerts.filter((a) => a.status === 'new').length;

  return (
    <aside
      className="flex flex-col h-full transition-all duration-300 ease-in-out shrink-0"
      style={{
        width:      collapsed ? '64px' : '220px',
        background: 'linear-gradient(180deg, #080c12 0%, #0d1117 100%)',
        borderRight:'1px solid #1e2a3a',
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-4 py-5 border-b shrink-0"
        style={{ borderColor: '#1e2a3a' }}
      >
        <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #00d4ff, #0ea5c9)' }}>
          <Shield size={16} className="text-gray-900" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="text-sm font-bold text-white leading-tight whitespace-nowrap">SOC Console</p>
            <p className="text-xs text-gray-500 whitespace-nowrap">v2.0 — Unified EDR</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-hidden">
        <ul className="flex flex-col gap-1 px-2">
          {NAV_ITEMS.map((item) => {
            const Icon    = item.icon;
            const isActive = activeTab === item.id;
            const showBadge = item.id === 'dashboard' && newAlertCount > 0;

            return (
              <li key={item.id}>
                <button
                  onClick={() => setActiveTab(item.id)}
                  title={collapsed ? item.label : undefined}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left
                    transition-all duration-150 relative group
                    ${isActive
                      ? 'bg-cyan-500/10 text-white'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                    }
                  `}
                >
                  {/* Active indicator bar */}
                  {isActive && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                      style={{ background: '#00d4ff' }}
                    />
                  )}

                  <Icon
                    size={18}
                    className={`shrink-0 ${isActive ? item.color : 'text-gray-500 group-hover:text-gray-300'}`}
                  />

                  {!collapsed && (
                    <span className="text-sm font-medium truncate">{item.label}</span>
                  )}

                  {/* Alert badge */}
                  {showBadge && !collapsed && (
                    <span className="ml-auto shrink-0 min-w-5 h-5 px-1.5 rounded-full text-xs font-bold flex items-center justify-center"
                      style={{ background: '#ef4444', color: 'white' }}>
                      {newAlertCount > 99 ? '99+' : newAlertCount}
                    </span>
                  )}
                  {showBadge && collapsed && (
                    <span
                      className="absolute top-1 right-1 w-2 h-2 rounded-full animate-blink"
                      style={{ background: '#ef4444' }}
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom: Collapse toggle */}
      <div className="p-3 border-t" style={{ borderColor: '#1e2a3a' }}>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-white/5 transition-colors text-xs"
        >
          {collapsed ? <ChevronRight size={14} /> : <><ChevronLeft size={14} /><span>Collapse</span></>}
        </button>
      </div>
    </aside>
  );
}
