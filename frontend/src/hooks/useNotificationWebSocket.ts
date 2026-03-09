import { useEffect, useRef, useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../AuthContext'
import type { AppNotification } from '../types'

type WebSocketStatus = 'connecting' | 'connected' | 'disconnected'

export function useNotificationWebSocket() {
  const { user } = useAuth()
  const wsRef = useRef<WebSocket | null>(null)
  const pingRef = useRef<ReturnType<typeof setInterval>>(undefined)
  const [status, setStatus] = useState<WebSocketStatus>('disconnected')
  const queryClient = useQueryClient()

  const connect = useCallback(() => {
    if (!user) return

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const host = window.location.hostname
    // In dev, WebSocket goes to the Django server on port 8000
    const port = import.meta.env.DEV ? ':8000' : ''
    const token = document.cookie.match(/sessionid=([^;]+)/)?.[1] || ''
    const url = `${proto}://${host}${port}/ws/notifications/?token=${token}`

    const ws = new WebSocket(url)
    wsRef.current = ws
    setStatus('connecting')

    ws.onopen = () => {
      setStatus('connected')
      // Keep-alive ping every 30s
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
        }
      }, 30000)
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'notification') {
          // Prepend the new notification to the cached list
          queryClient.setQueryData<{ notifications: AppNotification[]; unread_count: number }>(
            ['notifications'],
            (old) => {
              if (!old) return { notifications: [data.notification], unread_count: 1 }
              return {
                notifications: [data.notification, ...old.notifications].slice(0, 50),
                unread_count: old.unread_count + 1,
              }
            }
          )
          // Also invalidate the unread count
          queryClient.invalidateQueries({ queryKey: ['notificationUnreadCount'] })
        }
      } catch {
        // ignore parse errors
      }
    }

    ws.onclose = () => {
      setStatus('disconnected')
      if (pingRef.current) clearInterval(pingRef.current)
      // Reconnect after 5s
      setTimeout(() => {
        if (wsRef.current === ws) connect()
      }, 5000)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [user, queryClient])

  useEffect(() => {
    connect()
    return () => {
      if (pingRef.current) clearInterval(pingRef.current)
      if (wsRef.current) {
        const ws = wsRef.current
        wsRef.current = null
        ws.close()
      }
    }
  }, [connect])

  return status
}
