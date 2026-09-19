// =============================================================================
// src/components/layout/Sidebar.jsx
// Collapsible sidebar navigation with 240px fixed width & mobile drawer overlay
// =============================================================================

import {
  Activity,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Cpu,
  LayoutDashboard,
  Shield,
  Sliders,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

const NAV_ITEMS = [
  {
    id: 'dashboard',
    label: 'Dashboard & SIEM',
    icon: LayoutDashboard,
    color: 'text-cyan-400',
  },
  {
    id: 'rules',
    label: 'Detection Rules',
    icon: Sliders,
    color: 'text-cyan-300',
  },
  {
    id: 'cases',
    label: 'Case Management',
    icon: BookOpen,
    color: 'text-purple-400',
  },
  {
    id: 'threats',
    label: 'Threat Intelligence',
    icon: Shield,
    color: 'text-orange-400',
  },
  {
    id: 'agents',
    label: 'Agents & EDR',
    icon: Cpu,
    color: 'text-green-400',
  },
  {
    id: 'audit',
    label: 'Audit & Settings',
    icon: Activity,
    color: 'text-blue-400',
  },
];

export default function Sidebar({ collapsed, setCollapsed, mobileOpen, onMobileClose }) {
  const { activeTab, setActiveTab, liveAlerts } = useApp();

  // Count new/unread alerts for badge
  const newAlertCount = liveAlerts.filter((a) => a.status === 'new').length;

  const handleNavClick = (id) => {
    setActiveTab(id);
    if (onMobileClose) onMobileClose();
  };

  const sidebarContent = (
    <aside
      className={`
        flex flex-col h-full transition-all duration-300 ease-in-out shrink-0 z-40
        ${mobileOpen ? 'fixed inset-y-0 left-0 w-[240px] shadow-2xl md:static' : 'relative'}
      `}
      style={{
        width: mobileOpen ? '240px' : collapsed ? '64px' : '240px',
        background: 'linear-gradient(180deg, #080c12 0%, #0d1117 100%)',
        borderRight: '1px solid #1e2a3a',
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center justify-between px-5 py-5 border-b shrink-0"
        style={{ borderColor: '#1e2a3a' }}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #00d4ff, #0ea5c9)' }}>
            <Shield size={16} className="text-gray-900" />
          </div>
          {(!collapsed || mobileOpen) && (
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-white leading-tight whitespace-nowrap">SOC Console</p>
              <p className="text-xs text-gray-500 whitespace-nowrap">v2.0 — Unified EDR</p>
            </div>
          )}
        </div>
        {mobileOpen && (
          <button onClick={onMobileClose} className="md:hidden text-gray-400 hover:text-white p-1">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="flex flex-col gap-1.5 px-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const showBadge = item.id === 'dashboard' && newAlertCount > 0;

            return (
              <li key={item.id}>
                <button
                  onClick={() => handleNavClick(item.id)}
                  title={collapsed && !mobileOpen ? item.label : undefined}
                  className={`
                    w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left
                    transition-all duration-150 relative group cursor-pointer
                    ${isActive
                      ? 'bg-cyan-500/10 text-white font-semibold'
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

                  {(!collapsed || mobileOpen) && (
                    <span className="text-sm font-medium truncate">{item.label}</span>
                  )}

                  {/* Alert badge */}
                  {showBadge && (!collapsed || mobileOpen) && (
                    <span className="ml-auto shrink-0 min-w-5 h-5 px-1.5 rounded-full text-xs font-bold flex items-center justify-center"
                      style={{ background: '#ef4444', color: 'white' }}>
                      {newAlertCount > 99 ? '99+' : newAlertCount}
                    </span>
                  )}
                  {showBadge && collapsed && !mobileOpen && (
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

      {/* Bottom: Collapse toggle (desktop / tablet only) */}
      <div className="hidden md:block p-4 border-t shrink-0" style={{ borderColor: '#1e2a3a' }}>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-white/5 transition-colors text-xs cursor-pointer"
        >
          {collapsed ? <ChevronRight size={14} /> : <><ChevronLeft size={14} /><span>Collapse</span></>}
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={onMobileClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden"
        />
      )}

      {/* Sidebar element for mobile drawer or standard desktop flex item */}
      <div className={`shrink-0 ${mobileOpen ? 'block' : 'hidden md:block'}`}>
        {sidebarContent}
      </div>
    </>
  );
}
