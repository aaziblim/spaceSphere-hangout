import React, { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchPost, likePost, dislikePost, deletePost } from '../api'
import { useAuth } from '../AuthContext'
import type { Post } from '../types'
import CommentSection from '../components/CommentSection'

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function PostDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteText, setDeleteText] = useState('')

  const postQuery = useQuery<Post>({
    queryKey: ['post', slug],
    queryFn: () => fetchPost(slug!),
    enabled: !!slug,
  })

  const likeMutation = useMutation({
    mutationFn: () => likePost(slug!),
    onSuccess: (data) => queryClient.setQueryData(['post', slug], data),
    onError: (err) => console.error('Like failed:', err),
  })

  const dislikeMutation = useMutation({
    mutationFn: () => dislikePost(slug!),
    onSuccess: (data) => queryClient.setQueryData(['post', slug], data),
    onError: (err) => console.error('Dislike failed:', err),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deletePost(slug!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] })
      navigate('/')
    },
  })

  const handleConfirmDelete = () => {
    if (deleteText === 'DELETE') {
      deleteMutation.mutate()
      setShowDeleteModal(false)
      setDeleteText('')
    }
  }

  if (postQuery.isLoading) {
    return (
      <div className="w-full">
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}>
          <div className="aspect-video skeleton" />
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full skeleton" />
              <div className="space-y-1.5">
                <div className="h-4 w-24 skeleton rounded" />
                <div className="h-3 w-16 skeleton rounded" />
              </div>
            </div>
            <div className="h-4 w-full skeleton rounded" />
            <div className="h-4 w-3/4 skeleton rounded" />
          </div>
        </div>
      </div>
    )
  }

  if (postQuery.isError || !postQuery.data) {
    return (
      <div className="w-full">
        <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}>
          <div className="w-14 h-14 mx-auto mb-3 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7" style={{ color: 'var(--danger)' }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Post not found</h3>
          <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>This post may have been deleted</p>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 rounded-full text-white text-sm font-medium"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            Go Home
          </button>
        </div>
      </div>
    )
  }

  const post = postQuery.data
  const isOwner = user?.id === post.author.id

  return (
    <div className="w-full">
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-2 text-sm font-medium transition-colors"
        style={{ color: 'var(--accent)' }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      {/* Post Card */}
      <div className="rounded-3xl overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}>
        
        {/* ===== TOP: Profile Header ===== */}
        <div className="p-4 flex items-center justify-between">
          <Link to={`/user/${post.author.username}`} className="flex items-center gap-3">
            <div className="relative">
              <div 
                className="w-11 h-11 rounded-full overflow-hidden ring-2 ring-offset-2"
                style={{ 
                  backgroundColor: 'var(--bg-tertiary)',
                  '--tw-ring-color': 'var(--border-light)',
                  '--tw-ring-offset-color': 'var(--bg-primary)'
                } as React.CSSProperties}
              >
                {post.author.profile_image ? (
                  <img src={post.author.profile_image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white font-semibold" style={{ backgroundColor: 'var(--accent)' }}>
                    {post.author.username.slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              {/* Online indicator */}
              <span 
                className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                style={{ 
                  backgroundColor: 'var(--success)', 
                  borderColor: 'var(--bg-primary)' 
                }}
              />
            </div>
            <div>
              <p className="font-semibold text-[15px]" style={{ color: 'var(--text-primary)' }}>{post.author.username}</p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{formatDate(post.date_posted)}</p>
            </div>
          </Link>

          {isOwner && (
            <div className="flex gap-1">
              <Link
                to={`/posts/${post.slug || post.public_id}/edit`}
                className="p-2.5 rounded-xl transition-colors hover:bg-[var(--bg-tertiary)]"
                style={{ color: 'var(--text-secondary)' }}
                title="Edit"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </Link>
              <button
                className="p-2.5 rounded-xl transition-colors hover:bg-[var(--bg-tertiary)]"
                style={{ color: 'var(--danger)' }}
                onClick={() => setShowDeleteModal(true)}
                disabled={deleteMutation.isPending}
                aria-label="Delete post"
                title="Delete"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* ===== MIDDLE: Media (Image or Video) ===== */}
        {(post.post_image_url || post.post_video_url) && (
          <div 
            className="overflow-hidden relative"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          >
            {post.post_video_url ? (
              <video 
                src={post.post_video_url}
                controls
                className="w-full max-h-[70vh] object-cover"
              />
            ) : post.post_image_url ? (
              <img 
                src={post.post_image_url} 
                alt="" 
                className="w-full max-h-[70vh] object-cover"
              />
            ) : null}
          </div>
        )}

        {/* ===== BOTTOM: Actions, Title & Content ===== */}
        <div className="p-5">
          {/* Actions Row */}
          <div className="flex items-center gap-0.5 mb-4">
            <button
              type="button"
              onClick={() => likeMutation.mutate()}
              disabled={likeMutation.isPending || dislikeMutation.isPending || !user}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
              style={{ 
                backgroundColor: post.user_has_liked ? 'var(--success-alpha)' : 'transparent',
                color: post.user_has_liked ? 'var(--success)' : 'var(--text-secondary)' 
              }}
            >
              <svg viewBox="0 0 24 24" fill={post.user_has_liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
              </svg>
              {post.likes_count > 0 && post.likes_count}
            </button>

            <button
              type="button"
              onClick={() => dislikeMutation.mutate()}
              disabled={likeMutation.isPending || dislikeMutation.isPending || !user}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
              style={{ 
                backgroundColor: post.user_has_disliked ? 'var(--danger-alpha)' : 'transparent',
                color: post.user_has_disliked ? 'var(--danger)' : 'var(--text-secondary)' 
              }}
            >
              <svg viewBox="0 0 24 24" fill={post.user_has_disliked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
                <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
              </svg>
              {post.dislikes_count > 0 && post.dislikes_count}
            </button>

            <span 
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              {post.comments_count}
            </span>

            <div className="flex-1" />

            <button type="button" aria-label="Save" className="p-2 rounded-xl transition-all hover:scale-105" style={{ color: 'var(--text-secondary)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </button>

            <button type="button" aria-label="Share" className="p-2 rounded-xl transition-all hover:scale-105" style={{ color: 'var(--text-secondary)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </button>
          </div>

          {/* Title & Content - Below Actions */}
          {post.title && (
            <h1 className="text-xl font-bold mb-2 leading-tight" style={{ color: 'var(--text-primary)' }}>{post.title}</h1>
          )}

          <div className="text-[15px] leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'var(--text-secondary)' }}>
            {post.content}
          </div>
        </div>
      </div>

      {/* Comments Section */}
      <div className="rounded-2xl p-5 mt-4" style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}>
        <CommentSection postId={post.id} currentUser={user} />
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 space-y-4" style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--danger)', color: 'var(--text-on-accent)' }}>
                !
              </div>
              <div>
                <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Delete post?</h3>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>This cannot be undone. Type DELETE to confirm.</p>
              </div>
            </div>

            <input
              type="text"
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              placeholder="Type DELETE"
              className="w-full px-3 py-2 rounded-lg border"
              style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ color: 'var(--text-secondary)' }}
                onClick={() => {
                  setShowDeleteModal(false)
                  setDeleteText('')
                }}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: deleteText === 'DELETE' ? 'var(--danger)' : 'var(--bg-tertiary)', opacity: deleteText === 'DELETE' ? 1 : 0.6 }}
                onClick={handleConfirmDelete}
                disabled={deleteMutation.isPending || deleteText !== 'DELETE'}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
