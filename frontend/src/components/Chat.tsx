import { useState, useRef, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchConversations,
  startConversation,
  fetchMessages,
  sendMessage as sendMessageApi,
  conversationAction,
  fetchMessageRequests,
  fetchUnreadCount
} from '../api'
import { useChatWebSocket } from '../hooks/useChatWebSocket'
import { useE2EE } from '../hooks/useE2EE'
import type { Conversation, ChatParticipant, Message } from '../types'

// ============ TIME HELPERS ============

function formatMessageTime(date: string): string {
  const d = new Date(date)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  } else if (diffDays === 1) {
    return 'Yesterday'
  } else if (diffDays < 7) {
    return d.toLocaleDateString(undefined, { weekday: 'short' })
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatLastSeen(date?: string): string {
  if (!date) return 'Offline'
  const d = new Date(date)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ============ CHAT DRAWER (Main Component) ============

interface ChatDrawerProps {
  isOpen: boolean
  onClose: () => void
  initialConversation?: Conversation | null
}

export function ChatDrawer({ isOpen, onClose, initialConversation }: ChatDrawerProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(initialConversation || null)
  const [view, setView] = useState<'list' | 'chat' | 'requests'>(initialConversation ? 'chat' : 'list')
  const [newMessage, setNewMessage] = useState('')
  const [closing, setClosing] = useState(false)
  const [mounted, setMounted] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // WebSocket connection for real-time messaging
  const { status: wsStatus, sendMessage: wsSendMessage, sendTyping, markAsRead, typingStatus } = useChatWebSocket()

  // E2EE hook (decryption only — encryption disabled due to key-sync limitations)
  const { isInitialized: e2eeReady, isEnabled: e2eeEnabled, processMessageForDisplay } = useE2EE()

  // Track decrypted message content (Maps message ID to decrypted text)
  const [decryptedMessages, setDecryptedMessages] = useState<Record<string, string>>({})
  const decryptAttempted = useRef<Set<string>>(new Set())
  // Fetch conversations
  const { data: conversations = [], isLoading: loadingConversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: fetchConversations,
    enabled: isOpen && !!user,
    refetchInterval: wsStatus === 'connected' ? 30000 : 10000, // Less frequent polling when WS connected
  })

  // Fetch message requests
  const { data: messageRequests = [] } = useQuery({
    queryKey: ['message-requests'],
    queryFn: fetchMessageRequests,
    enabled: isOpen && !!user,
    refetchInterval: 30000,
  })

  // Fetch messages for active conversation
  const { data: messages = [], isLoading: loadingMessages } = useQuery({
    queryKey: ['messages', activeConversation?.id],
    queryFn: () => fetchMessages(activeConversation!.id),
    enabled: !!activeConversation && view === 'chat',
    refetchInterval: wsStatus === 'connected' ? false : 3000, // Disable polling when WS connected
  })

  // Send message mutation (fallback if WebSocket fails)
  const sendMutation = useMutation({
    mutationFn: (content: string) => sendMessageApi(activeConversation!.id, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', activeConversation?.id] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    }
  })

  // Accept/decline request mutation
  const requestActionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'accept' | 'decline' }) =>
      conversationAction(id, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-requests'] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    }
  })

  // Handle initial conversation
  useEffect(() => {
    if (initialConversation && isOpen) {
      setActiveConversation(initialConversation)
      setView('chat')
    }
  }, [initialConversation, isOpen])

  // Trigger enter animation
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setMounted(true))
    } else {
      setMounted(false)
    }
  }, [isOpen])

  // Mark messages as read when viewing conversation
  useEffect(() => {
    if (activeConversation && view === 'chat' && wsStatus === 'connected') {
      markAsRead(activeConversation.id)
    }
  }, [activeConversation, view, wsStatus, markAsRead])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'

    // Send typing indicator
    if (activeConversation && wsStatus === 'connected') {
      sendTyping(activeConversation.id, true)

      // Clear previous timeout and set new one to stop typing indicator
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
      typingTimeoutRef.current = setTimeout(() => {
        if (activeConversation) {
          sendTyping(activeConversation.id, false)
        }
      }, 2000)
    }
  }

  const openConversation = useCallback((convo: Conversation) => {
    setActiveConversation(convo)
    setView('chat')
  }, [])

  const closeConversation = useCallback(() => {
    setActiveConversation(null)
    setView('list')
    setNewMessage('')
  }, [])

  // Animated close
  const handleClose = useCallback(() => {
    setClosing(true)
    setTimeout(() => {
      setClosing(false)
      onClose()
    }, 250)
  }, [onClose])

  const getOtherParticipant = useCallback((convo: Conversation): ChatParticipant | undefined => {
    return convo.participants.find(p => p.username !== user?.username)
  }, [user?.username])

  const sendMessage = useCallback(async () => {
    if (!newMessage.trim() || !activeConversation || sendMutation.isPending) return

    const content = newMessage.trim()

    // Clear input immediately for responsiveness
    setNewMessage('')
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }

    // Send as plaintext — E2EE disabled due to key-sync limitations
    // (IndexedDB-only keys with no backup make messages unreadable across devices/sessions)

    // Try WebSocket first, fallback to API
    if (wsStatus === 'connected') {
      wsSendMessage(activeConversation.id, content)
      // Stop typing indicator
      sendTyping(activeConversation.id, false)
    } else {
      // Fallback to REST API
      sendMutation.mutate(content)
    }
  }, [newMessage, activeConversation, sendMutation, wsStatus, wsSendMessage, sendTyping])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const acceptRequest = (conversationId: string) => {
    requestActionMutation.mutate({ id: conversationId, action: 'accept' })
  }

  const declineRequest = (conversationId: string) => {
    requestActionMutation.mutate({ id: conversationId, action: 'decline' })
  }

  const requestCount = messageRequests.length

  // Clear attempt cache when E2EE state changes so messages get retried
  useEffect(() => {
    if (e2eeReady && e2eeEnabled) {
      decryptAttempted.current.clear()
    }
  }, [e2eeReady, e2eeEnabled])

  // Decrypt messages when they load (only after E2EE is initialized)
  useEffect(() => {
    if (!e2eeReady || messages.length === 0) return
    const decryptAll = async () => {
      for (const msg of messages) {
        if (msg.is_encrypted && !decryptedMessages[msg.id] && !decryptAttempted.current.has(msg.id)) {
          decryptAttempted.current.add(msg.id)
          const senderUsername = msg.sender.username
          const decrypted = await processMessageForDisplay(msg, senderUsername)
          setDecryptedMessages(prev => ({ ...prev, [msg.id]: decrypted }))
        }
      }
    }
    decryptAll()
  }, [messages, e2eeReady, decryptedMessages, processMessageForDisplay])

  // Helper to get display content for a message
  const getMessageContent = (msg: Message): string => {
    if (msg.is_unsent) return '[Message unsent]'
    if (msg.is_encrypted) {
      return decryptedMessages[msg.id] || 'Decrypting\u2026'
    }
    return msg.content
  }

  const isDecryptFailed = (msg: Message): boolean => {
    if (!msg.is_encrypted) return false
    const content = decryptedMessages[msg.id]
    return content === 'This message can\u2019t be decrypted on this device.'
  }

  if (!isOpen && !closing) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-sm transition-opacity duration-250"
        style={{ opacity: mounted && !closing ? 1 : 0 }}
        onClick={handleClose}
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 bottom-0 h-full z-[70] w-full max-w-md flex flex-col shadow-2xl border-l transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderColor: 'var(--border)',
          transform: mounted && !closing ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 h-14 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          {view === 'chat' ? (
            <>
              <button
                onClick={closeConversation}
                className="p-2 -ml-2 rounded-full transition-colors hover:bg-[var(--bg-tertiary)]"
                style={{ color: 'var(--text-primary)' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </button>
              {activeConversation && (
                <div className="flex items-center gap-3 flex-1 ml-2">
                  <div className="relative">
                    <div className="w-9 h-9 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      {getOtherParticipant(activeConversation)?.profile_image ? (
                        <img src={getOtherParticipant(activeConversation)?.profile_image!} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white font-semibold text-sm" style={{ backgroundColor: 'var(--accent)' }}>
                          {getOtherParticipant(activeConversation)?.username.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>
                    {getOtherParticipant(activeConversation)?.is_online && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                        style={{ backgroundColor: 'var(--success)', borderColor: 'var(--bg-primary)' }}
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/user/${getOtherParticipant(activeConversation)?.username}`}
                      className="font-semibold text-sm block truncate hover:underline"
                      style={{ color: 'var(--text-primary)' }}
                      onClick={onClose}
                    >
                      {getOtherParticipant(activeConversation)?.first_name || getOtherParticipant(activeConversation)?.username}
                    </Link>
                    <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-tertiary)' }}>
                      {typingStatus[activeConversation.id]?.isTyping ? (
                        <span style={{ color: 'var(--accent)' }}>typing...</span>
                      ) : getOtherParticipant(activeConversation)?.is_online ? (
                        'Active now'
                      ) : (
                        formatLastSeen(getOtherParticipant(activeConversation)?.last_seen)
                      )}
                      {wsStatus === 'connected' && (
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--success)' }} title="Real-time connected" />
                      )}
                    </p>
                  </div>
                </div>
              )}
            </>
          ) : view === 'requests' ? (
            <>
              <button
                onClick={() => setView('list')}
                className="p-2 -ml-2 rounded-full transition-colors hover:bg-[var(--bg-tertiary)]"
                style={{ color: 'var(--text-primary)' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </button>
              <h2 className="font-semibold text-base flex-1 ml-2" style={{ color: 'var(--text-primary)' }}>
                Message Requests
              </h2>
            </>
          ) : (
            <>
              <h2 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>Messages</h2>
              <div className="flex items-center gap-1">
                {requestCount > 0 && (
                  <button
                    onClick={() => setView('requests')}
                    className="relative p-2 rounded-full transition-colors hover:bg-[var(--bg-tertiary)]"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    <span
                      className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white"
                      style={{ backgroundColor: 'var(--accent)' }}
                    >
                      {requestCount}
                    </span>
                  </button>
                )}
                <button
                  onClick={handleClose}
                  className="p-2 rounded-full transition-colors hover:bg-[var(--bg-tertiary)]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {view === 'list' ? (
            // Conversations List
            <div className="divide-y" style={{ borderColor: 'var(--border-light)' }}>
              {loadingConversations ? (
                <div className="p-8 text-center">
                  <div className="w-8 h-8 mx-auto border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="p-8 text-center">
                  <div
                    className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: 'var(--bg-tertiary)' }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8" style={{ color: 'var(--text-tertiary)' }}>
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <h3 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No messages yet</h3>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Start a conversation by visiting someone's profile
                  </p>
                </div>
              ) : (
                conversations.map(convo => {
                  const other = getOtherParticipant(convo)
                  return (
                    <button
                      key={convo.id}
                      onClick={() => openConversation(convo)}
                      className="w-full flex items-center gap-3 p-4 text-left transition-colors hover:bg-[var(--bg-tertiary)]"
                    >
                      <div className="relative shrink-0">
                        <div className="w-12 h-12 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                          {other?.profile_image ? (
                            <img src={other.profile_image} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-white font-semibold" style={{ backgroundColor: 'var(--accent)' }}>
                              {other?.username.slice(0, 1).toUpperCase()}
                            </div>
                          )}
                        </div>
                        {other?.is_online && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2"
                            style={{ backgroundColor: 'var(--success)', borderColor: 'var(--bg-primary)' }}
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                            {other?.first_name || other?.username}
                          </span>
                          {convo.last_message && (
                            <span className="text-xs shrink-0 ml-2" style={{ color: 'var(--text-tertiary)' }}>
                              {formatMessageTime(convo.last_message.created_at)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <p
                            className="text-sm truncate flex-1"
                            style={{
                              color: convo.unread_count > 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
                              fontWeight: convo.unread_count > 0 ? 600 : 400
                            }}
                          >
                            {convo.last_message?.sender.username === user?.username && 'You: '}
                            {convo.last_message?.content || 'Start chatting'}
                          </p>
                          {convo.unread_count > 0 && (
                            <span
                              className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold flex items-center justify-center text-white"
                              style={{ backgroundColor: 'var(--accent)' }}
                            >
                              {convo.unread_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          ) : view === 'requests' ? (
            // Message Requests
            <div className="p-4">
              <div
                className="rounded-xl p-4 mb-4"
                style={{ backgroundColor: 'var(--bg-tertiary)' }}
              >
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>People who don't follow you</strong> can send you message requests. Accept to start chatting.
                </p>
              </div>

              {messageRequests.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No message requests</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {messageRequests.map(convo => {
                    const fromUser = getOtherParticipant(convo)
                    if (!fromUser) return null
                    return (
                      <div
                        key={convo.id}
                        className="rounded-xl p-4"
                        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                            {fromUser.profile_image ? (
                              <img src={fromUser.profile_image} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-white font-semibold text-sm" style={{ backgroundColor: 'var(--accent)' }}>
                                {fromUser.username.slice(0, 1).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                              {fromUser.first_name || fromUser.username}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                              @{fromUser.username} · {formatMessageTime(convo.updated_at)}
                            </p>
                          </div>
                        </div>
                        {convo.last_message && (
                          <p
                            className="text-sm mb-4 line-clamp-2"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            "{convo.last_message.content}"
                          </p>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => acceptRequest(convo.id)}
                            disabled={requestActionMutation.isPending}
                            className="flex-1 py-2 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
                            style={{ backgroundColor: 'var(--accent)' }}
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => declineRequest(convo.id)}
                            disabled={requestActionMutation.isPending}
                            className="flex-1 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
                            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            // Chat View
            <div className="flex flex-col h-full">
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingMessages ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                      Say hi to start the conversation! 👋
                    </p>
                  </div>
                ) : (
                  messages.map((msg, i) => {
                    const isOwn = msg.sender.username === user?.username
                    const showAvatar = !isOwn && (i === 0 || messages[i - 1].sender.username !== msg.sender.username)
                    const showTime = i === messages.length - 1 || messages[i + 1].sender.username !== msg.sender.username

                    return (
                      <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'} gap-2`}>
                        {!isOwn && (
                          <div className="w-7 h-7 shrink-0">
                            {showAvatar && (
                              <div className="w-7 h-7 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                {msg.sender.profile_image ? (
                                  <img src={msg.sender.profile_image} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-white text-xs font-semibold" style={{ backgroundColor: 'var(--accent)' }}>
                                    {msg.sender.username.slice(0, 1).toUpperCase()}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'}`}>
                          <div
                            className={`px-4 py-2.5 rounded-2xl text-[15px] leading-relaxed ${isOwn
                              ? 'rounded-br-md'
                              : 'rounded-bl-md'
                              }`}
                            style={{
                              backgroundColor: isOwn ? 'var(--accent)' : 'var(--bg-tertiary)',
                              color: isOwn ? 'white' : 'var(--text-primary)'
                            }}
                          >
                            {isDecryptFailed(msg) ? (
                              <span className="italic text-[13px] opacity-60">
                                {getMessageContent(msg)}
                              </span>
                            ) : msg.is_unsent ? (
                              <span className="italic opacity-50">{getMessageContent(msg)}</span>
                            ) : (
                              getMessageContent(msg)
                            )}
                            {msg.is_encrypted && !isDecryptFailed(msg) && (
                              <span title="End-to-end encrypted" className="ml-1 opacity-50 text-[12px]">🔒</span>
                            )}
                          </div>
                          {showTime && (
                            <p
                              className={`text-[10px] mt-1 ${isOwn ? 'text-right' : 'text-left'}`}
                              style={{ color: 'var(--text-tertiary)' }}
                            >
                              {formatMessageTime(msg.created_at)}
                              {isOwn && msg.read_at && ' · Read'}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}

                {/* Sending indicator */}
                {sendMutation.isPending && (
                  <div className="flex justify-end">
                    <div className="px-4 py-2.5 rounded-2xl rounded-br-md" style={{ backgroundColor: 'var(--accent)', opacity: 0.6 }}>
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Typing indicator */}
                {activeConversation && typingStatus[activeConversation.id]?.isTyping && (
                  <div className="flex justify-start gap-2">
                    <div className="w-7 h-7 shrink-0" />
                    <div
                      className="px-4 py-2.5 rounded-2xl rounded-bl-md"
                      style={{ backgroundColor: 'var(--bg-tertiary)' }}
                    >
                      <div className="flex gap-1 items-center">
                        <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: 'var(--text-tertiary)', animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: 'var(--text-tertiary)', animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: 'var(--text-tertiary)', animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>
          )}
        </div>

        {/* Input (only in chat view) */}
        {view === 'chat' && (
          <div
            className="p-3 border-t"
            style={{ borderColor: 'var(--border)' }}
          >
            <div
              className="flex items-end gap-2 rounded-2xl px-4 py-2"
              style={{ backgroundColor: 'var(--bg-tertiary)' }}
            >
              <textarea
                ref={inputRef}
                value={newMessage}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Message..."
                rows={1}
                className="flex-1 bg-transparent border-none resize-none outline-none text-[15px] py-1.5 max-h-[120px]"
                style={{ color: 'var(--text-primary)' }}
              />
              <button
                onClick={sendMessage}
                disabled={!newMessage.trim() || sendMutation.isPending}
                className="p-2 rounded-full transition-all disabled:opacity-40"
                style={{ color: 'var(--accent)' }}
              >
                {sendMutation.isPending ? (
                  <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ============ CHAT BUTTON (for navbar) ============

interface ChatButtonProps {
  onClick: () => void
  unreadCount?: number
}

export function ChatButton({ onClick, unreadCount = 0 }: ChatButtonProps) {
  return (
    <button
      onClick={onClick}
      className="relative w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--bg-tertiary)]"
      style={{ color: 'var(--text-secondary)' }}
      aria-label="Messages"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      {unreadCount > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white"
          style={{ backgroundColor: 'var(--danger)' }}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  )
}

// ============ MESSAGE BUTTON (for profiles) ============

interface MessageButtonProps {
  targetUser: ChatParticipant
  isFollowing: boolean
  onOpenChat: (convo?: Conversation) => void
}

export function MessageButton({ targetUser, isFollowing, onOpenChat }: MessageButtonProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [requestMessage, setRequestMessage] = useState('')

  // Start conversation mutation
  const startConvoMutation = useMutation({
    mutationFn: () => startConversation(targetUser.username),
    onSuccess: (convo) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      onOpenChat(convo)
    }
  })

  // Send first message mutation
  const sendFirstMsgMutation = useMutation({
    mutationFn: async () => {
      const convo = await startConversation(targetUser.username)
      await sendMessageApi(convo.id, requestMessage.trim())
      return convo
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      setShowRequestModal(false)
      setRequestMessage('')
    }
  })

  const handleClick = () => {
    if (!user) return

    if (isFollowing) {
      // Follower - start conversation directly
      startConvoMutation.mutate()
    } else {
      // Non-follower - show request modal
      setShowRequestModal(true)
    }
  }

  const sendRequest = () => {
    if (!requestMessage.trim()) return
    sendFirstMsgMutation.mutate()
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={startConvoMutation.isPending}
        className="flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
        style={{
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
          backgroundColor: 'transparent'
        }}
      >
        {startConvoMutation.isPending ? (
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
        Message
      </button>

      {/* Request Modal */}
      {showRequestModal && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm animate-fadeIn"
            onClick={() => !sendFirstMsgMutation.isPending && setShowRequestModal(false)}
          />
          <div
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90%] max-w-sm rounded-2xl p-5 animate-zoomIn"
            style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}
          >
            {sendFirstMsgMutation.isSuccess ? (
              <div className="text-center py-4">
                <div
                  className="w-14 h-14 mx-auto mb-3 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(52, 199, 89, 0.15)' }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-7 h-7" style={{ color: 'var(--success)' }}>
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <h3 className="font-semibold text-lg mb-1" style={{ color: 'var(--text-primary)' }}>Request Sent!</h3>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {targetUser.first_name || targetUser.username} will see your request
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                    {targetUser.profile_image ? (
                      <img src={targetUser.profile_image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white font-semibold" style={{ backgroundColor: 'var(--accent)' }}>
                        {targetUser.username.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      Message {targetUser.first_name || targetUser.username}
                    </h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Send a request to start chatting
                    </p>
                  </div>
                </div>

                <div
                  className="rounded-xl p-3 mb-3"
                  style={{ backgroundColor: 'var(--bg-tertiary)' }}
                >
                  <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
                    Since you don't follow each other, your message will be sent as a request.
                  </p>
                </div>

                <textarea
                  value={requestMessage}
                  onChange={(e) => setRequestMessage(e.target.value)}
                  placeholder="Write a message..."
                  rows={3}
                  className="w-full rounded-xl p-3 border resize-none outline-none text-sm"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: 'var(--border-light)',
                    color: 'var(--text-primary)'
                  }}
                  autoFocus
                />

                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => setShowRequestModal(false)}
                    disabled={sendFirstMsgMutation.isPending}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                    style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={sendRequest}
                    disabled={!requestMessage.trim() || sendFirstMsgMutation.isPending}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-50"
                    style={{ backgroundColor: 'var(--accent)' }}
                  >
                    {sendFirstMsgMutation.isPending ? 'Sending...' : 'Send Request'}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </>
  )
}

// ============ CHAT UNREAD HOOK ============

export function useChatUnread(): number {
  const { user } = useAuth()

  const { data } = useQuery({
    queryKey: ['unread-count'],
    queryFn: fetchUnreadCount,
    enabled: !!user,
    refetchInterval: 30000, // Poll every 30 seconds
  })

  return data?.unread_count ?? 0
}
