// =============================================================================
// src/context/AppContext.jsx
// Global Application State:
//   - activeTab: navigation state
//   - toasts: notification queue
//   - wsConnected: WebSocket connection status
//   - liveAlerts: real-time alert feed from WebSocket
// =============================================================================

import { createContext, useCallback, useContext, useEffect, useReducer, useRef } from 'react';

const AppContext = createContext(null);
const AUTH_LOGOUT_EVENT = 'soc:logout';

// ─── Action Types ────────────────────────────────────────────────────────────
const ACTIONS = {
  SET_TAB:         'SET_TAB',
  ADD_TOAST:       'ADD_TOAST',
  REMOVE_TOAST:    'REMOVE_TOAST',
  ADD_LIVE_ALERT:  'ADD_LIVE_ALERT',
  CLEAR_ALERTS:    'CLEAR_ALERTS',
  LOGIN:           'LOGIN',
  LOGOUT:          'LOGOUT',
};

const initialState = {
  activeTab: 'dashboard',
  toasts: [],
  wsConnected: false,
  liveAlerts: [],
  user: JSON.parse(localStorage.getItem('soc_user') || 'null'),
  isAuthenticated: !!localStorage.getItem('soc_token'),
};

// ─── Reducer ─────────────────────────────────────────────────────────────────
function appReducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_TAB:
      return { ...state, activeTab: action.payload };

    case ACTIONS.ADD_TOAST:
      return {
        ...state,
        toasts: [action.payload, ...state.toasts].slice(0, 8), // max 8 toasts
      };

    case ACTIONS.REMOVE_TOAST:
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.payload),
      };

    case ACTIONS.SET_WS_STATUS:
      return { ...state, wsConnected: action.payload };

    case ACTIONS.ADD_LIVE_ALERT:
      return {
        ...state,
        // Keep newest 100 alerts in live feed
        liveAlerts: [action.payload, ...state.liveAlerts].slice(0, 100),
      };

    case ACTIONS.CLEAR_ALERTS:
      return { ...state, liveAlerts: [] };

    case ACTIONS.LOGIN:
      return { ...state, user: action.payload.user, isAuthenticated: true };

    case ACTIONS.LOGOUT:
      return { ...state, user: null, isAuthenticated: false };

    default:
      return state;
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const toastIdRef = useRef(0);

  // Navigation
  const setActiveTab = useCallback((tab) => {
    dispatch({ type: ACTIONS.SET_TAB, payload: tab });
  }, []);

  // Toast notifications
  const addToast = useCallback((toast) => {
    const id = ++toastIdRef.current;
    const newToast = { id, timestamp: Date.now(), ...toast };
    dispatch({ type: ACTIONS.ADD_TOAST, payload: newToast });

    // Auto-dismiss
    const duration = toast.severity === 'critical' ? 8000 : 5000;
    setTimeout(() => {
      dispatch({ type: ACTIONS.REMOVE_TOAST, payload: id });
    }, duration);

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    dispatch({ type: ACTIONS.REMOVE_TOAST, payload: id });
  }, []);

  // WebSocket helpers
  const setWsConnected = useCallback((status) => {
    dispatch({ type: ACTIONS.SET_WS_STATUS, payload: status });
  }, []);

  const addLiveAlert = useCallback((alert) => {
    dispatch({ type: ACTIONS.ADD_LIVE_ALERT, payload: alert });
  }, []);

  const clearLiveAlerts = useCallback(() => {
    dispatch({ type: ACTIONS.CLEAR_ALERTS });
  }, []);

  const loginContext = useCallback((userData, token) => {
    localStorage.setItem('soc_token', token);
    localStorage.setItem('soc_user', JSON.stringify(userData));
    dispatch({ type: ACTIONS.LOGIN, payload: { user: userData } });
  }, []);

  const logoutContext = useCallback(() => {
    localStorage.removeItem('soc_token');
    localStorage.removeItem('soc_user');
    dispatch({ type: ACTIONS.LOGOUT });
  }, []);

  useEffect(() => {
    const handleAuthLogout = () => {
      logoutContext();
    };

    window.addEventListener(AUTH_LOGOUT_EVENT, handleAuthLogout);
    return () => window.removeEventListener(AUTH_LOGOUT_EVENT, handleAuthLogout);
  }, [logoutContext]);

  const value = {
    // State
    activeTab:   state.activeTab,
    toasts:      state.toasts,
    wsConnected: state.wsConnected,
    liveAlerts:  state.liveAlerts,
    user:        state.user,
    isAuthenticated: state.isAuthenticated,
    // Actions
    setActiveTab,
    addToast,
    removeToast,
    setWsConnected,
    addLiveAlert,
    clearLiveAlerts,
    loginContext,
    logoutContext,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
