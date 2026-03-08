import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchComments, createComment, deleteComment, likeComment, dislikeComment } from '../api'
import type { Comment, User } from '../types'

function timeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  const weeks = Math.floor(days / 7)
  if (weeks < 4) return `${weeks}w`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo`
  return `${Math.floor(months / 12)}y`
}

interface CommentSectionProps {
  postId: number
  currentUser: User | null
}

interface CommentItemProps {
  comment: Comment
  postId: number
  currentUser: User | null
  depth?: number
  onReply: (parentId: number, username: string) => void
  isReplying: boolean
  onSubmitReply: (content: string, parentId: number) => void
  onCancelReply: () => void
  replyPending: boolean
}

function HeartIcon({ filled, animating }: { filled: boolean; animating: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.5}
      className={`w-4 h-4 transition-transform ${animating ? 'scale-125' : ''}`}
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

const EMOJI_CATEGORIES: Record<string, { icon: string; emojis: string[] }> = {
  smileys: { icon: '😀', emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😋','😛','😜','🤪','😎','🤗','🤔','🙄','😏','😬','😌','😔','😴','😷','🤯','😱','😨','😢','😭','😤','😠','😡','🤬','👿','💀','💩','🤡','👻','👽','🤖'] },
  gestures: { icon: '👋', emojis: ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪','🦾'] },
  hearts: { icon: '❤️', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','💕','💞','💓','💗','💖','💘','💝','💟','♥️','🫶'] },
  animals: { icon: '🐶', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🦅','🦆','🦉','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐙'] },
  food: { icon: '🍕', emojis: ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🥑','🥦','🌽','🌶️','🥕','🍞','🍕','🍔','🍟','🌭','🍿','🧁','🍰','🎂','🍩','🍪'] },
  objects: { icon: '⚽', emojis: ['⚽','🏀','🏈','⚾','🎾','🎱','🎯','🎮','🕹️','🎲','🎭','🎨','🎬','🎤','🎧','🎵','🎶','🎸','📱','💻','📷','💡','📚','✏️','🔑','🔒'] },
  symbols: { icon: '🔥', emojis: ['🔥','⭐','🌟','✨','💥','💫','🎉','🎊','💯','🏆','🥇','🥈','🥉','✅','❌','⭕','❗','❓','💤','💬','💭','♻️','⚡','🌈','☀️','🌙','⛅','🌊','🍀','🚀'] },
}

function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [activeCategory, setActiveCategory] = useState('smileys')

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}
    >
      {/* Category tabs - icons only */}
      <div
        className="flex items-center justify-around px-1 py-1.5"
        style={{ borderBottom: '1px solid var(--border-light)' }}
      >
        {Object.entries(EMOJI_CATEGORIES).map(([key, cat]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveCategory(key)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-base transition-all"
            style={{
              backgroundColor: activeCategory === key ? 'var(--bg-tertiary)' : 'transparent',
            }}
          >
            {cat.icon}
          </button>
        ))}
      </div>
      {/* Emoji grid */}
      <div className="p-2 grid grid-cols-8 gap-0.5 max-h-40 overflow-y-auto">
        {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onSelect(emoji)}
            className="w-8 h-8 flex items-center justify-center text-lg rounded-lg hover:bg-[var(--bg-tertiary)] hover:scale-110 transition-all"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}

function CommentItem({
  comment,
  postId,
  currentUser,
  depth = 0,
  onReply,
  isReplying,
  onSubmitReply,
  onCancelReply,
  replyPending
}: CommentItemProps) {
  const queryClient = useQueryClient()
  const [replyContent, setReplyContent] = useState('')
  const [likeAnimating, setLikeAnimating] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isReplying && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isReplying])

  const likeMutation = useMutation({
    mutationFn: () => likeComment(comment.id),
    onMutate: () => {
      setLikeAnimating(true)
      setTimeout(() => setLikeAnimating(false), 200)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comments', postId] }),
  })

  const dislikeMutation = useMutation({
    mutationFn: () => dislikeComment(comment.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comments', postId] }),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteComment(comment.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comments', postId] }),
  })

  const handleSubmitReply = (e: React.FormEvent) => {
    e.preventDefault()
    if (replyContent.trim()) {
      onSubmitReply(replyContent, comment.id)
      setReplyContent('')
    }
  }

  const isAuthor = currentUser?.id === comment.author.id
  const hasReplies = comment.replies && comment.replies.length > 0
  const maxDepth = 2

  return (
    <div className="relative flex gap-3">
      {/* Avatar column with thread line */}
      <div className="flex flex-col items-center shrink-0">
        <Link to={`/user/${comment.author.username}`}>
          <div
            className="w-8 h-8 rounded-full overflow-hidden hover:ring-2 hover:ring-[var(--accent)] transition-all"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          >
            {comment.author.profile_image ? (
              <img src={comment.author.profile_image} alt="" className="w-full h-full object-cover" />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {comment.author.username.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </Link>
        {/* Thread line connecting to replies */}
        {hasReplies && (
          <div
            className="w-0.5 flex-1 mt-1 rounded-full"
            style={{ backgroundColor: 'var(--border)' }}
          />
        )}
      </div>

      {/* Content column */}
      <div className="flex-1 min-w-0 pb-4">
        {/* Author + time */}
        <div className="flex items-center gap-2 mb-0.5">
          <Link
            to={`/user/${comment.author.username}`}
            className="font-semibold text-[13px] hover:underline"
            style={{ color: 'var(--text-primary)' }}
          >
            {comment.author.username}
          </Link>
          <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            {timeAgo(comment.created_at)}
          </span>
          {isAuthor && (
            <span
              className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
              style={{ backgroundColor: 'var(--accent-alpha)', color: 'var(--accent)' }}
            >
              You
            </span>
          )}
        </div>

        {/* Comment text */}
        <p
          className="text-[14px] leading-relaxed break-words"
          style={{ color: 'var(--text-primary)' }}
        >
          {comment.content}
        </p>

        {/* Actions row */}
        <div className="flex items-center gap-1 mt-1.5">
          <button
            onClick={() => likeMutation.mutate()}
            disabled={!currentUser || likeMutation.isPending}
            className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
            style={{
              backgroundColor: comment.user_has_liked ? 'rgba(239, 68, 108, 0.12)' : 'transparent',
              color: comment.user_has_liked ? '#EF446C' : 'var(--text-tertiary)'
            }}
          >
            <HeartIcon filled={comment.user_has_liked} animating={likeAnimating} />
            {comment.likes_count > 0 && <span>{comment.likes_count}</span>}
          </button>

          {currentUser && depth < maxDepth && (
            <button
              onClick={() => onReply(comment.id, comment.author.username)}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-all hover:scale-105 active:scale-95"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              Reply
            </button>
          )}

          {isAuthor && (
            <button
              onClick={() => { if (confirm('Delete this comment?')) deleteMutation.mutate() }}
              disabled={deleteMutation.isPending}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-all hover:scale-105 active:scale-95 disabled:opacity-50 ml-auto"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5">
                <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>

        {/* Inline reply form */}
        {isReplying && (
          <form onSubmit={handleSubmitReply} className="mt-3">
            <div
              className="rounded-xl overflow-hidden transition-all focus-within:ring-2"
              style={{ backgroundColor: 'var(--bg-tertiary)', '--tw-ring-color': 'var(--accent)' } as React.CSSProperties}
            >
              <textarea
                ref={textareaRef}
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder={`Reply to @${comment.author.username}...`}
                className="w-full p-3 pb-2 text-[14px] resize-none bg-transparent outline-none"
                style={{ color: 'var(--text-primary)' }}
                rows={2}
              />
              <div className="flex items-center justify-end gap-2 px-2 pb-2">
                <button
                  type="button"
                  onClick={onCancelReply}
                  className="px-3 py-1.5 text-xs font-medium rounded-full"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!replyContent.trim() || replyPending}
                  className="px-4 py-1.5 text-white rounded-full text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  {replyPending ? 'Posting...' : 'Reply'}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Threaded replies */}
        {hasReplies && (
          <div className="mt-1">
            {comment.replies!.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                postId={postId}
                currentUser={currentUser}
                depth={depth + 1}
                onReply={onReply}
                isReplying={false}
                onSubmitReply={onSubmitReply}
                onCancelReply={onCancelReply}
                replyPending={replyPending}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function CommentSection({ postId, currentUser }: CommentSectionProps) {
  const queryClient = useQueryClient()
  const [newComment, setNewComment] = useState('')
  const [replyingTo, setReplyingTo] = useState<{ id: number; username: string } | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { data: comments = [], isLoading, isError } = useQuery({
    queryKey: ['comments', postId],
    queryFn: () => fetchComments(postId),
  })

  const createMutation = useMutation({
    mutationFn: (data: { content: string; parent?: number }) =>
      createComment({ post: postId, content: data.content, parent: data.parent }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', postId] })
      setNewComment('')
      setReplyingTo(null)
      setShowEmojiPicker(false)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (newComment.trim()) {
      createMutation.mutate({ content: newComment })
    }
  }

  const handleReply = (content: string, parentId: number) => {
    createMutation.mutate({ content, parent: parentId })
  }

  const totalComments = comments.reduce((acc, comment) => {
    return acc + 1 + (comment.replies?.length || 0)
  }, 0)

  if (isError) {
    return (
      <div className="text-center py-12">
        <div
          className="w-14 h-14 mx-auto mb-4 rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7" style={{ color: 'var(--danger)' }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Unable to load comments</p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h3 className="text-lg font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Comments
        </h3>
        {totalComments > 0 && (
          <span
            className="px-2 py-0.5 rounded-full text-xs font-semibold"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
          >
            {totalComments}
          </span>
        )}
      </div>

      {/* Comment composer */}
      {currentUser ? (
        <form onSubmit={handleSubmit} className="mb-8">
          <div className="flex gap-3">
            {/* Avatar */}
            <div className="shrink-0">
              <div
                className="w-9 h-9 rounded-full overflow-hidden"
                style={{ backgroundColor: 'var(--bg-tertiary)' }}
              >
                {currentUser.profile?.image ? (
                  <img src={currentUser.profile.image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-white text-sm font-bold"
                    style={{ backgroundColor: 'var(--accent)' }}
                  >
                    {currentUser.username.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            </div>

            {/* Input area */}
            <div className="flex-1 min-w-0">
              <div
                className="rounded-xl transition-all focus-within:ring-2"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  '--tw-ring-color': 'var(--accent)'
                } as React.CSSProperties}
              >
                <textarea
                  ref={textareaRef}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Write a comment..."
                  className="w-full px-3 pt-3 pb-2 text-[14px] resize-none bg-transparent outline-none placeholder:text-[var(--text-tertiary)]"
                  style={{ color: 'var(--text-primary)' }}
                  rows={2}
                />

                {/* Emoji picker - inline below textarea */}
                {showEmojiPicker && (
                  <div className="px-2 pb-2">
                    <EmojiPicker
                      onSelect={(emoji) => {
                        setNewComment(prev => prev + emoji)
                        textareaRef.current?.focus()
                      }}
                    />
                  </div>
                )}

                {/* Bottom toolbar */}
                <div className="flex items-center justify-between px-2 pb-2">
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker(prev => !prev)}
                    className="p-1.5 rounded-lg transition-all"
                    style={{
                      color: showEmojiPicker ? 'var(--accent)' : 'var(--text-tertiary)',
                      backgroundColor: showEmojiPicker ? 'var(--accent-alpha)' : 'transparent',
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                      <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth={2} strokeLinecap="round" />
                      <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth={2} strokeLinecap="round" />
                    </svg>
                  </button>

                  <button
                    type="submit"
                    disabled={!newComment.trim() || createMutation.isPending}
                    className="px-4 py-1.5 text-white rounded-full text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ backgroundColor: 'var(--accent)' }}
                  >
                    {createMutation.isPending ? 'Posting...' : 'Post'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </form>
      ) : (
        <div
          className="mb-8 p-5 rounded-xl text-center"
          style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-light)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            <Link to="/login" className="font-semibold hover:underline" style={{ color: 'var(--accent)' }}>
              Sign in
            </Link>
            {' '}to join the conversation
          </p>
        </div>
      )}

      {/* Comments list */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div
            className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
          />
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Loading comments...</p>
        </div>
      ) : comments.length === 0 ? (
        <div className="text-center py-16">
          <div
            className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="w-8 h-8" style={{ color: 'var(--text-tertiary)' }}>
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          </div>
          <h4 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
            Start the conversation
          </h4>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Be the first to share your thoughts
          </p>
        </div>
      ) : (
        <div>
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              postId={postId}
              currentUser={currentUser}
              onReply={(id, username) => setReplyingTo({ id, username })}
              isReplying={replyingTo?.id === comment.id}
              onSubmitReply={handleReply}
              onCancelReply={() => setReplyingTo(null)}
              replyPending={createMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  )
}
