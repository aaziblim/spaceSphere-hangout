import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchLivestream,
  fetchStreamMessages,
  endStream,
  deleteStream,
  fetchStreamSignals,
  sendStreamSignal,
  createPost,
  type LivestreamMessage
} from '../api'
import { useAuth } from '../AuthContext'
import { ConfirmationModal } from '../components/ConfirmationModal'
import { StreamSummaryModal } from '../components/StreamSummaryModal'
import { useLivestreamWebSocket } from '../hooks/useLivestreamWebSocket'

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

function ChatMessage({ message }: { message: LivestreamMessage }) {
  return (
    <div className="flex items-start gap-3 py-2.5 px-1 group">
      <div
        className="w-8 h-8 rounded-full overflow-hidden shrink-0 ring-1 ring-white/10"
      >
        {message.author.profile_image ? (
          <img src={message.author.profile_image} alt="" className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-white font-semibold text-xs"
            style={{ background: 'var(--gradient-stream)' }}
          >
            {message.author.username.slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <span className="font-semibold text-sm mr-2 text-teal-400">
          {message.author.username}
        </span>
        <span className="text-sm break-words text-white/90">
          {message.content}
        </span>
      </div>
    </div>
  )
}



export default function StreamViewerPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [message, setMessage] = useState('')
  const [duration, setDuration] = useState(0)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [showControls, setShowControls] = useState(true)
  const [chatOpen, setChatOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [endModalOpen, setEndModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const processedSignalIdsRef = useRef<Set<number>>(new Set())
  const lastSignalTsRef = useRef<number | null>(null)
  const pendingHostCandidatesRef = useRef<RTCIceCandidateInit[]>([])
  const pendingViewerCandidatesRef = useRef<RTCIceCandidateInit[]>([])
  const offerSentRef = useRef(false)
  const answerSetRef = useRef(false)
  const ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
  ]

  // Post-stream summary state
  const [showSummary, setShowSummary] = useState(false)
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null)
  const [isSavingPost, setIsSavingPost] = useState(false)

  // Screen sharing (host only, desktop)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const originalTrackRef = useRef<MediaStreamTrack | null>(null)

  // Viewer panel
  const [viewerPanelOpen, setViewerPanelOpen] = useState(false)

  // Auto-hide controls logic
  const resetControlsTimeout = useCallback(() => {
    setShowControls(true)
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current)
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (!chatOpen) {
        setShowControls(false)
      }
    }, 3000)
  }, [chatOpen])

  const handleInteraction = useCallback(() => {
    resetControlsTimeout()
  }, [resetControlsTimeout])

  // Fullscreen handling
  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return

    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen()
        setIsFullscreen(true)
      } else {
        await document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch (err) {
      console.error('Fullscreen error:', err)
    }
  }, [])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // Screen wake lock for mobile
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen')
        }
      } catch (err) {
        console.log('Wake lock request failed:', err)
      }
    }
    requestWakeLock()
    return () => {
      if (wakeLock) {
        wakeLock.release()
      }
    }
  }, [])

  const ensurePeerConnection = (role: 'host' | 'viewer') => {
    if (pcRef.current) return pcRef.current
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendStreamSignal(id!, { role, kind: 'candidate', payload: event.candidate }).catch(() => { })
      }
    }
    if (role === 'viewer') {
      pc.ontrack = (event) => {
        if (!remoteStreamRef.current) {
          remoteStreamRef.current = new MediaStream()
        }
        event.streams[0]?.getTracks().forEach(track => {
          remoteStreamRef.current!.addTrack(track)
        })
        if (videoRef.current && remoteStreamRef.current) {
          const el = videoRef.current
          el.muted = true
          el.srcObject = remoteStreamRef.current
          el.play().catch(() => { })
        }
      }
    }
    pcRef.current = pc
    return pc
  }

  // Fetch stream data
  const { data: stream, isLoading, error } = useQuery({
    queryKey: ['stream', id],
    queryFn: () => fetchLivestream(id!),
    enabled: !!id,
    refetchInterval: 5000
  })

  // Fetch initial messages once (not polling), then use WebSocket for real-time
  const { data: initialMessages = [] } = useQuery({
    queryKey: ['stream-messages-initial', id],
    queryFn: () => fetchStreamMessages(id!),
    enabled: !!id && !!stream?.is_live,
    staleTime: Infinity,
  })

  // WebSocket for real-time chat, viewer count, likes
  const ws = useLivestreamWebSocket(id, !!id && !!stream?.is_live, initialMessages)
  const chatMessages = ws.messages

  // Duration timer
  useEffect(() => {
    if (!stream?.started_at || !stream.is_live) return
    const startTime = new Date(stream.started_at).getTime()
    const updateDuration = () => {
      setDuration(Math.floor((Date.now() - startTime) / 1000))
    }
    updateDuration()
    const interval = setInterval(updateDuration, 1000)
    return () => clearInterval(interval)
  }, [stream?.started_at, stream?.is_live])

  // Host: create and send offer when camera ready
  useEffect(() => {
    if (!stream?.is_live || stream.host.id !== user?.id) return
    const media = videoRef.current?.srcObject as MediaStream | null
    if (!media) return
    const pc = ensurePeerConnection('host')
    if (offerSentRef.current) return
    const makeOffer = async () => {
      try {
        const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: true })
        await pc.setLocalDescription(offer)
        await sendStreamSignal(id!, { role: 'host', kind: 'offer', payload: offer })
        offerSentRef.current = true
      } catch (err) {
        console.error('Offer failed', err)
      }
    }
    makeOffer()
  }, [stream?.is_live, stream?.host.id, user?.id, id])

  // Host camera preview
  useEffect(() => {
    if (!stream?.is_live || stream.host.id !== user?.id) return
    let localStream: MediaStream | null = null
    const start = async () => {
      setCameraError(null)
      try {
        const constraints: MediaStreamConstraints = { video: { facingMode }, audio: false }
        const media = await navigator.mediaDevices.getUserMedia(constraints)
        localStream = media
        if (videoRef.current) {
          videoRef.current.srcObject = media
          await videoRef.current.play().catch(() => { })
        }
        if (stream?.is_live && stream.host.id === user?.id) {
          const pc = ensurePeerConnection('host')
          const existingTracks = new Set(pc.getSenders().map(s => s.track))
          media.getTracks().forEach(track => {
            if (!existingTracks.has(track)) {
              pc.addTrack(track, media)
            }
          })
        }
      } catch (err: any) {
        setCameraError(err?.message || 'Camera unavailable')
      }
    }
    start()
    return () => {
      if (localStream) localStream.getTracks().forEach(t => t.stop())
    }
  }, [stream?.is_live, stream?.host.id, user?.id, facingMode])

  // Poll signaling channel
  useEffect(() => {
    if (!stream?.is_live) return
    let isActive = true

    const tick = async () => {
      if (!id) return
      try {
        const signals = await fetchStreamSignals(id, lastSignalTsRef.current ?? undefined)
        for (const sig of signals) {
          if (processedSignalIdsRef.current.has(sig.id)) continue
          processedSignalIdsRef.current.add(sig.id)
          const ts = Date.parse(sig.created_at) / 1000
          if (!Number.isNaN(ts)) {
            lastSignalTsRef.current = Math.max(lastSignalTsRef.current ?? 0, ts)
          }

          if (stream.host.id === user?.id) {
            if (sig.role === 'viewer' && sig.kind === 'answer') {
              const pc = pcRef.current
              if (pc && !pc.currentRemoteDescription) {
                pc.setRemoteDescription(new RTCSessionDescription(sig.payload)).then(() => {
                  answerSetRef.current = true
                  const queued = pendingViewerCandidatesRef.current.splice(0)
                  queued.forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => { }))
                }).catch(() => { })
              }
            }
            if (sig.role === 'viewer' && sig.kind === 'candidate') {
              const candidate = new RTCIceCandidate(sig.payload)
              const pc = pcRef.current
              if (pc?.currentRemoteDescription) {
                pc.addIceCandidate(candidate).catch(() => { })
              } else {
                pendingViewerCandidatesRef.current.push(sig.payload)
              }
            }
          } else {
            if (sig.role === 'host' && sig.kind === 'offer') {
              const handleOffer = async () => {
                const pc = ensurePeerConnection('viewer')
                try {
                  await pc.setRemoteDescription(new RTCSessionDescription(sig.payload))
                  const answer = await pc.createAnswer()
                  await pc.setLocalDescription(answer)
                  await sendStreamSignal(id, { role: 'viewer', kind: 'answer', payload: answer })
                  const queued = pendingHostCandidatesRef.current.splice(0)
                  queued.forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => { }))
                } catch (err) {
                  console.error('Handle offer failed', err)
                }
              }
              handleOffer()
            }
            if (sig.role === 'host' && sig.kind === 'candidate') {
              const candidate = new RTCIceCandidate(sig.payload)
              const pc = pcRef.current
              if (pc?.remoteDescription) {
                pc.addIceCandidate(candidate).catch(() => { })
              } else {
                pendingHostCandidatesRef.current.push(sig.payload)
              }
            }
          }
        }
      } catch (err) {
        // swallow
      }
    }

    tick()
    const interval = setInterval(() => { if (isActive) tick() }, 2000)
    return () => { isActive = false; clearInterval(interval) }
  }, [stream?.is_live, stream?.host.id, user?.id, id])

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [chatMessages])

  // Initial controls timeout
  useEffect(() => {
    resetControlsTimeout()
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current)
      }
    }
  }, [resetControlsTimeout])

  // Recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  // Start recording when live
  useEffect(() => {
    if (!stream?.is_live || stream.host.id !== user?.id) return

    const startRecording = async () => {
      // Wait a bit for stream to be ready
      await new Promise(r => setTimeout(r, 1000))

      const streamToRecord = videoRef.current?.srcObject as MediaStream
      if (!streamToRecord) return

      try {
        const recorder = new MediaRecorder(streamToRecord, {
          mimeType: 'video/webm;codecs=vp8,opus'
        })

        chunksRef.current = []

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunksRef.current.push(e.data)
          }
        }

        recorder.start(1000) // Collect chunks every second
        mediaRecorderRef.current = recorder
        console.log('Recording started')
      } catch (err) {
        console.error('Failed to start recording', err)
      }
    }

    startRecording()

    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
    }
  }, [stream?.is_live, stream?.host.id, user?.id])

  // End stream mutation - stores recording blob, shows summary modal
  const endMutation = useMutation({
    mutationFn: async () => {
      // 1. Stop recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
        await new Promise(r => setTimeout(r, 500))
      }

      // 2. Store blob if we have chunks (don't upload yet)
      if (chunksRef.current.length > 0) {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' })
        setRecordingBlob(blob)
      }

      // 3. End stream via API
      return endStream(id!)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stream', id] })
      setEndModalOpen(false)
      setShowSummary(true)
    }
  })

  // Delete stream mutation
  const deleteMutation = useMutation({
    mutationFn: () => deleteStream(id!),
    onSuccess: () => {
      navigate('/live')
    }
  })

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return
    ws.sendChatMessage(message.trim())
    setMessage('')
  }

  // Save recording as a post
  const handleSaveAsPost = async () => {
    if (!recordingBlob) return
    setIsSavingPost(true)
    try {
      const file = new File([recordingBlob], `stream-${id}.webm`, { type: 'video/webm' })
      await createPost({
        title: `Live Replay: ${stream?.title || 'Untitled Stream'}`,
        content: stream?.description || 'Livestream recording',
        post_video: file,
      })
      setShowSummary(false)
      navigate('/live')
    } catch (err) {
      console.error('Failed to save recording', err)
    } finally {
      setIsSavingPost(false)
    }
  }

  // Discard recording and leave
  const handleDiscard = () => {
    setRecordingBlob(null)
    setShowSummary(false)
    navigate('/live')
  }

  // Toggle screen sharing (host only, desktop)
  const toggleScreenShare = async () => {
    if (!pcRef.current) return
    const senders = pcRef.current.getSenders()
    const videoSender = senders.find(s => s.track?.kind === 'video')
    if (!videoSender) return

    if (isScreenSharing) {
      if (originalTrackRef.current) {
        await videoSender.replaceTrack(originalTrackRef.current)
        if (videoRef.current) {
          const s = new MediaStream([originalTrackRef.current])
          videoRef.current.srcObject = s
        }
      }
      setIsScreenSharing(false)
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true })
        const screenTrack = screenStream.getVideoTracks()[0]
        originalTrackRef.current = videoSender.track
        await videoSender.replaceTrack(screenTrack)
        if (videoRef.current) {
          videoRef.current.srcObject = screenStream
        }
        screenTrack.onended = async () => {
          if (originalTrackRef.current && videoSender) {
            await videoSender.replaceTrack(originalTrackRef.current)
            if (videoRef.current) {
              const restored = new MediaStream([originalTrackRef.current])
              videoRef.current.srcObject = restored
            }
          }
          setIsScreenSharing(false)
        }
        setIsScreenSharing(true)
      } catch (err) {
        console.error('Screen share failed:', err)
      }
    }
  }

  const isHost = user?.id === stream?.host.id

  // Handle stream ended via WS (for viewers)
  useEffect(() => {
    if (ws.streamEnded && !isHost) {
      queryClient.invalidateQueries({ queryKey: ['stream', id] })
    }
  }, [ws.streamEnded, isHost, queryClient, id])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-12 h-12 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
          />
          <p style={{ color: 'var(--text-tertiary)' }} className="text-sm">Loading stream...</p>
        </div>
      </div>
    )
  }

  if (error || !stream) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center px-6">
          <div
            className="w-20 h-20 rounded-full mx-auto mb-5 flex items-center justify-center"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-10 h-10" style={{ color: 'var(--text-tertiary)' }}>
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Stream not found</h3>
          <p className="text-sm mb-5" style={{ color: 'var(--text-tertiary)' }}>This stream may have ended or doesn't exist.</p>
          <button
            type="button"
            onClick={() => navigate('/live')}
            className="px-5 py-2.5 rounded-full font-medium text-white transition-all hover:scale-105 active:scale-95"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            Browse Streams
          </button>
        </div>
      </div>
    )
  }

  // Container classes based on fullscreen state
  const containerClasses = isFullscreen
    ? 'fixed inset-0 bg-black z-50'
    : 'w-full rounded-2xl overflow-hidden bg-black'

  // Video aspect ratio when not fullscreen
  const videoContainerClasses = isFullscreen
    ? 'absolute inset-0'
    : 'relative aspect-video md:aspect-[16/9]'

  return (
    <div className="w-full pb-16 md:pb-0">
      {/* Back button - only show when not fullscreen */}
      {!isFullscreen && (
        <button
          type="button"
          onClick={() => navigate('/live')}
          className="flex items-center gap-2 text-sm font-medium mb-4 transition-colors"
          style={{ color: 'var(--accent)' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to Live
        </button>
      )}

      <div
        ref={containerRef}
        className={`${containerClasses} select-none overflow-hidden`}
        onMouseMove={handleInteraction}
        onTouchStart={handleInteraction}
        onClick={() => {
          // Mobile: tap to toggle controls
          if (window.innerWidth < 768) {
            setShowControls(prev => !prev)
          }
        }}
      >
        {/* Video Container */}
        <div className={videoContainerClasses}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            controls
            muted={isHost || true}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ opacity: stream.is_live ? 1 : 0.3 }}
            poster={stream.thumbnail_url || undefined}
          />

          {/* Fallback overlay when no video */}
          {(!stream.is_live || cameraError || (!isHost && !stream.thumbnail_url)) && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="text-center">
                <div
                  className="w-20 h-20 md:w-24 md:h-24 rounded-full mx-auto mb-4 flex items-center justify-center overflow-hidden ring-4 ring-white/10"
                >
                  {stream.host.profile_image ? (
                    <img src={stream.host.profile_image} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-2xl md:text-3xl font-bold text-white"
                      style={{ background: 'var(--gradient-stream)' }}
                    >
                      {stream.host.username.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
                <p className="text-white/70 text-sm px-4">
                  {stream.is_live
                    ? (cameraError ? cameraError : 'Connecting to video feed...')
                    : 'Stream has ended (No recording available)'}
                </p>
                {isHost && !stream.is_live && (
                  <button
                    onClick={() => setDeleteModalOpen(true)}
                    className="mt-4 px-6 py-2.5 rounded-full bg-red-500/20 text-red-500 font-bold text-sm border border-red-500/30 transition-all hover:bg-red-500 hover:text-white hover:border-transparent active:scale-95"
                  >
                    Delete History
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Screen sharing indicator */}
          {isScreenSharing && (
            <div className="absolute top-14 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-green-500/80 backdrop-blur text-white text-xs font-medium flex items-center gap-1.5 z-10">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              Sharing Screen
            </div>
          )}

          {/* Controls Overlay */}
          <div
            className={`absolute inset-0 transition-opacity duration-300 pointer-events-none ${showControls ? 'opacity-100' : 'opacity-0'
              }`}
          >
            {/* Top Gradient */}
            <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-black/60 to-transparent" />

            {/* Bottom Gradient - taller on mobile for nav clearance when fullscreen */}
            <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent ${isFullscreen ? 'h-32 md:h-28' : 'h-24'
              }`} />

            {/* Top Controls */}
            <div className="absolute top-0 left-0 right-0 p-3 md:p-4 flex items-start justify-between pointer-events-auto">
              {/* Left: Back (fullscreen only) + Live badge + Duration */}
              <div className="flex items-center gap-2">
                {isFullscreen && (
                  <button
                    type="button"
                    aria-label="Go back"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleFullscreen()
                    }}
                    className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white transition-all hover:bg-black/60 active:scale-95"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 md:w-5 md:h-5">
                      <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                  </button>
                )}

                {stream.is_live && (
                  <>
                    <div className="px-2.5 py-1 rounded-full bg-red-500 text-white text-[11px] md:text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-lg">
                      <span className="relative flex h-1.5 w-1.5 md:h-2 md:w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                        <span className="relative inline-flex rounded-full h-full w-full bg-white" />
                      </span>
                      LIVE
                    </div>
                    <div className="px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-md text-white text-xs md:text-sm font-medium">
                      {formatDuration(duration)}
                    </div>
                  </>
                )}
              </div>

              {/* Right: Viewer count + Camera toggle (host) */}
              <div className="flex items-center gap-2">
                {stream.is_live && (
                  <div className="px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-md text-white text-xs md:text-sm font-medium flex items-center gap-1.5">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 md:w-4 md:h-4">
                      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5z" />
                      <circle cx="12" cy="12" r="3.5" fill="black" />
                    </svg>
                    {formatViewers(stream.viewer_count)}
                  </div>
                )}
                {isHost && stream.is_live && (
                  <button
                    type="button"
                    aria-label="Flip camera"
                    onClick={(e) => {
                      e.stopPropagation()
                      setFacingMode(prev => prev === 'user' ? 'environment' : 'user')
                    }}
                    className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white transition-all hover:bg-black/60 active:scale-95"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4 md:w-5 md:h-5">
                      <path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <circle cx="12" cy="13" r="3" />
                      <path d="M16 10l2-2m0 0l2 2m-2-2v4" />
                    </svg>
                  </button>
                )}
                {/* Screen share toggle (host only, desktop) */}
                {isHost && stream.is_live && (
                  <button
                    type="button"
                    aria-label="Toggle screen share"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleScreenShare()
                    }}
                    className={`hidden md:flex w-9 h-9 md:w-10 md:h-10 rounded-full backdrop-blur-md items-center justify-center text-white transition-all hover:bg-black/60 active:scale-95 ${
                      isScreenSharing ? 'bg-green-500/60' : 'bg-black/40'
                    }`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4 md:w-5 md:h-5">
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                      <path d="M8 21h8M12 17v4" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Bottom Controls */}
            <div className={`absolute bottom-0 left-0 right-0 p-3 md:p-4 pointer-events-auto ${isFullscreen ? 'pb-4 md:pb-4' : 'pb-3'
              }`}>
              <div className="flex items-end justify-between gap-3">
                {/* Left: Host info */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    className="w-10 h-10 md:w-12 md:h-12 rounded-full overflow-hidden ring-2 ring-white/20 shadow-lg shrink-0"
                  >
                    {stream.host.profile_image ? (
                      <img src={stream.host.profile_image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center text-sm md:text-base font-semibold text-white"
                        style={{ background: 'var(--gradient-stream)' }}
                      >
                        {stream.host.username.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-bold text-white text-sm md:text-base leading-tight line-clamp-1 drop-shadow-lg">
                      {stream.title}
                    </h2>
                    <p className="text-white/70 text-xs md:text-sm truncate">{stream.host.username}</p>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Chat toggle - only in fullscreen */}
                  {isFullscreen && stream.is_live && (
                    <button
                      type="button"
                      aria-label="Toggle chat"
                      onClick={(e) => {
                        e.stopPropagation()
                        setChatOpen(prev => !prev)
                      }}
                      className={`h-9 md:h-10 px-3 md:px-4 rounded-full flex items-center gap-1.5 font-medium text-xs md:text-sm transition-all active:scale-95 ${chatOpen
                        ? 'bg-white text-black'
                        : 'bg-black/40 backdrop-blur-md text-white hover:bg-black/60'
                        }`}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4 md:w-5 md:h-5">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      <span>{chatMessages.length}</span>
                    </button>
                  )}

                  {/* Like button */}
                  {stream.is_live && (
                    <button
                      type="button"
                      aria-label="Like stream"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (user) ws.sendLike()
                      }}
                      disabled={!user}
                      className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white transition-all hover:bg-red-500/80 active:scale-95 disabled:opacity-50"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 md:w-5 md:h-5">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                      </svg>
                    </button>
                  )}

                  {/* Fullscreen toggle */}
                  <button
                    type="button"
                    aria-label="Toggle fullscreen"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleFullscreen()
                    }}
                    className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white transition-all hover:bg-black/60 active:scale-95"
                  >
                    {isFullscreen ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 md:w-5 md:h-5">
                        <path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 md:w-5 md:h-5">
                        <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
                      </svg>
                    )}
                  </button>

                  {/* End stream (host only) */}
                  {isHost && stream.is_live && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setEndModalOpen(true)
                      }}
                      disabled={endMutation.isPending}
                      className="h-9 md:h-10 px-3 md:px-4 rounded-full bg-red-500 text-white font-medium text-xs md:text-sm transition-all hover:bg-red-600 active:scale-95 disabled:opacity-50"
                    >
                      {endMutation.isPending ? 'Ending...' : 'End Stream'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Chat Panel - Only in fullscreen mode */}

        {/* Desktop/Large Tablet: Right side slide panel with transparency - FULLSCREEN ONLY */}
        {isFullscreen && (
          <div
            className={`hidden lg:block fixed top-0 right-0 h-full z-50 transition-transform duration-300 ease-out ${chatOpen ? 'translate-x-0' : 'translate-x-full'
              }`}
            style={{ width: '340px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="h-full flex flex-col"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)'
              }}
            >
              {/* Chat Header */}
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <h3 className="font-semibold text-white text-base">Live Chat</h3>
                <div className="flex items-center gap-3">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/70">
                    {chatMessages.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setChatOpen(false)}
                    className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div
                ref={chatContainerRef}
                className="flex-1 overflow-y-auto p-4 space-y-1"
              >
                {chatMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mb-3">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6 text-white/30">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    </div>
                    <p className="text-white/40 text-sm">No messages yet</p>
                    <p className="text-white/30 text-xs mt-1">Be the first to say hi!</p>
                  </div>
                ) : (
                  chatMessages.map(msg => (
                    <ChatMessage key={msg.id} message={msg} />
                  ))
                )}
              </div>

              {/* Chat Input */}
              {user ? (
                <form onSubmit={handleSend} className="p-4 border-t border-white/10">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      placeholder="Send a message..."
                      maxLength={500}
                      className="flex-1 px-4 py-3 rounded-full text-sm outline-none bg-white/10 text-white placeholder-white/40 focus:bg-white/15 transition-colors"
                    />
                    <button
                      type="submit"
                      disabled={!message.trim()}
                      className="w-11 h-11 rounded-full flex items-center justify-center text-white transition-all disabled:opacity-40"
                      style={{ backgroundColor: 'var(--accent)' }}
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                      </svg>
                    </button>
                  </div>
                </form>
              ) : (
                <div className="p-4 border-t border-white/10 text-center">
                  <p className="text-white/40 text-sm">Sign in to join the chat</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Mobile & Tablet: Bottom sheet - FULLSCREEN ONLY */}
        {isFullscreen && (
          <div
            className={`lg:hidden fixed inset-x-0 bottom-0 z-50 transition-transform duration-300 ease-out ${chatOpen ? 'translate-y-0' : 'translate-y-full'
              }`}
            style={{ height: '70vh', maxHeight: '600px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="h-full flex flex-col rounded-t-3xl overflow-hidden"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.95)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)'
              }}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 rounded-full bg-white/30" />
              </div>

              {/* Chat Header */}
              <div className="flex items-center justify-between px-4 pb-3 border-b border-white/10">
                <h3 className="font-semibold text-white text-base">Live Chat</h3>
                <div className="flex items-center gap-3">
                  <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-white/70">
                    {chatMessages.length} messages
                  </span>
                  <button
                    type="button"
                    onClick={() => setChatOpen(false)}
                    className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 active:bg-white/20 transition-colors"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
                      <path d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div
                className="flex-1 overflow-y-auto px-4 py-3 space-y-1"
              >
                {chatMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7 text-white/30">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    </div>
                    <p className="text-white/50 text-sm font-medium">No messages yet</p>
                    <p className="text-white/30 text-xs mt-1">Start the conversation!</p>
                  </div>
                ) : (
                  chatMessages.map(msg => (
                    <ChatMessage key={msg.id} message={msg} />
                  ))
                )}
              </div>

              {/* Chat Input - Fixed at bottom with safe area */}
              {user ? (
                <form onSubmit={handleSend} className="p-4 pb-6 border-t border-white/10 bg-black/50">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      placeholder="Type a message..."
                      maxLength={500}
                      className="flex-1 px-5 py-3.5 rounded-2xl text-base outline-none bg-white/10 text-white placeholder-white/40 focus:bg-white/15 focus:ring-2 focus:ring-white/20 transition-all"
                    />
                    <button
                      type="submit"
                      disabled={!message.trim()}
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-white transition-all active:scale-95 disabled:opacity-40"
                      style={{ backgroundColor: 'var(--accent)' }}
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                      </svg>
                    </button>
                  </div>
                </form>
              ) : (
                <div className="p-4 pb-6 border-t border-white/10 text-center bg-black/50">
                  <p className="text-white/50 text-sm">Sign in to chat</p>
                </div>
              )}
            </div>
          </div>
        )}
        {/* Chat overlay backdrop - ONLY in fullscreen mode */}
        {isFullscreen && chatOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setChatOpen(false)}
          />
        )}
      </div>

      {/* Stream Stats - only show when not fullscreen */}
      {!isFullscreen && (
        <div
          className="flex items-center justify-between mt-3 px-4 py-3 rounded-xl"
          style={{ backgroundColor: 'var(--bg-primary)' }}
        >
          <div className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setViewerPanelOpen(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5 opacity-50" style={{ color: 'var(--text-secondary)' }}>
              <path d="M2.42 12.713c-.14-.247-.14-.559 0-.806 1.053-1.856 4.06-6.287 9.58-6.287 5.52 0 8.527 4.43 9.58 6.287.14.247.14.559 0 .806-1.053 1.856-4.06 6.287-9.58 6.287-5.52 0-8.527-4.43-9.58-6.287z" />
              <circle cx="12" cy="12.31" r="3" />
            </svg>
            <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
              {formatViewers(stream.viewer_count)}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>watching</span>
          </div>

          <div className="w-px h-4 opacity-20" style={{ backgroundColor: 'var(--text-tertiary)' }} />

          <div className="flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5 opacity-50" style={{ color: 'var(--text-secondary)' }}>
              <path d="M3 17l6-6 4 4 8-8" />
              <path d="M17 7h4v4" />
            </svg>
            <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
              {formatViewers(stream.peak_viewers)}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>peak</span>
          </div>

          <div className="w-px h-4 opacity-20" style={{ backgroundColor: 'var(--text-tertiary)' }} />

          <div className="flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 opacity-60" style={{ color: 'var(--danger)' }}>
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
              {formatViewers(ws.totalLikes || stream.total_likes)}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>likes</span>
          </div>

          <div className="w-px h-4 opacity-20" style={{ backgroundColor: 'var(--text-tertiary)' }} />

          <div className="flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5 opacity-50" style={{ color: 'var(--text-secondary)' }}>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 6v6l4 2" />
            </svg>
            <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
              {formatDuration(stream.duration || duration)}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>duration</span>
          </div>
        </div>
      )}

      {/* Inline Chat Section - only show when not fullscreen */}
      {!isFullscreen && stream.is_live && (
        <div
          className="mt-6 rounded-2xl overflow-hidden transition-all duration-500 ease-in-out border border-white/5"
          style={{
            backgroundColor: 'var(--bg-primary)',
            boxShadow: chatOpen ? '0 20px 40px -10px rgba(0,0,0,0.3)' : 'none'
          }}
        >
          {/* Header - Always visible toggle */}
          <div
            className="flex items-center justify-between px-5 py-4 cursor-pointer select-none transition-colors hover:bg-white/5"
            onClick={() => setChatOpen(!chatOpen)}
            style={{
              borderBottom: chatOpen ? '1px solid var(--border)' : 'none',
              backgroundColor: chatOpen ? 'var(--bg-secondary)' : 'transparent'
            }}
          >
            <div className="flex items-center gap-3">
              <span className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors ${chatOpen ? 'bg-green-500/20 text-green-500' : 'bg-white/10 text-white/50'}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              <div>
                <h3 className="font-bold text-sm leading-tight" style={{ color: 'var(--text-primary)' }}>Live Chat</h3>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {chatOpen ? 'Join the conversation' : `${chatMessages.length} messages`}
                </p>
              </div>
            </div>

            <button
              type="button"
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${chatOpen ? 'bg-white/10 rotate-180' : 'hover:bg-white/5'}`}
              style={{ color: 'var(--text-secondary)' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {/* Chat Body */}
          {chatOpen && (
            <div className="flex flex-col h-[500px]">
              {/* Messages */}
              <div
                ref={chatContainerRef}
                className="flex-1 overflow-y-auto p-4 space-y-4"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
              >
                {chatMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-50">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center mb-4">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8 text-white/50">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>It's quiet here...</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Be the first to say hello!</p>
                  </div>
                ) : (
                  chatMessages.map(msg => (
                    <div key={msg.id} className="group flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 shadow-sm ring-1 ring-white/5 mt-0.5">
                        {msg.author.profile_image ? (
                          <img src={msg.author.profile_image} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div
                            className="w-full h-full flex items-center justify-center text-white font-bold text-[10px]"
                            style={{ background: 'var(--gradient-stream)' }}
                          >
                            {msg.author.username.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span className="font-bold text-xs hover:underline cursor-pointer" style={{ color: 'var(--text-primary)' }}>
                            {msg.author.username}
                          </span>
                          <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed break-words" style={{ color: 'var(--text-secondary)' }}>
                          {msg.content}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Input Area - Now cleaner and more integrated */}
              <div
                className="p-4"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  borderTop: '1px solid var(--border)'
                }}
              >
                {user ? (
                  <form
                    onSubmit={handleSend}
                    className="relative"
                  >
                    <input
                      autoFocus
                      type="text"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Type a message..."
                      maxLength={500}
                      className="w-full pl-5 pr-12 py-3.5 rounded-xl text-sm outline-none transition-all focus:ring-2 focus:ring-[var(--accent)]/50"
                      style={{
                        backgroundColor: 'var(--bg-tertiary)',
                        color: 'var(--text-primary)',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)'
                      }}
                    />
                    <button
                      type="submit"
                      disabled={!message.trim()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-all hover:bg-black/5 disabled:opacity-30 disabled:hover:bg-transparent"
                      style={{ color: message.trim() ? 'var(--accent)' : 'var(--text-tertiary)' }}
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                      </svg>
                    </button>
                  </form>
                ) : (
                  <div className="text-center py-2">
                    <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>Want to join the chat?</p>
                    <button
                      onClick={() => navigate('/login')}
                      className="px-6 py-2 rounded-full text-xs font-bold text-white transition-transform active:scale-95"
                      style={{ backgroundColor: 'var(--accent)' }}
                    >
                      Sign in
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {/* Description - only show when not fullscreen */}
      {!isFullscreen && stream.description && (
        <div
          className="mt-4 p-4 rounded-2xl"
          style={{ backgroundColor: 'var(--bg-primary)' }}
        >
          <p className="text-sm md:text-[15px]" style={{ color: 'var(--text-secondary)' }}>
            {stream.description}
          </p>
        </div>
      )}

      {/* Confirmation Modals */}
      <ConfirmationModal
        isOpen={endModalOpen}
        onClose={() => setEndModalOpen(false)}
        onConfirm={() => endMutation.mutate()}
        title="End Livestream"
        description="Are you sure you want to end this stream? This action will stop the broadcast for all viewers."
        confirmText="End Stream"
        isDestructive={true}
        isLoading={endMutation.isPending}
      />

      <ConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        title="Delete Stream"
        description="Are you sure you want to delete this stream recording? This cannot be undone."
        confirmText="Delete"
        isDestructive={true}
        isLoading={deleteMutation.isPending}
      />

      {/* Post-Stream Summary Modal */}
      <StreamSummaryModal
        isOpen={showSummary}
        stats={{
          duration: stream.duration || duration,
          peakViewers: stream.peak_viewers,
          totalLikes: ws.totalLikes || stream.total_likes,
          totalMessages: chatMessages.length,
        }}
        hasRecording={!!recordingBlob}
        onSaveAsPost={handleSaveAsPost}
        onDiscard={handleDiscard}
        isSaving={isSavingPost}
      />

      {/* Viewer List Panel */}
      {viewerPanelOpen && (
        <div className="fixed inset-0 z-[90] flex items-start justify-end p-4 pt-16">
          <div className="absolute inset-0 bg-black/30" onClick={() => setViewerPanelOpen(false)} />
          <div
            className="relative w-80 max-h-[70vh] rounded-2xl overflow-hidden shadow-2xl"
            style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)' }}
          >
            <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Viewers ({ws.viewers.length})</h3>
              <button
                type="button"
                onClick={() => setViewerPanelOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(70vh-60px)] p-2">
              {ws.viewers.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: 'var(--text-tertiary)' }}>No viewers connected</p>
              ) : (
                ws.viewers.map(v => (
                  <div
                    key={v.id}
                    className="flex items-center gap-3 p-3 rounded-xl transition-colors"
                    style={{ cursor: 'default' }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div className="w-8 h-8 rounded-full overflow-hidden shrink-0">
                      {v.profile_image ? (
                        <img src={v.profile_image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center text-white font-semibold text-xs"
                          style={{ background: 'var(--gradient-stream)' }}
                        >
                          {v.username.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <span className="text-sm font-medium flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{v.username}</span>
                    {isHost && v.id !== user?.id && (
                      <button
                        type="button"
                        onClick={() => ws.banUser(v.id)}
                        className="text-xs text-red-400 hover:text-red-300 font-medium px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors"
                      >
                        Ban
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
