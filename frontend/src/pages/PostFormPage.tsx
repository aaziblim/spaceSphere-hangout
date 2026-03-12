import { useState, useEffect, type FormEvent } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchPost, createPost, updatePost } from '../api'
import { useAuth } from '../AuthContext'

export default function PostFormPage() {
  const { slug } = useParams<{ slug: string }>()
  const isEdit = !!slug
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [video, setVideo] = useState<File | null>(null)
  const [videoPreview, setVideoPreview] = useState<string | null>(null)
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null)
  const [error, setError] = useState('')

  const postQuery = useQuery({
    queryKey: ['post', slug],
    queryFn: () => fetchPost(slug!),
    enabled: isEdit,
  })

  useEffect(() => {
    if (postQuery.data) {
      setTitle(postQuery.data.title)
      setContent(postQuery.data.content)
      if (postQuery.data.post_image_url) {
        setImagePreview(postQuery.data.post_image_url)
        setMediaType('image')
      }
      if (postQuery.data.post_video_url) {
        setVideoPreview(postQuery.data.post_video_url)
        setMediaType('video')
      }
    }
  }, [postQuery.data])

  useEffect(() => {
    if (image) {
      const url = URL.createObjectURL(image)
      setImagePreview(url)
      setMediaType('image')
      // Clear video when image is selected
      setVideo(null)
      setVideoPreview(null)
      return () => URL.revokeObjectURL(url)
    }
  }, [image])

  useEffect(() => {
    if (video) {
      const url = URL.createObjectURL(video)
      setVideoPreview(url)
      setMediaType('video')
      // Clear image when video is selected
      setImage(null)
      setImagePreview(null)
      return () => URL.revokeObjectURL(url)
    }
  }, [video])

  const [searchParams] = useSearchParams()
  const communitySlug = searchParams.get('community')

  const createMutation = useMutation({
    mutationFn: () => createPost({
      title,
      content,
      post_image: image,
      post_video: video,
      community_slug: communitySlug
    }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['posts'] })
      if (communitySlug) {
        queryClient.invalidateQueries({ queryKey: ['communityPosts', communitySlug] })
      }
      navigate(`/posts/${data.slug || data.public_id}`)
    },
    onError: () => setError('Failed to create post. Please try again.'),
  })

  const updateMutation = useMutation({
    mutationFn: () => updatePost(slug!, { title, content, post_image: image, post_video: video }),
    onSuccess: (data) => {
      queryClient.setQueryData(['post', slug], data)
      queryClient.invalidateQueries({ queryKey: ['posts'] })
      navigate(`/posts/${data.slug || data.public_id}`)
    },
    onError: () => setError('Failed to update post. Please try again.'),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!title.trim() || !content.trim()) {
      setError('Title and content are required.')
      return
    }
    if (isEdit) {
      updateMutation.mutate()
    } else {
      createMutation.mutate()
    }
  }

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4">
        <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}>
          <div className="w-14 h-14 mx-auto mb-3 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7" style={{ color: 'var(--danger)' }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Sign in required</h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            You must be signed in to {isEdit ? 'edit' : 'create'} posts
          </p>
        </div>
      </div>
    )
  }

  if (isEdit && postQuery.isLoading) {
    return (
      <div className="max-w-lg mx-auto px-4">
        <div className="rounded-2xl p-6 space-y-5" style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}>
          <div className="h-6 w-32 skeleton rounded" />
          <div className="h-12 w-full skeleton rounded-xl" />
          <div className="h-28 w-full skeleton rounded-xl" />
          <div className="h-10 w-24 skeleton rounded-xl" />
        </div>
      </div>
    )
  }

  if (isEdit && postQuery.data && user.id !== postQuery.data.author.id) {
    return (
      <div className="max-w-lg mx-auto px-4">
        <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}>
          <div className="w-14 h-14 mx-auto mb-3 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7" style={{ color: 'var(--danger)' }}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Access Denied</h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>You can only edit your own posts</p>
        </div>
      </div>
    )
  }

  const isPending = createMutation.isPending || updateMutation.isPending
  const charCount = content.length
  const titleLength = title.length
  const canSubmit = title.trim().length > 0 && content.trim().length > 0 && !isPending

  return (
    <div className="max-w-2xl mx-auto px-4 pb-12">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-8">
        <button
          type="button"
          onClick={() => navigate(-1)}
          disabled={isPending}
          className="flex items-center gap-1.5 text-sm font-medium rounded-full px-3 py-1.5 transition-all hover:opacity-80 active:scale-95"
          style={{ color: 'var(--accent)' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back
        </button>
        <button
          type="button"
          onClick={handleSubmit as any}
          disabled={!canSubmit}
          className="text-sm font-semibold rounded-full px-5 py-2 transition-all hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          style={{
            backgroundColor: canSubmit ? 'var(--accent)' : 'var(--bg-tertiary)',
            color: canSubmit ? 'var(--text-on-accent)' : 'var(--text-tertiary)',
          }}
        >
          {isPending ? (
            <>
              <div
                className="w-3.5 h-3.5 border-2 rounded-full animate-spin"
                style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }}
              />
              {isEdit ? 'Saving' : 'Publishing'}
            </>
          ) : (
            isEdit ? 'Save' : 'Publish'
          )}
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          className="mb-6 px-4 py-3 rounded-2xl text-sm font-medium flex items-center gap-2.5 animate-in slide-in-from-top-2"
          style={{ backgroundColor: 'var(--danger-alpha)', color: 'var(--danger)' }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 flex-shrink-0 opacity-80">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-2h2v2h-2zm0-4V7h2v6h-2z" />
          </svg>
          {error}
        </div>
      )}

      {/* Composer Area */}
      <div
        className="rounded-3xl overflow-hidden transition-shadow"
        style={{
          backgroundColor: 'var(--bg-primary)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)',
        }}
      >
        {/* Media Preview — show above the text when media is attached */}
        {(imagePreview || videoPreview) && (
          <div className="relative group">
            {mediaType === 'video' && videoPreview ? (
              <video
                src={videoPreview}
                controls
                className="w-full max-h-80 object-contain bg-black"
              />
            ) : imagePreview ? (
              <img
                src={imagePreview}
                alt="Preview"
                className="w-full max-h-80 object-cover"
              />
            ) : null}
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent pointer-events-none" />
            <button
              type="button"
              onClick={() => {
                setImage(null)
                setImagePreview(null)
                setVideo(null)
                setVideoPreview(null)
                setMediaType(null)
              }}
              className="absolute top-3 right-3 p-2 rounded-full backdrop-blur-md text-white transition-all hover:scale-105 active:scale-95"
              style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
              title="Remove media"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {/* Text Editing Area */}
        <div className="p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-1">
            {/* Title — large, bold, borderless */}
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isEdit ? 'Post title' : 'Title'}
              disabled={isPending}
              maxLength={300}
              className="w-full text-2xl sm:text-3xl font-bold bg-transparent border-none outline-none placeholder:opacity-30 transition-colors"
              style={{
                color: 'var(--text-primary)',
                caretColor: 'var(--accent)',
              }}
            />

            {/* Subtle character hint for title */}
            {titleLength > 200 && (
              <p className="text-xs tabular-nums text-right" style={{ color: titleLength > 280 ? 'var(--danger)' : 'var(--text-tertiary)' }}>
                {titleLength}/300
              </p>
            )}

            {/* Divider */}
            <div className="py-2">
              <div className="h-px w-12 rounded-full" style={{ backgroundColor: 'var(--border-light)' }} />
            </div>

            {/* Content — clean, distraction-free textarea */}
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Tell your story..."
              rows={8}
              disabled={isPending}
              className="w-full text-base sm:text-lg leading-relaxed bg-transparent border-none outline-none placeholder:opacity-30 resize-none transition-colors"
              style={{
                color: 'var(--text-primary)',
                caretColor: 'var(--accent)',
                minHeight: '200px',
              }}
            />
          </form>
        </div>

        {/* Bottom Toolbar */}
        <div
          className="flex items-center justify-between px-6 sm:px-8 py-4"
          style={{ borderTop: '1px solid var(--border-light)' }}
        >
          {/* Media buttons */}
          <div className="flex items-center gap-1">
            {/* Image Upload */}
            <label
              className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-all hover:opacity-70 active:scale-95"
              style={{ color: 'var(--text-secondary)' }}
              title="Add image"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="9" cy="9" r="1.5" />
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
              <span className="text-sm font-medium hidden sm:inline">Photo</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) setImage(file)
                }}
                disabled={isPending}
                className="hidden"
              />
            </label>

            {/* Video Upload */}
            <label
              className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-all hover:opacity-70 active:scale-95"
              style={{ color: 'var(--text-secondary)' }}
              title="Add video"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
                <rect x="2" y="4" width="20" height="16" rx="3" />
                <polygon points="10 8.5 16 12 10 15.5" fill="currentColor" stroke="none" />
              </svg>
              <span className="text-sm font-medium hidden sm:inline">Video</span>
              <input
                type="file"
                accept="video/*"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) setVideo(file)
                }}
                disabled={isPending}
                className="hidden"
              />
            </label>
          </div>

          {/* Character count */}
          <span
            className="text-xs tabular-nums font-medium transition-colors"
            style={{ color: charCount > 0 ? 'var(--text-tertiary)' : 'transparent' }}
          >
            {charCount.toLocaleString()} {charCount === 1 ? 'character' : 'characters'}
          </span>
        </div>
      </div>
    </div>
  )
}
