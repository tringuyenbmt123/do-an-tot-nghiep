// =============================================================================
// src/components/layout/Sidebar.jsx
// v3.0 — Grouped navigation mirroring template HTML menu structure:
//   - Standalone: Tổng quan, Cảnh báo, Sự cố, Nhật ký SIEM
//   - Group "Phân tích": Threat Intel, Detection Rules, MITRE, Lỗ hổng
//   - Group "Hạ tầng": Tài sản, Agents EDR, Firewall/IDS
//   - Group "Quản trị": Audit & Settings, Báo cáo, Playbook
// =============================================================================

import {
  Activity,
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cpu,
  FileBarChart2,
  Flame,
  LayoutDashboard,
  Layers,
  Network,
  Play,
  ScrollText,
  Server,
  Shield,
  Sliders,
  X,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../../context/AppContext';

// ─── Navigation Structure ──────────────────────────────────────────────────────
const NAV_STRUCTURE = [
  // Standalone items
  {
    id: 'dashboard',
    label: 'Tổng quan',
    icon: LayoutDashboard,
    activeColor: '#22d3ee',
    badge: 'alerts', // special: show alert count
  },
  {
    id: 'alerts',
    label: 'Cảnh báo',
    icon: AlertTriangle,
    activeColor: '#f87171',
  },
  {
    id: 'cases',
    label: 'Sự cố',
    icon: BookOpen,
    activeColor: '#c084fc',
  },
  {
    id: 'siem',
    label: 'Nhật ký (SIEM)',
    icon: ScrollText,
    activeColor: '#60a5fa',
  },

  // Group: Phân tích
  {
    type: 'group',
    id: 'analysis',
    label: 'Phân tích',
    children: [
      { id: 'threats', label: 'Threat Intelligence', icon: Flame, activeColor: '#fb923c' },
      { id: 'rules', label: 'Detection Rules', icon: Sliders, activeColor: '#67e8f9' },
      { id: 'mitre', label: 'MITRE ATT&CK', icon: Layers, activeColor: '#a78bfa' },
      { id: 'vulns', label: 'Lỗ hổng', icon: Zap, activeColor: '#fbbf24' },
    ],
  },

  // Group: Hạ tầng
  {
    type: 'group',
    id: 'infra',
    label: 'Hạ tầng',
    children: [
      { id: 'assets', label: 'Tài sản & Endpoint', icon: Server, activeColor: '#34d399' },
      { id: 'agents', label: 'Agents & EDR', icon: Cpu, activeColor: '#4ade80' },
      { id: 'firewall', label: 'Firewall / IDS', icon: Network, activeColor: '#f472b6' },
    ],
  },

  // Group: Quản trị
  {
    type: 'group',
    id: 'admin',
    label: 'Quản trị',
    children: [
      { id: 'audit', label: 'Audit & Settings', icon: Activity, activeColor: '#60a5fa' },
      { id: 'reports', label: 'Báo cáo', icon: FileBarChart2, activeColor: '#f9a8d4' },
      { id: 'playbooks', label: 'Playbook', icon: Play, activeColor: '#86efac' },
    ],
  },
];

// ─── Nav Item (leaf) ──────────────────────────────────────────────────────────
function NavItem({ item, isActive, collapsed, mobileOpen, onClick, alertCount }) {
  const Icon = item.icon;
  const showBadge = item.badge === 'alerts' && alertCount > 0;
  const expanded = !collapsed || mobileOpen;

  return (
    <li>
      <button
        onClick={() => onClick(item.id)}
        title={collapsed && !mobileOpen ? item.label : undefined}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: collapsed && !mobileOpen ? '10px 0' : '10px 12px',
          justifyContent: collapsed && !mobileOpen ? 'center' : 'flex-start',
          borderRadius: '8px',
          textAlign: 'left',
          position: 'relative',
          cursor: 'pointer',
          transition: 'background 0.22s ease, color 0.22s ease, border-color 0.22s ease',
          border: 'none',
          borderLeft: isActive ? '3px solid #00BFFF' : '3px solid transparent',
          marginLeft: '-3px',
          background: isActive ? 'rgba(0,191,255,0.13)' : 'transparent',
          color: isActive ? '#ffffff' : '#9CA3AF',
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: '13px',
          fontWeight: isActive ? 600 : 500,
          outline: 'none',
          userSelect: 'none',
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
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
        <Icon
          size={16}
          style={{
            color: isActive ? item.activeColor : '#6b7280',
            filter: isActive ? 'brightness(1.2) drop-shadow(0 0 4px currentColor)' : 'none',
            transition: 'color 0.22s ease, filter 0.22s ease',
            flexShrink: 0,
          }}
        />
        {expanded && (
          <span
            className="truncate"
            style={{ fontSize: '13px', fontWeight: isActive ? 600 : 500, letterSpacing: '-0.005em', flex: 1 }}
          >
            {item.label}
          </span>
        )}
        {/* Badge: alert count */}
        {showBadge && expanded && (
          <span
            className="ml-auto shrink-0 min-w-5 h-5 px-1.5 rounded-full text-xs font-bold flex items-center justify-center"
            style={{ background: '#ef4444', color: 'white', fontSize: '11px', fontFamily: "'Inter', monospace" }}
          >
            {alertCount > 99 ? '99+' : alertCount}
          </span>
        )}
        {/* Badge dot on collapsed */}
        {showBadge && collapsed && !mobileOpen && (
          <span
            className="absolute top-1 right-1 w-2 h-2 rounded-full animate-blink"
            style={{ background: '#ef4444' }}
          />
        )}
      </button>
    </li>
  );
}

// ─── Nav Group (collapsible) ──────────────────────────────────────────────────
function NavGroup({ group, activeTab, collapsed, mobileOpen, onClick, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const expanded = !collapsed || mobileOpen;
  const hasActive = group.children.some((c) => c.id === activeTab);

  if (collapsed && !mobileOpen) {
    // Collapsed: show children as flat icon-only buttons
    return (
      <>
        {group.children.map((item) => (
          <NavItem
            key={item.id}
            item={item}
            isActive={activeTab === item.id}
            collapsed={collapsed}
            mobileOpen={mobileOpen}
            onClick={onClick}
          />
        ))}
      </>
    );
  }

  return (
    <li style={{ marginTop: '6px' }}>
      {/* Group header button */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '7px 10px',
          borderRadius: '6px',
          color: hasActive ? '#94a3b8' : '#6b7280',
          textAlign: 'left',
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          transition: 'color 0.2s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#e2e8f0'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = hasActive ? '#94a3b8' : '#6b7280'; }}
        aria-expanded={open}
      >
        <span>{group.label}</span>
        <ChevronDown
          size={12}
          style={{
            color: '#6b7280',
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 0.25s ease',
            flexShrink: 0,
          }}
        />
      </button>

      {/* Sub-items */}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.25s ease, opacity 0.25s ease',
          opacity: open ? 1 : 0,
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          <ul
            style={{
              listStyle: 'none',
              padding: '2px 0 2px 12px',
              margin: 0,
              borderLeft: '1px solid #1e2a3a',
              marginLeft: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            {group.children.map((item) => (
              <NavItem
                key={item.id}
                item={item}
                isActive={activeTab === item.id}
                collapsed={false}
                mobileOpen={true}
                onClick={onClick}
              />
            ))}
          </ul>
        </div>
      </div>
    </li>
  );
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────
export default function Sidebar({ collapsed, setCollapsed, mobileOpen, onMobileClose }) {
  const { activeTab, setActiveTab, liveAlerts } = useApp();

  const newAlertCount = liveAlerts.filter((a) => a.status === 'new').length;

  const handleNavClick = (id) => {
    setActiveTab(id);
    if (onMobileClose) onMobileClose();
  };

  const sidebarContent = (
    <aside
      className={`flex flex-col h-full transition-all duration-300 ease-in-out shrink-0 z-40 ${
        mobileOpen ? 'fixed inset-y-0 left-0 w-[240px] shadow-2xl md:static' : 'relative'
      }`}
      style={{
        width: mobileOpen ? '240px' : collapsed ? '64px' : '240px',
        background: 'linear-gradient(180deg, #080c12 0%, #0d1117 100%)',
        borderRight: '1px solid #1e2a3a',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center justify-between px-4 shrink-0"
        style={{ borderBottom: '1px solid #1e2a3a', paddingTop: '18px', paddingBottom: '18px' }}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <div
            className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #00d4ff, #0ea5c9)' }}
          >
            <Shield size={14} className="text-gray-900" />
          </div>
          {(!collapsed || mobileOpen) && (
            <div className="overflow-hidden">
              <p
                className="leading-tight whitespace-nowrap"
                style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}
              >
                SOC Console
              </p>
              <p
                className="whitespace-nowrap"
                style={{ fontSize: '10px', fontWeight: 400, color: '#4b5563', marginTop: '1px', fontFamily: "'JetBrains Mono', monospace" }}
              >
                v2.0 · Unified EDR
              </p>
            </div>
          )}
        </div>
        {mobileOpen && (
          <button onClick={onMobileClose} className="md:hidden text-gray-400 hover:text-white p-1">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto" style={{ paddingTop: '8px', paddingBottom: '8px' }}>
        <ul
          style={{
            listStyle: 'none',
            padding: '0 8px',
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          {NAV_STRUCTURE.map((item) => {
            if (item.type === 'group') {
              return (
                <NavGroup
                  key={item.id}
                  group={item}
                  activeTab={activeTab}
                  collapsed={collapsed}
                  mobileOpen={mobileOpen}
                  onClick={handleNavClick}
                  defaultOpen={true}
                />
              );
            }
            return (
              <NavItem
                key={item.id}
                item={item}
                isActive={activeTab === item.id}
                collapsed={collapsed}
                mobileOpen={mobileOpen}
                onClick={handleNavClick}
                alertCount={newAlertCount}
              />
            );
          })}
        </ul>
      </nav>

      {/* Bottom: Collapse toggle (desktop only) */}
      <div className="hidden md:block p-2 shrink-0" style={{ borderTop: '1px solid #1e2a3a' }}>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg cursor-pointer"
          style={{
            color: '#6b7280',
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: '11px',
            fontWeight: 500,
            transition: 'background 0.2s ease, color 0.2s ease',
            border: 'none',
            background: 'transparent',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#e2e8f0'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6b7280'; }}
        >
          {collapsed ? <ChevronRight size={13} /> : <><ChevronLeft size={13} /><span>Thu gọn</span></>}
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
      <div className={`shrink-0 ${mobileOpen ? 'block' : 'hidden md:block'}`}>
        {sidebarContent}
      </div>
    </>
  );
}
