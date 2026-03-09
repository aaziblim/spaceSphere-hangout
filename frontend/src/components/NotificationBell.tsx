import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchNotifications, markNotificationsRead } from '../api'
import { useNotificationWebSocket } from '../hooks/useNotificationWebSocket'
import type { AppNotification } from '../types'

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function notificationText(n: AppNotification): string {
  switch (n.type) {
    case 'like':
      return `liked your post${n.post_title ? ` "${n.post_title}"` : ''}`
    case 'comment':
      return `commented on your post${n.post_title ? ` "${n.post_title}"` : ''}`
    case 'reply':
      return `replied to your comment${n.post_title ? ` on "${n.post_title}"` : ''}`
    case 'follow':
      return 'started following you'
    default:
      return 'interacted with you'
  }
}

function notificationLink(n: AppNotification): string {
  if (n.type === 'follow') return `/user/${n.actor.username}`
  if (n.post_slug) return `/posts/${n.post_slug}`
  return '/'
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  // Connect WebSocket for real-time delivery
  useNotificationWebSocket()

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotifications,
    staleTime: 30000,
    refetchInterval: 60000,
  })

  const notifications = data?.notifications ?? []
  const unreadCount = data?.unread_count ?? 0

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleOpen = async () => {
    setOpen(!open)
    // Mark all as read when opening
    if (!open && unreadCount > 0) {
      await markNotificationsRead()
      queryClient.setQueryData<{ notifications: AppNotification[]; unread_count: number }>(
        ['notifications'],
        (old) => {
          if (!old) return old
          return {
            notifications: old.notifications.map(n => ({ ...n, is_read: true })),
            unread_count: 0,
          }
        }
      )
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleOpen}
        className="w-9 h-9 rounded-full flex items-center justify-center transition-colors relative"
        style={{ color: 'var(--text-secondary)' }}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white"
            style={{ backgroundColor: 'var(--danger)' }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border shadow-lg"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)' }}
        >
          <div className="px-4 py-3 border-b font-semibold text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
            Notifications
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
              No notifications yet
            </div>
          ) : (
            notifications.map((n) => (
              <Link
                key={n.id}
                to={notificationLink(n)}
                onClick={() => setOpen(false)}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--bg-tertiary)]"
                style={{
                  backgroundColor: n.is_read ? 'transparent' : 'var(--accent-alpha)',
                }}
              >
                <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-gray-200">
                  {n.actor.profile_image ? (
                    <img src={n.actor.profile_image} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white text-xs font-semibold" style={{ backgroundColor: 'var(--accent)' }}>
                      {n.actor.username.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug" style={{ color: 'var(--text-primary)' }}>
                    <span className="font-semibold">{n.actor.username}</span>{' '}
                    <span style={{ color: 'var(--text-secondary)' }}>{notificationText(n)}</span>
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                    {timeAgo(n.created_at)}
                  </p>
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  )
}
