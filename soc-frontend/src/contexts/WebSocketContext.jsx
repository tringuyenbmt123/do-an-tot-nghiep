// ==============================================================
// src/contexts/WebSocketContext.jsx
// SINGLETON WebSocket context – chỉ 1 kết nối duy nhất cho toàn app,
// tránh tình trạng mỗi trang <Layout> tạo 1 WS riêng gây alert nhân bản.
// ==============================================================
import React, {
  createContext, useContext, useEffect, useRef,
  useState, useCallback, useMemo
} from 'react'

const WebSocketContext = createContext(null)

const WS_URL = `ws://${window.location.hostname}:8080/ws/alerts`

export function WebSocketProvider({ children }) {
  const wsRef        = useRef(null)
  const reconnectRef = useRef(null)
  const [status, setStatus] = useState('disconnected')

  // Danh sách subscribers (các handler đăng ký lắng nghe message)
  const subscribersRef = useRef(new Set())

  const connect = useCallback(() => {
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
       wsRef.current.readyState === WebSocket.CONNECTING)
    ) return

    try {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        setStatus('connected')
        if (reconnectRef.current) clearTimeout(reconnectRef.current)
      }

      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data)
          // Broadcast tới tất cả subscribers
          subscribersRef.current.forEach(fn => fn(data))
        } catch { /* ignore parse errors */ }
      }

      ws.onerror = () => setStatus('error')

      ws.onclose = () => {
        setStatus('disconnected')
        // Auto-reconnect sau 5s
        reconnectRef.current = setTimeout(connect, 5000)
      }
    } catch {
      setStatus('error')
    }
  }, [])

  // Kết nối 1 lần duy nhất khi app khởi động
  useEffect(() => {
    connect()
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  // API để các component đăng ký/hủy đăng ký lắng nghe message
  const subscribe = useCallback((fn) => {
    subscribersRef.current.add(fn)
    return () => subscribersRef.current.delete(fn)
  }, [])

  const value = useMemo(() => ({ status, subscribe }), [status, subscribe])

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  )
}

export const useWebSocketContext = () => {
  const ctx = useContext(WebSocketContext)
  if (!ctx) throw new Error('useWebSocketContext must be inside WebSocketProvider')
  return ctx
}
