// =============================================================================
// src/components/layout/TopBar.jsx
// v3.0 — Unified 3-zone Header:
//   LEFT  : Logo (shield icon) + Product name compact
//   CENTER: Title "Unified SOC / EDR Console" + vertical divider + DateTime
//   RIGHT : WS Live status + Bell (20px) + Admin Avatar (32px)
// =============================================================================

import { Bell, ChevronDown, LogOut, Menu, RefreshCw, Shield, User, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';

export default function TopBar({ onOpenMobileMenu }) {
  const { wsConnected, liveAlerts, reconnectAttempts, user, logoutContext } = useApp();
  const [time, setTime] = useState(new Date());
  const [pulse, setPulse] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef(null);

  // Live clock — tick every second
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Pulse animation on incoming alert
  useEffect(() => {
    if (liveAlerts.length > 0) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 800);
      return () => clearTimeout(t);
    }
  }, [liveAlerts.length]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const formatTime = (d) =>
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const formatDate = (d) =>
    d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

  const criticalCount = liveAlerts.filter((a) => a.severity === 'critical').length;
  const displayName = user?.username || 'analyst';
  const displayRole = user?.role || 'analyst';
  const initials = displayName.charAt(0).toUpperCase();

  // ── Shared inline-style constants ─────────────────────────────────────────
  const FONT = "'Inter', system-ui, sans-serif";
  const DIVIDER = (
    <span
      style={{
        display: 'inline-block',
        width: '1px',
        height: '20px',
        background: '#2D3748',
        flexShrink: 0,
      }}
    />
  );

  return (
    <header
      className="flex items-center shrink-0 z-20 w-full min-w-0"
      style={{
        /* tương đương py-3.5 = 14px top/bottom */
        padding: '14px 24px',
        background: 'rgba(8, 12, 18, 0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        /* border phân tách nội dung bên dưới */
        borderBottom: '1px solid #1A202C',
        fontFamily: FONT,
        /* đảm bảo 3 cột: left | center | right */
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        gap: '16px',
      }}
    >
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          LEFT ZONE — Mobile hamburger + Logo compact + Product name
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile hamburger */}
        <button
          onClick={onOpenMobileMenu}
          className="md:hidden p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          title="Toggle navigation drawer"
        >
          <Menu size={18} />
        </button>

        {/* Shield icon (nhỏ gọn, chỉ thấy ở desktop) */}
        <div
          className="hidden md:flex items-center justify-center shrink-0"
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #00d4ff 0%, #0ea5c9 100%)',
            boxShadow: '0 0 12px rgba(0,212,255,0.25)',
          }}
        >
          <Shield size={14} style={{ color: '#0a0e17' }} />
        </div>

        {/* Product name compact */}
        <div className="hidden md:flex flex-col leading-tight overflow-hidden">
          <span
            className="truncate"
            style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc', letterSpacing: '0.01em' }}
          >
            SOC Console
          </span>
          <span
            style={{ fontSize: '9.5px', fontWeight: 400, color: '#4b5563', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.05em' }}
          >
            v2.0 · Unified EDR
          </span>
        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          CENTER ZONE — Console title + vertical divider + Date/Time
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div
        className="hidden sm:flex items-center gap-4"
        style={{ justifySelf: 'center' }}
      >
        {/* Console title */}
        <h1
          style={{
            fontSize: '13.5px',
            fontWeight: 600,
            color: '#e2e8f0',
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
            margin: 0,
            fontFamily: FONT,
          }}
        >
          Unified SOC
          <span style={{ color: '#2D3748', margin: '0 6px' }}>/</span>
          EDR Console
        </h1>

        {/* Dải phân cách dọc tinh tế */}
        {DIVIDER}

        {/* Date + Time block */}
        <div className="flex items-center gap-2.5">
          {/* Date — xám nhạt */}
          <span
            style={{
              fontSize: '11.5px',
              fontWeight: 400,
              color: '#6b7280',
              fontFamily: "'Inter', sans-serif",
              whiteSpace: 'nowrap',
            }}
          >
            {formatDate(time)}
          </span>

          {/* Dải phân cách dọc nhỏ */}
          <span style={{ display: 'inline-block', width: '1px', height: '14px', background: '#2D3748', flexShrink: 0 }} />

          {/* Time — cài dạng HH:MM:SS nổi bật */}
          <span
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: '#22d3ee',
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              letterSpacing: '0.08em',
              whiteSpace: 'nowrap',
              textShadow: '0 0 10px rgba(34,211,238,0.35)',
            }}
          >
            {formatTime(time)}
          </span>
        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          RIGHT ZONE — WS Live + Bell + Admin Avatar
          ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div
        className="flex items-center"
        style={{ justifySelf: 'end', gap: '16px' }}
      >
        {/* WebSocket status pill */}
        <div
          className="hidden sm:flex items-center gap-2"
          style={{
            padding: '5px 10px',
            borderRadius: '20px',
            background: wsConnected ? 'rgba(16,185,129,0.08)' : 'rgba(234,179,8,0.08)',
            border: wsConnected ? '1px solid rgba(16,185,129,0.25)' : '1px solid rgba(234,179,8,0.25)',
          }}
        >
          {wsConnected ? (
            <>
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#10b981',
                  boxShadow: '0 0 6px #10b981',
                  display: 'inline-block',
                  animation: 'pulse-dot 1.8s ease-in-out infinite',
                  flexShrink: 0,
                }}
              />
              <span
                style={{ fontSize: '11px', fontWeight: 600, color: '#10b981', fontFamily: FONT, letterSpacing: '0.04em' }}
              >
                WS Live
              </span>
            </>
          ) : (
            <>
              {reconnectAttempts > 0 ? (
                <RefreshCw size={11} style={{ color: '#eab308', animation: 'spin 1s linear infinite' }} />
              ) : (
                <WifiOff size={11} style={{ color: '#6b7280' }} />
              )}
              <span style={{ fontSize: '11px', fontWeight: 500, color: reconnectAttempts > 0 ? '#eab308' : '#6b7280', fontFamily: FONT }}>
                {reconnectAttempts > 0 ? `Reconnecting #${reconnectAttempts}` : 'WS Offline'}
              </span>
            </>
          )}
        </div>

        {/* Dải phân cách dọc */}
        {DIVIDER}

        {/* Critical alert Bell — 20px, hover tinh tế */}
        <button
          className="relative cursor-pointer"
          title={`${criticalCount} critical alerts`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            border: 'none',
            background: 'transparent',
            color: criticalCount > 0 ? '#f87171' : '#6b7280',
            transition: 'background 0.2s ease, color 0.2s ease',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = criticalCount > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.05)';
            e.currentTarget.style.color = criticalCount > 0 ? '#fca5a5' : '#d1d5db';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = criticalCount > 0 ? '#f87171' : '#6b7280';
          }}
        >
          <Bell size={20} className={pulse ? 'animate-blink' : ''} />
          {criticalCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 flex items-center justify-center text-white rounded-full"
              style={{ fontSize: '9px', background: '#ef4444', fontWeight: 700, fontFamily: FONT }}
            >
              {criticalCount > 9 ? '9+' : criticalCount}
            </span>
          )}
        </button>

        {/* Dải phân cách dọc */}
        {DIVIDER}

        {/* Admin Avatar + Dropdown — Avatar 32px */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center cursor-pointer"
            style={{
              gap: '10px',
              padding: '6px 10px',
              borderRadius: '10px',
              border: 'none',
              background: 'transparent',
              transition: 'background 0.2s ease',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            {/* Avatar 32×32 */}
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '13px',
                fontWeight: 700,
                color: 'white',
                flexShrink: 0,
                boxShadow: '0 0 0 2px rgba(59,130,246,0.25)',
                fontFamily: FONT,
              }}
            >
              {initials}
            </div>

            {/* Name + Role */}
            <div className="hidden sm:flex flex-col items-start leading-tight">
              <span
                style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0', fontFamily: FONT }}
              >
                {displayName}
              </span>
              <span
                style={{ fontSize: '10px', fontWeight: 400, color: '#6b7280', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em' }}
              >
                {displayRole}
              </span>
            </div>

            <ChevronDown
              size={13}
              style={{
                color: '#6b7280',
                transform: showUserMenu ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease',
              }}
            />
          </button>

          {/* ── Dropdown Menu ── */}
          {showUserMenu && (
            <div
              className="absolute right-0 mt-2 w-56 rounded-xl overflow-hidden shadow-2xl z-50 animate-fade-in"
              style={{
                background: 'linear-gradient(145deg, #111827 0%, #0f172a 100%)',
                border: '1px solid #1e293b',
                boxShadow: '0 20px 40px rgba(0,0,0,0.5), 0 0 20px rgba(6,182,212,0.05)',
              }}
            >
              {/* User Info Header */}
              <div className="px-4 py-3 border-b" style={{ borderColor: '#1e293b' }}>
                <div className="flex items-center gap-3">
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px',
                      fontWeight: 700,
                      color: 'white',
                      fontFamily: FONT,
                    }}
                  >
                    {initials}
                  </div>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', fontFamily: FONT, margin: 0 }}>{displayName}</p>
                    <p style={{ fontSize: '11px', fontWeight: 400, color: '#6b7280', fontFamily: "'JetBrains Mono', monospace", margin: '2px 0 0' }}>
                      {user?.email || `${displayName}@soc.local`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Menu Items */}
              <div className="py-1.5">
                <button
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors cursor-pointer"
                  style={{ fontFamily: FONT, border: 'none', background: 'transparent' }}
                  onClick={() => setShowUserMenu(false)}
                >
                  <User size={14} />
                  <span>Profile</span>
                </button>
              </div>

              {/* Divider + Logout */}
              <div className="border-t py-1.5" style={{ borderColor: '#1e293b' }}>
                <button
                  onClick={() => { setShowUserMenu(false); logoutContext(); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/10 transition-colors cursor-pointer"
                  style={{ fontFamily: FONT, border: 'none', background: 'transparent' }}
                >
                  <LogOut size={14} />
                  <span>Đăng xuất</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
