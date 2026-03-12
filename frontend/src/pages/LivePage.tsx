import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchLivestreams, createLivestream, goLive, type Livestream } from '../api'
import { useAuth } from '../AuthContext'

function formatViewers(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`
  return count.toString()
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

const CATEGORIES = [
  { value: 'gaming', label: 'Gaming', color: '#7c3aed' },
  { value: 'music', label: 'Music', color: '#ec4899' },
  { value: 'coding', label: 'Coding', color: '#06b6d4' },
  { value: 'art', label: 'Art', color: '#f59e0b' },
  { value: 'cooking', label: 'Cooking', color: '#f97316' },
  { value: 'chat', label: 'Chat', color: '#22c55e' },
  { value: 'education', label: 'Education', color: '#3b82f6' },
  { value: 'other', label: 'Other', color: '#6b7280' },
] as const

function getCategoryColor(category: string): string {
  return CATEGORIES.find(c => c.value === category)?.color || '#6b7280'
}

function getCategoryLabel(category: string): string {
  return CATEGORIES.find(c => c.value === category)?.label || category
}

function LiveStreamCard({ stream }: { stream: Livestream }) {
  return (
    <Link
      to={`/live/${stream.id}`}
      className="group block rounded-2xl overflow-hidden transition-all duration-300 hover:translate-y-[-4px]"
      style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}
    >
      {/* Thumbnail / Preview */}
      <div
        className="relative aspect-video overflow-hidden"
        style={{ backgroundColor: 'var(--bg-tertiary)' }}
      >
        {stream.thumbnail_url ? (
          <img
            src={stream.thumbnail_url}
            alt=""
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'var(--accent)', opacity: 0.2 }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10" style={{ color: 'var(--accent)' }}>
                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
              </svg>
            </div>
          </div>
        )}

        {/* Live Badge */}
        {stream.is_live && (
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-red-500 text-white text-xs font-bold uppercase tracking-wide flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
            </span>
            LIVE
          </div>
        )}

        {stream.status === 'scheduled' && (
          <div
            className="absolute top-3 left-3 px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wide"
            style={{ backgroundColor: 'var(--accent)', color: 'white' }}
          >
            Scheduled
          </div>
        )}

        {stream.status === 'ended' && (
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/60 text-white text-xs font-medium">
            {formatDuration(stream.duration)}
          </div>
        )}

        {/* Viewer count */}
        {stream.is_live && (
          <div className="absolute bottom-3 right-3 px-2 py-1 rounded-lg bg-black/60 text-white text-xs font-medium flex items-center gap-1">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
            </svg>
            {formatViewers(stream.viewer_count)}
          </div>
        )}

        {/* Category badge */}
        {stream.category && (
          <div
            className="absolute bottom-3 left-3 px-2 py-1 rounded-lg text-white text-[10px] font-bold uppercase tracking-wider"
            style={{ backgroundColor: getCategoryColor(stream.category) }}
          >
            {getCategoryLabel(stream.category)}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Host avatar */}
          <div
            className="w-10 h-10 rounded-full overflow-hidden shrink-0 ring-2"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              '--tw-ring-color': stream.is_live ? 'var(--danger)' : 'var(--border-light)'
            } as React.CSSProperties}
          >
            {stream.host.profile_image ? (
              <img src={stream.host.profile_image} alt="" className="w-full h-full object-cover" />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-white font-semibold text-sm"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {stream.host.username.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h3
              className="font-semibold text-[15px] truncate mb-0.5"
              style={{ color: 'var(--text-primary)' }}
            >
              {stream.title}
            </h3>
            <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
              {stream.host.username}
            </p>
            {stream.is_live && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                {formatViewers(stream.viewer_count)} watching • {formatViewers(stream.total_likes)} ❤️
              </p>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

function GoLiveModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('chat')
  const [step, setStep] = useState<'setup' | 'ready'>('setup')
  const [createdStream, setCreatedStream] = useState<Livestream | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user') // laptop/front by default
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [isCameraLoading, setIsCameraLoading] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setIsMobile(/Mobi|Android/i.test(navigator.userAgent))
  }, [])

  // Start camera preview with chosen facing mode
  useEffect(() => {
    if (!isOpen) return
    let currentStream: MediaStream | null = null
    const start = async () => {
      setIsCameraLoading(true)
      setCameraError(null)
      try {
        // Prefer front cam on laptops, allow back cam on mobile via facingMode
        const constraints: MediaStreamConstraints = {
          video: { facingMode },
          audio: false,
        }
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        currentStream = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {/* ignore autoplay block */ })
        }
      } catch (err: any) {
        setCameraError(err?.message || 'Camera unavailable')
      } finally {
        setIsCameraLoading(false)
      }
    }
    start()
    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach(t => t.stop())
      }
    }
  }, [isOpen, facingMode])

  const createMutation = useMutation({
    mutationFn: () => createLivestream({ title, description, category }),
    onSuccess: (stream) => {
      setFormError(null)
      setCreatedStream(stream)
      setStep('ready')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || err?.response?.data?.error || 'Could not create stream'
      setFormError(msg)
    }
  })

  const goLiveMutation = useMutation({
    mutationFn: () => goLive(createdStream!.id),
    onSuccess: (stream) => {
      queryClient.invalidateQueries({ queryKey: ['streams'] })
      navigate(`/live/${stream.id}`)
      onClose()
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || err?.response?.data?.error || 'Could not start stream'
      setFormError(msg)
    }
  })

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop with blur */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal (responsive: fluid on mobile, fixed on desktop) */}
      <div
        className="relative w-[calc(100%-32px)] sm:w-[480px] max-w-[480px] rounded-3xl p-4 sm:p-6 animate-zoomInNoTranslate"
        style={{ backgroundColor: 'var(--bg-primary)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {step === 'setup' ? (
          <>
            <div className="text-center mb-3">
              <h2 className="text-base sm:text-lg font-bold" style={{ color: 'var(--text-primary)' }}>🔴 Go Live</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Share this moment with your followers</p>
            </div>

            <div className="space-y-3">
              {/* Camera preview */}
              <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                <div className="relative bg-black" style={{ aspectRatio: '16/9', maxHeight: '32vh' }}>
                  {isCameraLoading && (
                    <div className="absolute inset-0 flex items-center justify-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Warming up camera…
                    </div>
                  )}
                  {cameraError && (
                    <div className="absolute inset-0 flex items-center justify-center text-center px-4 text-sm" style={{ color: 'var(--danger)' }}>
                      {cameraError}
                    </div>
                  )}
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={{ opacity: cameraError ? 0.2 : 1, maxHeight: '32vh' }}
                  />
                  <div className="absolute bottom-2 right-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')}
                      className="px-3 py-1.5 rounded-full text-xs font-medium"
                      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', boxShadow: 'var(--card-shadow)' }}
                    >
                      {facingMode === 'user' ? 'Switch to back' : 'Switch to front'}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between px-3 py-2 text-xs" style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)' }}>
                  <span>{isMobile ? 'Front/Back toggle ready' : 'Front camera selected (laptop)'}</span>
                  <span>Camera {cameraError ? 'off' : 'ready'}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                  Stream Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="What's happening?"
                  maxLength={100}
                  className="w-full px-3 py-2 sm:px-4 sm:py-3 rounded-xl text-[15px] outline-none transition-all focus:ring-2"
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    '--tw-ring-color': 'var(--accent)'
                  } as React.CSSProperties}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                  Description <span style={{ color: 'var(--text-tertiary)' }}>(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Tell viewers what to expect..."
                  rows={3}
                  className="w-full px-3 py-2 sm:px-4 sm:py-3 rounded-xl text-[15px] outline-none transition-all focus:ring-2 resize-none"
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    '--tw-ring-color': 'var(--accent)'
                  } as React.CSSProperties}
                />
              </div>

              {/* Category selector */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                  Category
                </label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setCategory(cat.value)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                      style={{
                        backgroundColor: category === cat.value ? cat.color : 'var(--bg-tertiary)',
                        color: category === cat.value ? 'white' : 'var(--text-secondary)',
                        border: category === cat.value ? 'none' : '1px solid var(--border)',
                      }}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2 sm:gap-3 mt-4 sm:mt-6">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl font-medium transition-colors"
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => createMutation.mutate()}
                disabled={!title.trim() || createMutation.isPending}
                className="flex-1 py-3 rounded-xl font-medium text-white transition-all disabled:opacity-50"
                style={{ backgroundColor: 'var(--danger)' }}
              >
                {createMutation.isPending ? 'Creating...' : 'Continue'}
              </button>
            </div>
            {formError && (
              <p className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>
                {formError}
              </p>
            )}
          </>
        ) : (
          <>
            <div className="text-center">
              <div
                className="w-18 h-18 rounded-full mx-auto mb-3 flex items-center justify-center animate-pulse"
                style={{ backgroundColor: 'var(--danger-alpha)' }}
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'var(--danger)' }}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-white">
                    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                  </svg>
                </div>
              </div>

              <h2 className="text-lg sm:text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Ready to go live?</h2>
              <p className="text-sm mb-4 sm:mb-6" style={{ color: 'var(--text-secondary)' }}>
                Your followers will be notified when you start
              </p>

              <div
                className="p-3 sm:p-4 rounded-2xl mb-4 sm:mb-6 text-left"
                style={{ backgroundColor: 'var(--bg-tertiary)' }}
              >
                <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
                {description && (
                  <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{description}</p>
                )}
              </div>

              <button
                type="button"
                onClick={() => goLiveMutation.mutate()}
                disabled={goLiveMutation.isPending}
                className="w-full py-3 rounded-2xl font-semibold text-white text-base sm:text-lg transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                style={{ backgroundColor: 'var(--danger)' }}
              >
                {goLiveMutation.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Going live...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
                    </span>
                    Go Live Now
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => { setStep('setup'); setCreatedStream(null) }}
                className="mt-2 text-sm font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                ← Back to edit
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function LivePage() {
  const { user } = useAuth()
  const [showGoLive, setShowGoLive] = useState(false)
  const [filter, setFilter] = useState<'all' | 'live'>('all')
  const [categoryFilter, setCategoryFilter] = useState('')

  const { data: streams = [], isLoading } = useQuery({
    queryKey: ['streams', filter, categoryFilter],
    queryFn: () => fetchLivestreams(filter === 'live' ? 'live' : undefined, categoryFilter || undefined),
    refetchInterval: 10000
  })

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Live</h1>
        {user && (
          <button
            type="button"
            onClick={() => setShowGoLive(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full font-medium text-white transition-all hover:scale-105 active:scale-95"
            style={{ backgroundColor: 'var(--danger)' }}
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
            </span>
            Go Live
          </button>
        )}
      </div>

      {/* Filter tabs + Category chips */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div
          className="flex gap-1 p-1 rounded-xl shrink-0"
          style={{ backgroundColor: 'var(--bg-tertiary)' }}
        >
          {(['all', 'live'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                backgroundColor: filter === tab ? 'var(--bg-primary)' : 'transparent',
                color: filter === tab ? 'var(--text-primary)' : 'var(--text-secondary)',
                boxShadow: filter === tab ? 'var(--card-shadow)' : 'none'
              }}
            >
              {tab === 'all' ? 'All' : 'Live Now'}
            </button>
          ))}
        </div>

        <div
          className="hidden sm:block w-px h-6 shrink-0"
          style={{ backgroundColor: 'var(--border)' }}
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategoryFilter('')}
            className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
            style={{
              backgroundColor: categoryFilter === '' ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: categoryFilter === '' ? 'white' : 'var(--text-secondary)',
              border: categoryFilter === '' ? 'none' : '1px solid var(--border)',
            }}
          >
            All
          </button>
          {CATEGORIES.map(cat => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setCategoryFilter(prev => prev === cat.value ? '' : cat.value)}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
              style={{
                backgroundColor: categoryFilter === cat.value ? cat.color : 'var(--bg-tertiary)',
                color: categoryFilter === cat.value ? 'white' : 'var(--text-secondary)',
                border: categoryFilter === cat.value ? 'none' : '1px solid var(--border)',
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stream grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div
            className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
          />
        </div>
      ) : streams.length === 0 ? (
        <div className="text-center py-20">
          <div
            className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-10 h-10" style={{ color: 'var(--text-tertiary)' }}>
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No streams yet</h3>
          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            Be the first to go live!
          </p>
          {user && (
            <button
              type="button"
              onClick={() => setShowGoLive(true)}
              className="px-6 py-3 rounded-full font-medium text-white transition-all hover:scale-105"
              style={{ backgroundColor: 'var(--danger)' }}
            >
              Start Streaming
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {streams.map(stream => (
            <LiveStreamCard key={stream.id} stream={stream} />
          ))}
        </div>
      )}

      <GoLiveModal isOpen={showGoLive} onClose={() => setShowGoLive(false)} />
    </div>
  )
}
