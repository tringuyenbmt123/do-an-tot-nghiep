// ==============================================================
// src/hooks/useWebSocket.js
// WebSocket connection for realtime alerts
// ==============================================================
import { useEffect, useRef, useState, useCallback } from 'react'
import { getToken } from '../api/client'

const WS_URL = `ws://${window.location.hostname}:8080/ws/alerts`

export function useWebSocket(onMessage) {
  const wsRef = useRef(null)
  const [status, setStatus] = useState('disconnected') // connected | disconnected | error
  const reconnectRef = useRef(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    try {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        setStatus('connected')
        // Clear reconnect timer
        if (reconnectRef.current) clearTimeout(reconnectRef.current)
      }

      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data)
          onMessageRef.current?.(data)
        } catch { /* ignore parse errors */ }
      }

      ws.onerror = () => setStatus('error')

      ws.onclose = () => {
        setStatus('disconnected')
        // Auto-reconnect after 5s
        reconnectRef.current = setTimeout(connect, 5000)
      }
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  return { status }
}
