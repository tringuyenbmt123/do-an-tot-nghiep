// =============================================================================
// src/components/layout/Sidebar.jsx
// Collapsible sidebar navigation with 240px fixed width & mobile drawer overlay
// v2.1 — Upgraded: Inter font, 8px border-radius, 12px icon-text gap,
//         4px cyan left-border active indicator, smooth hover transitions
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
    activeColor: '#22d3ee',
  },
  {
    id: 'rules',
    label: 'Detection Rules',
    icon: Sliders,
    activeColor: '#67e8f9',
  },
  {
    id: 'cases',
    label: 'Case Management',
    icon: BookOpen,
    activeColor: '#c084fc',
  },
  {
    id: 'threats',
    label: 'Threat Intelligence',
    icon: Shield,
    activeColor: '#fb923c',
  },
  {
    id: 'agents',
    label: 'Agents & EDR',
    icon: Cpu,
    activeColor: '#4ade80',
  },
  {
    id: 'audit',
    label: 'Audit & Settings',
    icon: Activity,
    activeColor: '#60a5fa',
  },
];

export default function Sidebar({ collapsed, setCollapsed, mobileOpen, onMobileClose }) {
  const { activeTab, setActiveTab, liveAlerts } = useApp();

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
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center justify-between px-5 shrink-0"
        style={{ borderBottom: '1px solid #1e2a3a', paddingTop: '22px', paddingBottom: '22px' }}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <div
            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #00d4ff, #0ea5c9)' }}
          >
            <Shield size={16} className="text-gray-900" />
          </div>
          {(!collapsed || mobileOpen) && (
            <div className="overflow-hidden">
              <p
                className="leading-tight whitespace-nowrap"
                style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc', fontFamily: "'Inter', sans-serif" }}
              >
                SOC Console
              </p>
              <p
                className="whitespace-nowrap"
                style={{ fontSize: '11px', fontWeight: 400, color: '#4b5563', fontFamily: "'Inter', sans-serif", marginTop: '2px' }}
              >
                v2.0 — Unified EDR
              </p>
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
      <nav className="flex-1 overflow-y-auto" style={{ paddingTop: '10px', paddingBottom: '10px' }}>
        <ul
          style={{
            listStyle: 'none',
            padding: '0 10px',
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            /* khoảng cách dọc thoáng: 6px giữa mỗi tab */
            gap: '6px',
          }}
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const showBadge = item.id === 'dashboard' && newAlertCount > 0;

            return (
              <li key={item.id}>
                <button
                  onClick={() => handleNavClick(item.id)}
                  title={collapsed && !mobileOpen ? item.label : undefined}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    /* 12px gap giữa icon và chữ theo spec */
                    gap: '12px',
                    padding: collapsed && !mobileOpen ? '11px 0' : '11px 14px',
                    justifyContent: collapsed && !mobileOpen ? 'center' : 'flex-start',
                    /* bo góc 8px theo spec */
                    borderRadius: '8px',
                    textAlign: 'left',
                    position: 'relative',
                    cursor: 'pointer',
                    /* transition mượt mà 220ms */
                    transition: 'background 0.22s ease, color 0.22s ease, border-color 0.22s ease',
                    border: 'none',
                    /* left-border 4px: transparent khi inactive, #00BFFF khi active */
                    borderLeft: isActive ? '4px solid #00BFFF' : '4px solid transparent',
                    marginLeft: '-4px',
                    /* nền active: rgba(0,191,255,0.15) theo spec */
                    background: isActive ? 'rgba(0, 191, 255, 0.15)' : 'transparent',
                    color: isActive ? '#ffffff' : '#9CA3AF',
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontSize: '13.5px',
                    fontWeight: isActive ? 600 : 500,
                    outline: 'none',
                    userSelect: 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                      e.currentTarget.style.color = '#e2e8f0';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#9CA3AF';
                    }
                  }}
                >
                  {/* Icon — sáng hơn khi active */}
                  <Icon
                    size={18}
                    style={{
                      color: isActive ? item.activeColor : '#6b7280',
                      filter: isActive ? 'brightness(1.2) drop-shadow(0 0 4px currentColor)' : 'none',
                      transition: 'color 0.22s ease, filter 0.22s ease',
                      flexShrink: 0,
                    }}
                  />

                  {/* Label */}
                  {(!collapsed || mobileOpen) && (
                    <span
                      className="truncate"
                      style={{
                        fontSize: '13.5px',
                        fontWeight: isActive ? 600 : 500,
                        letterSpacing: '-0.005em',
                        flex: 1,
                      }}
                    >
                      {item.label}
                    </span>
                  )}

                  {/* Alert badge — count */}
                  {showBadge && (!collapsed || mobileOpen) && (
                    <span
                      className="ml-auto shrink-0 min-w-5 h-5 px-1.5 rounded-full text-xs font-bold flex items-center justify-center"
                      style={{ background: '#ef4444', color: 'white', fontFamily: "'Inter', monospace", fontSize: '11px' }}
                    >
                      {newAlertCount > 99 ? '99+' : newAlertCount}
                    </span>
                  )}
                  {/* Alert badge — dot on collapsed */}
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
      <div
        className="hidden md:block p-3 shrink-0"
        style={{ borderTop: '1px solid #1e2a3a' }}
      >
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg cursor-pointer"
          style={{
            color: '#6b7280',
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: '12px',
            fontWeight: 500,
            transition: 'background 0.2s ease, color 0.2s ease',
            border: 'none',
            background: 'transparent',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#e2e8f0'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6b7280'; }}
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
