import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { blockUser, muteUser, reportContent } from '../api'
import type { ReportPayload } from '../types'
import ReportModal from './ReportModal'

interface UserActionMenuProps {
  username: string
  currentUsername?: string
  contentType: 'user' | 'post' | 'comment'
  targetId: { username?: string; post_id?: number; comment_id?: number }
}

export default function UserActionMenu({ username, currentUsername, contentType, targetId }: UserActionMenuProps) {
  const [open, setOpen] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'block' | 'mute' | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const updatePosition = useCallback(() => {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    setMenuPos({
      top: rect.bottom + 4,
      left: rect.right - 208, // 208 = w-52 (13rem)
    })
  }, [])

  useEffect(() => {
    if (!open) return
    updatePosition()
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
        setConfirmAction(null)
      }
    }
    const handleScroll = () => { setOpen(false); setConfirmAction(null) }
    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [open, updatePosition])

  const blockMutation = useMutation({
    mutationFn: () => blockUser(username),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] })
      queryClient.invalidateQueries({ queryKey: ['comments'] })
      queryClient.invalidateQueries({ queryKey: ['userProfile', username] })
      setOpen(false)
      setConfirmAction(null)
    },
  })

  const muteMutation = useMutation({
    mutationFn: () => muteUser(username),
    onSuccess: () => {
      setOpen(false)
      setConfirmAction(null)
    },
  })

  const reportMutation = useMutation({
    mutationFn: (payload: ReportPayload) => reportContent(payload),
    onSuccess: () => {
      setShowReport(false)
    },
  })

  // Don't show menu for own content
  if (!currentUsername || currentUsername === username) return null

  return (
    <>
      <div className="relative">
        <button
          ref={btnRef}
          onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(!open); setConfirmAction(null) }}
          className="p-1.5 rounded-full transition-all hover:bg-[var(--bg-tertiary)]"
          style={{ color: 'var(--text-tertiary)' }}
          aria-label="More options"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
            <circle cx="12" cy="5" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="19" r="1.5" />
          </svg>
        </button>
      </div>

      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed w-52 rounded-xl overflow-hidden shadow-xl z-[9999] border animate-slideInFromBottom"
          style={{
            top: menuPos.top,
            left: Math.max(8, menuPos.left),
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border-light)',
          }}
        >
            {confirmAction === null ? (
              <>
                <button
                  onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(false); setShowReport(true) }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-[var(--bg-tertiary)]"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                    <line x1="4" y1="22" x2="4" y2="15" />
                  </svg>
                  Report
                </button>
                <button
                  onClick={e => { e.preventDefault(); e.stopPropagation(); setConfirmAction('mute') }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-[var(--bg-tertiary)]"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
                    <path d="M11 5L6 9H2v6h4l5 4V5z" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                  Mute @{username}
                </button>
                <button
                  onClick={e => { e.preventDefault(); e.stopPropagation(); setConfirmAction('block') }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-[var(--bg-tertiary)]"
                  style={{ color: 'var(--danger)' }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                  </svg>
                  Block @{username}
                </button>
              </>
            ) : (
              <div className="p-4">
                <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                  {confirmAction === 'block' ? `Block @${username}?` : `Mute @${username}?`}
                </p>
                <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
                  {confirmAction === 'block'
                    ? "They won't be able to see your posts or message you. You won't see their content."
                    : "You won't see their posts in your feed. They won't know they're muted."}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={e => { e.preventDefault(); e.stopPropagation(); setConfirmAction(null) }}
                    className="flex-1 px-3 py-2 text-xs font-medium rounded-full transition-colors hover:bg-[var(--bg-tertiary)]"
                    style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={e => {
                      e.preventDefault(); e.stopPropagation()
                      if (confirmAction === 'block') blockMutation.mutate()
                      else muteMutation.mutate()
                    }}
                    disabled={blockMutation.isPending || muteMutation.isPending}
                    className="flex-1 px-3 py-2 text-xs font-semibold rounded-full text-white transition-all hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: confirmAction === 'block' ? 'var(--danger)' : 'var(--accent)' }}
                  >
                    {(blockMutation.isPending || muteMutation.isPending) ? '...' : confirmAction === 'block' ? 'Block' : 'Mute'}
                  </button>
                </div>
              </div>
            )}
          </div>
        , document.body
      )}

      <ReportModal
        isOpen={showReport}
        onClose={() => setShowReport(false)}
        onSubmit={payload => reportMutation.mutate(payload)}
        submitting={reportMutation.isPending}
        contentType={contentType}
        targetId={targetId}
      />
    </>
  )
}
