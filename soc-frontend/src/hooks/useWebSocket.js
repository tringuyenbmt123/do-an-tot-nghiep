// =============================================================================
// src/hooks/useWebSocket.js
// Custom hook: WebSocket client with auto-reconnect (exponential backoff)
// Connects to ws://localhost:8080/ws/alerts (via Vite proxy: /ws/alerts)
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';

const WS_URL = 'ws://localhost:8080/ws/alerts';

const RECONNECT_BASE_MS = 1000;   // initial reconnect delay
const RECONNECT_MAX_MS = 30000;  // max reconnect delay cap
const RECONNECT_FACTOR = 1.8;    // exponential multiplier

/**
 * useWebSocket
 * @param {function} onMessage - callback invoked on every incoming message
 * @returns {{ isConnected, reconnectAttempts, disconnect, reconnect }}
 */
export function useWebSocket(onMessage) {
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const reconnectCount = useRef(0);
  const isMounted = useRef(true);
  const onMessageRef = useRef(onMessage);

  // Keep callback ref fresh without triggering re-connections
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    clearReconnectTimer();
    reconnectCount.current += 1;
    setReconnectAttempts(reconnectCount.current);

    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(RECONNECT_FACTOR, reconnectCount.current - 1),
      RECONNECT_MAX_MS,
    );
    console.info(`[WS] Reconnecting in ${Math.round(delay)}ms (attempt #${reconnectCount.current})`);

    reconnectTimer.current = setTimeout(() => {
      if (isMounted.current) connect();
    }, delay);
  }, [clearReconnectTimer]);

  const connect = useCallback(() => {
    if (!isMounted.current) return;

    // Nếu đã đang kết nối hoặc mở rồi thì không mở lại nữa
    if (wsRef.current && (wsRef.current.readyState === WebSocket.CONNECTING || wsRef.current.readyState === WebSocket.OPEN)) {
      return;
    }

    // Gỡ listener của socket cũ trước khi đóng để tránh trigger onclose bất ngờ
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      wsRef.current.close(1000);
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = WS_URL.startsWith('/')
      ? `${protocol}//${window.location.host}${WS_URL}`
      : WS_URL;

    let ws;
    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      console.warn('[WS] Failed to create WebSocket:', err);
      scheduleReconnect();
      return;
    }

    wsRef.current = ws;

    ws.onopen = () => {
      if (!isMounted.current) return;
      console.info('[WS] Connected to', wsUrl);
      reconnectCount.current = 0;
      setReconnectAttempts(0);
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      if (!isMounted.current) return;
      try {
        const data = JSON.parse(event.data);
        onMessageRef.current?.(data);
      } catch (err) {
        console.warn('[WS] Failed to parse message:', err, event.data);
      }
    };

    ws.onerror = (err) => {
      console.warn('[WS] Error:', err);
    };

    ws.onclose = (event) => {
      if (!isMounted.current) return;
      console.info(`[WS] Disconnected (code=${event.code})`);
      setIsConnected(false);

      // Không reconnect nếu chủ động ngắt kết nối (1000)
      if (event.code !== 1000) {
        scheduleReconnect();
      }
    };
  }, [scheduleReconnect]);

  const disconnect = useCallback(() => {
    clearReconnectTimer();
    if (wsRef.current) {
      wsRef.current.onclose = null; // Tránh gọi scheduleReconnect
      wsRef.current.close(1000, 'Manual disconnect');
      wsRef.current = null;
    }
    setIsConnected(false);
  }, [clearReconnectTimer]);

  const reconnect = useCallback(() => {
    clearReconnectTimer();
    reconnectCount.current = 0;
    connect();
  }, [clearReconnectTimer, connect]);

  // Establish connection on mount
  useEffect(() => {
    isMounted.current = true;
    connect();

    return () => {
      isMounted.current = false;
      clearReconnectTimer();
      if (wsRef.current) {
        wsRef.current.onclose = null; // Unbind handler trước khi unmount
        wsRef.current.close(1000, 'Component unmount');
      }
    };
  }, [connect, clearReconnectTimer]);

  return { isConnected, reconnectAttempts, disconnect, reconnect };
}