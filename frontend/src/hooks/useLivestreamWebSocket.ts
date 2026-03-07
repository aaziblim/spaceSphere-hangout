import { useState, useEffect, useRef, useCallback } from 'react'
import type { LivestreamMessage } from '../api'

type WSStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export interface ViewerInfo {
  id: number
  username: string
  profile_image: string | null
}

interface UseLivestreamWSReturn {
  status: WSStatus
  messages: LivestreamMessage[]
  viewers: ViewerInfo[]
  viewerCount: number
  totalLikes: number
  pinnedMessageId: number | null
  bannedUserIds: number[]
  streamEnded: boolean
  sendChatMessage: (content: string) => void
  sendLike: () => void
  pinMessage: (messageId: number) => void
  banUser: (userId: number) => void
}

export function useLivestreamWebSocket(
  streamId: string | undefined,
  enabled: boolean,
  initialMessages?: LivestreamMessage[]
): UseLivestreamWSReturn {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [status, setStatus] = useState<WSStatus>('disconnected')
  const [messages, setMessages] = useState<LivestreamMessage[]>(initialMessages || [])
  const [viewers, setViewers] = useState<ViewerInfo[]>([])
  const [viewerCount, setViewerCount] = useState(0)
  const [totalLikes, setTotalLikes] = useState(0)
  const [pinnedMessageId, setPinnedMessageId] = useState<number | null>(null)
  const [bannedUserIds, setBannedUserIds] = useState<number[]>([])
  const [streamEnded, setStreamEnded] = useState(false)

  // Sync initial messages when they load
  useEffect(() => {
    if (initialMessages && initialMessages.length > 0) {
      setMessages(prev => {
        if (prev.length === 0) return initialMessages
        // Merge: keep initial, append any WS messages not already present
        const ids = new Set(initialMessages.map(m => m.id))
        const newFromWs = prev.filter(m => !ids.has(m.id))
        return [...initialMessages, ...newFromWs]
      })
    }
  }, [initialMessages])

  const getWSUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.hostname
    const port = import.meta.env.DEV ? '5173' : window.location.port
    return `${protocol}//${host}${port ? ':' + port : ''}/ws/livestream/${streamId}/`
  }, [streamId])

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data)
      switch (data.type) {
        case 'chat_message':
          setMessages(prev => {
            if (prev.some(m => m.id === data.message.id)) return prev
            return [...prev, data.message]
          })
          break
        case 'viewer_joined':
          setViewers(prev => {
            if (prev.some(v => v.id === data.user.id)) return prev
            return [...prev, data.user]
          })
          setViewerCount(prev => prev + 1)
          break
        case 'viewer_left':
          setViewers(prev => prev.filter(v => v.id !== data.user_id))
          setViewerCount(prev => Math.max(0, prev - 1))
          break
        case 'like_sent':
          setTotalLikes(data.total_likes)
          break
        case 'stream_ended':
          setStreamEnded(true)
          break
        case 'message_pinned':
          setPinnedMessageId(data.message_id)
          break
        case 'user_banned':
          setBannedUserIds(prev => [...prev, data.user_id])
          setViewers(prev => prev.filter(v => v.id !== data.user_id))
          break
        case 'error':
          console.error('Stream WS error:', data.message)
          break
        case 'pong':
          break
      }
    } catch (err) {
      console.error('Failed to parse livestream WS message:', err)
    }
  }, [])

  const connect = useCallback(() => {
    if (!streamId || !enabled) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setStatus('connecting')

    try {
      const ws = new WebSocket(getWSUrl())

      ws.onopen = () => {
        setStatus('connected')
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
          } else if (pingRef.current) {
            clearInterval(pingRef.current)
          }
        }, 30000)
      }

      ws.onmessage = handleMessage

      ws.onerror = () => setStatus('error')

      ws.onclose = () => {
        setStatus('disconnected')
        if (pingRef.current) {
          clearInterval(pingRef.current)
          pingRef.current = null
        }
        // Reconnect after 3 seconds if still enabled
        if (enabled && streamId) {
          reconnectRef.current = setTimeout(() => connect(), 3000)
        }
      }

      wsRef.current = ws
    } catch (err) {
      console.error('Failed to create livestream WebSocket:', err)
      setStatus('error')
    }
  }, [streamId, enabled, getWSUrl, handleMessage])

  const disconnect = useCallback(() => {
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current)
      reconnectRef.current = null
    }
    if (pingRef.current) {
      clearInterval(pingRef.current)
      pingRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setStatus('disconnected')
  }, [])

  useEffect(() => {
    if (enabled && streamId) {
      connect()
    } else {
      disconnect()
    }
    return () => disconnect()
  }, [enabled, streamId, connect, disconnect])

  const sendChatMessage = useCallback((content: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'chat_message', content }))
    }
  }, [])

  const sendLike = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'like' }))
    }
  }, [])

  const pinMessage = useCallback((messageId: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'pin_message', message_id: messageId }))
    }
  }, [])

  const banUser = useCallback((userId: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'ban_user', user_id: userId }))
    }
  }, [])

  return {
    status,
    messages,
    viewers,
    viewerCount,
    totalLikes,
    pinnedMessageId,
    bannedUserIds,
    streamEnded,
    sendChatMessage,
    sendLike,
    pinMessage,
    banUser,
  }
}
