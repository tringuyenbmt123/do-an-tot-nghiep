// src/components/layout/TopBar.jsx
import { Bell, ChevronDown, LogOut, RefreshCw, User, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';

export default function TopBar() {
  const { wsConnected, liveAlerts, reconnectAttempts, user, logoutContext } = useApp();
  const [time, setTime] = useState(new Date());
  const [pulse, setPulse] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef(null);

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Pulse on new alert
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
    d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const criticalCount = liveAlerts.filter((a) => a.severity === 'critical').length;
  const displayName = user?.username || 'analyst';
  const displayRole = user?.role || 'analyst';
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <header
      className="flex items-center justify-between px-6 py-3 shrink-0 z-10"
      style={{ background: 'rgba(10, 14, 23, 0.75)', borderBottom: '1px solid #1e293b', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
    >
      {/* Left: Page title / Breadcrumb */}
      <div className="flex items-center gap-4">
        <h1 className="text-base font-semibold text-gray-200 tracking-wide">
          Unified SOC / EDR Console
        </h1>
        <span className="text-xs text-gray-600 font-mono">|</span>
        <span className="text-xs text-gray-500 font-mono">
          {formatDate(time)} &nbsp;—&nbsp;
          <span className="text-cyan-400 font-semibold">{formatTime(time)}</span>
        </span>
      </div>

      {/* Right: Status indicators */}
      <div className="flex items-center gap-4">

        {/* WebSocket status */}
        <div className="flex items-center gap-2">
          {wsConnected ? (
            <>
              <div className="status-dot-online" />
              <span className="text-xs text-green-400 font-medium">WS Live</span>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5 text-gray-500">
                {reconnectAttempts > 0 ? (
                  <RefreshCw size={12} className="animate-spin text-yellow-500" />
                ) : (
                  <WifiOff size={12} />
                )}
                <span className="text-xs">
                  {reconnectAttempts > 0 ? `Reconnecting #${reconnectAttempts}` : 'WS Offline'}
                </span>
              </div>
            </>
          )}
        </div>

        <span className="text-gray-700">|</span>

        {/* Critical alert notification bell */}
        <button
          className={`relative p-2 rounded-lg transition-colors ${criticalCount > 0 ? 'text-red-400 hover:bg-red-900/20' : 'text-gray-500 hover:bg-white/5'}`}
          title={`${criticalCount} critical alerts`}
        >
          <Bell size={16} className={pulse ? 'animate-blink' : ''} />
          {criticalCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center text-white rounded-full"
              style={{ fontSize: 9, background: '#ef4444', fontWeight: 700 }}
            >
              {criticalCount > 9 ? '9+' : criticalCount}
            </span>
          )}
        </button>

        <span className="text-gray-700">|</span>

        {/* User avatar + Dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-xl transition-all hover:bg-white/5"
            style={{ cursor: 'pointer' }}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)', color: 'white' }}
            >
              {initials}
            </div>
            <div className="flex flex-col items-start">
              <span className="text-xs text-gray-300 font-medium leading-tight">{displayName}</span>
              <span className="text-[10px] text-gray-500 font-mono leading-tight">{displayRole}</span>
            </div>
            <ChevronDown size={12} className={`text-gray-500 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {showUserMenu && (
            <div
              className="absolute right-0 mt-2 w-56 rounded-xl overflow-hidden shadow-2xl z-50"
              style={{
                background: 'linear-gradient(145deg, #111827 0%, #0f172a 100%)',
                border: '1px solid #1e293b',
                boxShadow: '0 20px 40px rgba(0,0,0,0.5), 0 0 20px rgba(6,182,212,0.05)',
              }}
            >
              {/* User Info */}
              <div className="px-4 py-3 border-b" style={{ borderColor: '#1e293b' }}>
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{ background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)', color: 'white' }}
                  >
                    {initials}
                  </div>
                  <div>
                    <p className="text-sm text-gray-200 font-semibold">{displayName}</p>
                    <p className="text-[11px] text-gray-500 font-mono">{user?.email || `${displayName}@soc.local`}</p>
                  </div>
                </div>
              </div>

              {/* Menu Items */}
              <div className="py-1.5">
                <button
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
                  onClick={() => setShowUserMenu(false)}
                >
                  <User size={14} />
                  <span>Profile</span>
                </button>
              </div>

              {/* Divider + Logout */}
              <div className="border-t py-1.5" style={{ borderColor: '#1e293b' }}>
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    logoutContext();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/10 transition-colors"
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

