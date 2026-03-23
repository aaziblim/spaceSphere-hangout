import { useEffect, useRef, useState, useCallback, useMemo, lazy, Suspense } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchUserProfile,
  fetchSphereRequests,
  fetchSphereParticipants,
  toggleSphereHandRaise,
  promoteSphereSpeaker,
  demoteSphereSpeaker,
  approveSphereRequest,
  denySphereRequest,
  leaveSphere,
  endSphere,
} from '../api'
import { useAuth } from '../AuthContext'
import { useFollow } from '../hooks/useFollow'
import { useLiveKitAudio } from '../hooks/useLiveKitAudio'

const SpheresNebulaScene = lazy(() => import('../components/SpheresNebulaScene.tsx'))

const EMOTE_OPTIONS = ['❤️', '🔥', '👏', '😂', '🚀', '✨']
const ORB_SEND_INTERVAL_MS = 40
const REMOTE_INTERPOLATION = 0.2

type OrbRole = 'conductor' | 'speaker' | 'listener'

interface Orb {
  id: string
  username: string
  image: string | null
  x: number
  y: number
  targetX: number
  targetY: number
  vx: number
  vy: number
  radius: number
  isTalking: boolean
  isSelf?: boolean
  role?: OrbRole
  handRaised?: boolean
  justJoinedAt?: number
  leaving?: boolean
}

interface Particle {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  emoji: string
  life: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getOrbRadius(role?: OrbRole): number {
  if (role === 'conductor') return 8.4
  if (role === 'speaker') return 7.4
  return 5.9
}

function getCrowdScale(participantCount: number): number {
  if (participantCount >= 20) return 0.68
  if (participantCount >= 14) return 0.76
  if (participantCount >= 10) return 0.84
  if (participantCount >= 6) return 0.92
  return 1
}

function GlassProfileCard({ username, onClose }: { username: string; onClose: () => void }) {
  const { data: profile, isLoading } = useQuery({
    queryKey: ['userProfile', username],
    queryFn: () => fetchUserProfile(username),
    enabled: !!username,
  })

  const { isFollowing, toggleFollow, isLoading: followLoading } = useFollow()
  const { user: currentUser } = useAuth()

  const amIFollowing = isFollowing(username)
  const isMe = currentUser?.username === username
  const stopProp = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <div className="absolute inset-0 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-black/40 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-300 flex flex-col items-center gap-6 text-center"
        onClick={stopProp}
      >
        <div className="w-32 h-32 rounded-full p-1 bg-gradient-to-tr from-[var(--spheres-purple)] to-pink-500">
          <div className="w-full h-full rounded-full border-4 border-black overflow-hidden bg-zinc-900">
            {isLoading ? (
              <div className="w-full h-full bg-white/10 animate-pulse" />
            ) : profile?.profile_image ? (
              <img src={profile.profile_image} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-white/50">
                {username[0].toUpperCase()}
              </div>
            )}
          </div>
        </div>
        <div className="space-y-1 w-full">
          <h2 className="text-2xl font-bold text-white">{username}</h2>
          {isLoading ? (
            <div className="h-4 w-24 bg-white/10 animate-pulse mx-auto rounded" />
          ) : (
            <p className="text-sm font-medium text-white/50 line-clamp-2 px-2">{profile?.bio || 'Space Drifter'}</p>
          )}
        </div>
        <div className="flex gap-8 py-4 border-y border-white/5 w-full justify-center">
          <div>
            <p className="text-xl font-bold text-white">{isLoading ? '-' : profile?.following_count ?? 0}</p>
            <p className="text-[10px] uppercase tracking-widest text-white/40">Following</p>
          </div>
          <div>
            <p className="text-xl font-bold text-white">{isLoading ? '-' : profile?.followers_count ?? 0}</p>
            <p className="text-[10px] uppercase tracking-widest text-white/40">Followers</p>
          </div>
        </div>
        <div className="flex gap-4 w-full">
          {!isMe && (
            <button
              onClick={() => toggleFollow(username)}
              disabled={followLoading || isLoading}
              className={`flex-1 py-4 rounded-2xl font-bold text-sm tracking-wide hover:scale-105 transition-all ${
                amIFollowing ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-white text-black'
              }`}
            >
              {followLoading ? '...' : amIFollowing ? 'Following' : 'Follow'}
            </button>
          )}
          <Link
            to={`/user/${username}`}
            className={`flex-1 py-4 rounded-2xl bg-white/5 text-white font-bold text-sm tracking-wide hover:bg-white/10 transition-colors flex items-center justify-center ${
              isMe ? 'w-full' : ''
            }`}
          >
            View Profile
          </Link>
        </div>
      </div>
    </div>
  )
}

function useSpheresEngine(slug: string, currentUser: any, activeSpeakers: string[] = []) {
  const [orbs, setOrbs] = useState<Orb[]>([])
  const [particles, setParticles] = useState<Particle[]>([])
  const [selectedOrbId, setSelectedOrbId] = useState<string | null>(null)
  const [activeScene, setActiveScene] = useState(0)

  const socketRef = useRef<WebSocket | null>(null)
  const lastUpdateRef = useRef<number>(0)
  const requestRef = useRef<number>(0)
  const dragRef = useRef<{ dragging: boolean; pointerId: number | null }>({ dragging: false, pointerId: null })

  const spawnEmoteParticles = useCallback((userId: string, emoji: string) => {
    setOrbs((currentOrbs) => {
      const targetOrb = currentOrbs.find((orb) => orb.id === userId)
      if (!targetOrb) return currentOrbs

      const newParticles: Particle[] = []
      for (let i = 0; i < 12; i++) {
        newParticles.push({
          id: `${userId}-${Math.random()}`,
          x: targetOrb.x,
          y: targetOrb.y,
          vx: (Math.random() - 0.5) * 0.52,
          vy: (Math.random() - 1) * 0.55 - 0.18,
          emoji,
          life: 1 + Math.random() * 0.5,
        })
      }

      setParticles((prev) => [...prev, ...newParticles])
      return currentOrbs
    })
  }, [])

  const applyParticipantsSnapshot = useCallback(
    (participants: Array<{ user_id: number; username: string; profile_image: string | null; role: OrbRole; hand_raised: boolean }>) => {
      if (!participants.length) return

      setOrbs((prev) => {
        const existing = new Map(prev.map((orb) => [orb.id, orb]))
        const next = [...prev]

        participants.forEach((participant) => {
          const id = String(participant.user_id)
          if (existing.has(id)) {
            const orb = existing.get(id)!
            Object.assign(orb, {
              username: participant.username,
              image: participant.profile_image,
              role: participant.role,
              handRaised: participant.hand_raised,
            })
            return
          }

          const x = Math.random() * 62 + 18
          const y = Math.random() * 62 + 18
          next.push({
            id,
            username: participant.username,
            image: participant.profile_image,
            x,
            y,
            targetX: x,
            targetY: y,
            vx: (Math.random() - 0.5) * 0.12,
            vy: (Math.random() - 0.5) * 0.12,
            radius: 8,
            isTalking: false,
            isSelf: currentUser && String(currentUser.id) === id,
            role: participant.role,
            handRaised: participant.hand_raised,
            justJoinedAt: Date.now(),
          })
        })

        return next.map((orb) => ({ ...orb }))
      })
    },
    [currentUser],
  )

  useEffect(() => {
    if (!currentUser || !slug) return

    const myOrb: Orb = {
      id: String(currentUser.id),
      username: currentUser.username,
      image: currentUser.profile_image,
      x: Math.random() * 56 + 22,
      y: Math.random() * 56 + 22,
      targetX: 50,
      targetY: 50,
      vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.2,
      radius: 8,
      isTalking: false,
      isSelf: true,
      handRaised: false,
      justJoinedAt: Date.now(),
    }
    setOrbs([myOrb])

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const configuredWsBase = (import.meta.env.VITE_WS_BASE as string | undefined)?.trim()

    const deriveBackendHost = () => {
      if (configuredWsBase) {
        return configuredWsBase.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/\/$/, '')
      }
      if (window.location.port === '5173') {
        return `${window.location.hostname}:8000`
      }
      return window.location.host
    }

    const wsUrl = `${protocol}//${deriveBackendHost()}/ws/spheres/${slug}/`
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'orb_update', orb: myOrb }))
    }

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)

      if (data.type === 'user_left') {
        setOrbs((prev) => prev.map((orb) => (orb.id === String(data.user_id) ? { ...orb, leaving: true } : orb)))
        window.setTimeout(() => {
          setOrbs((prev) => prev.filter((orb) => orb.id !== String(data.user_id)))
        }, 220)
        return
      }

      if (data.type === 'orb_update') {
        const remoteOrb = data.orb
        if (!remoteOrb || String(remoteOrb.id) === String(currentUser.id)) return

        setOrbs((prev) => {
          const exists = prev.find((orb) => orb.id === String(remoteOrb.id))
          if (exists) {
            return prev.map((orb) =>
              orb.id === String(remoteOrb.id)
                ? {
                    ...orb,
                    targetX: Number.isFinite(remoteOrb.x) ? remoteOrb.x : orb.targetX,
                    targetY: Number.isFinite(remoteOrb.y) ? remoteOrb.y : orb.targetY,
                    vx: Number.isFinite(remoteOrb.vx) ? remoteOrb.vx : orb.vx,
                    vy: Number.isFinite(remoteOrb.vy) ? remoteOrb.vy : orb.vy,
                    role: remoteOrb.role || orb.role,
                    handRaised: typeof remoteOrb.handRaised === 'boolean' ? remoteOrb.handRaised : orb.handRaised,
                  }
                : orb,
            )
          }

          const spawnX = clamp(Number(remoteOrb.x) || Math.random() * 70 + 15, 2, 98)
          const spawnY = clamp(Number(remoteOrb.y) || Math.random() * 70 + 15, 2, 98)
          return [
            ...prev,
            {
              id: String(remoteOrb.id),
              username: remoteOrb.username ?? 'Explorer',
              image: remoteOrb.image ?? null,
              x: spawnX,
              y: spawnY,
              targetX: spawnX,
              targetY: spawnY,
              vx: Number(remoteOrb.vx) || 0,
              vy: Number(remoteOrb.vy) || 0,
              radius: 8,
              isTalking: false,
              isSelf: false,
              role: remoteOrb.role,
              handRaised: !!remoteOrb.handRaised,
              justJoinedAt: Date.now(),
            },
          ]
        })
        return
      }

      if (data.type === 'emote_burst') {
        const uid = String(data.user_id)
        const emoji = String(data.emote || '❤️')
        spawnEmoteParticles(uid, emoji)
        return
      }

      if (data.type === 'role_change') {
        setOrbs((prev) => prev.map((orb) => (orb.id === String(data.user_id) ? { ...orb, role: data.new_role } : orb)))
        return
      }

      if (data.type === 'hand_raise') {
        setOrbs((prev) => prev.map((orb) => (orb.id === String(data.user_id) ? { ...orb, handRaised: !!data.raised } : orb)))
        return
      }

      if (data.type === 'scene_change') {
        const next = clamp(Number(data.scene) || 0, 0, 2)
        setActiveScene(next)
      }
    }

    socketRef.current = ws
    return () => ws.close()
  }, [slug, currentUser, spawnEmoteParticles])

  useEffect(() => {
    setOrbs((prev) => prev.map((orb) => ({ ...orb, isTalking: activeSpeakers.includes(orb.id) })))
  }, [activeSpeakers])

  const sendEmote = useCallback((emoji: string = '❤️') => {
    if (currentUser) {
      spawnEmoteParticles(String(currentUser.id), emoji)
    }

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'emote_burst', emote: emoji }))
    }
  }, [currentUser, spawnEmoteParticles])

  const sendHandRaise = useCallback((raised: boolean) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'hand_raise', raised }))
    }
  }, [])

  const sendModeration = useCallback((type: string, targetUserId?: number) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type, target_user_id: targetUserId }))
    }
  }, [])

  const sendSceneChange = useCallback((scene: number) => {
    const next = clamp(Math.round(scene), 0, 2)
    setActiveScene(next)

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'scene_change', scene: next }))
    }
  }, [])

  const onSelfPointerDown = useCallback((pointerId: number) => {
    dragRef.current = { dragging: true, pointerId }
  }, [])

  const onSelfPointerMove = useCallback((event: PointerEvent) => {
    const drag = dragRef.current
    if (!drag.dragging || drag.pointerId !== event.pointerId) return

    const root = document.getElementById('spheres-space-root')
    if (!root) return
    const rect = root.getBoundingClientRect()
    if (!rect.width || !rect.height) return

    const x = clamp(((event.clientX - rect.left) / rect.width) * 100, 2, 98)
    const y = clamp(((event.clientY - rect.top) / rect.height) * 100, 2, 98)

    setOrbs((prev) =>
      prev.map((orb) => {
        if (!orb.isSelf) return orb
        return {
          ...orb,
          x,
          y,
          targetX: x,
          targetY: y,
          vx: 0,
          vy: 0,
        }
      }),
    )
  }, [])

  const onSelfPointerUp = useCallback((pointerId: number) => {
    if (dragRef.current.pointerId !== pointerId) return
    dragRef.current = { dragging: false, pointerId: null }
  }, [])

  const updatePhysics = useCallback(() => {
    setOrbs((prevOrbs) => {
      const selfOrb = prevOrbs.find((orb) => orb.isSelf)
      if (!selfOrb) return prevOrbs

      const now = Date.now()
      const drag = dragRef.current

      let updatedSelf = selfOrb

      if (!drag.dragging) {
        let { x, y, vx, vy } = selfOrb

        const centerX = 50
        const centerY = 50
        const gravityStrength = 0.00025

        vx += (centerX - x) * gravityStrength
        vy += (centerY - y) * gravityStrength

        const repulsionRadius = 12
        const repulsionForce = 0.012

        prevOrbs.forEach((other) => {
          if (other.id === selfOrb.id) return
          const dx = x - other.x
          const dy = y - other.y
          const distSq = dx * dx + dy * dy
          const dist = Math.sqrt(distSq) || 0.1

          if (dist < repulsionRadius) {
            const force = (1 - dist / repulsionRadius) * repulsionForce
            vx += (dx / dist) * force
            vy += (dy / dist) * force
          }
        })

        vx *= 0.88
        vy *= 0.88
        x = clamp(x + vx, 2, 98)
        y = clamp(y + vy, 2, 98)

        updatedSelf = { ...selfOrb, x, y, targetX: x, targetY: y, vx, vy }
      }

      if (now - lastUpdateRef.current > ORB_SEND_INTERVAL_MS && socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'orb_update', orb: updatedSelf }))
        lastUpdateRef.current = now
      }

      return prevOrbs.map((orb) => {
        if (orb.isSelf) return updatedSelf
        const x = orb.x + (orb.targetX - orb.x) * REMOTE_INTERPOLATION
        const y = orb.y + (orb.targetY - orb.y) * REMOTE_INTERPOLATION
        return { ...orb, x, y }
      })
    })

    setParticles((prev) =>
      prev
        .map((particle) => ({
          ...particle,
          x: particle.x + particle.vx,
          y: particle.y + particle.vy,
          life: particle.life - 0.015,
        }))
        .filter((particle) => particle.life > 0),
    )

    requestRef.current = window.requestAnimationFrame(updatePhysics)
  }, [])

  useEffect(() => {
    requestRef.current = window.requestAnimationFrame(updatePhysics)
    return () => window.cancelAnimationFrame(requestRef.current)
  }, [updatePhysics])

  return {
    orbs,
    particles,
    selectedOrbId,
    setSelectedOrbId,
    socketRef,
    applyParticipantsSnapshot,
    sendEmote,
    sendHandRaise,
    sendModeration,
    activeScene,
    sendSceneChange,
    onSelfPointerDown,
    onSelfPointerMove,
    onSelfPointerUp,
  }
}

export default function SpheresPage() {
  const { slug } = useParams<{ slug: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [activeSpeakers, setActiveSpeakers] = useState<string[]>([])
  const [emotePickerOpen, setEmotePickerOpen] = useState(false)
  const [requestsPanelOpen, setRequestsPanelOpen] = useState(false)
  const [roomNotice, setRoomNotice] = useState<string | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const mouseMoveRafRef = useRef<number | null>(null)
  const pendingMousePosRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 2
      const y = (e.clientY / window.innerHeight - 0.5) * 2
      pendingMousePosRef.current = { x, y }
      if (mouseMoveRafRef.current !== null) return
      mouseMoveRafRef.current = window.requestAnimationFrame(() => {
        mouseMoveRafRef.current = null
        setMousePos(pendingMousePosRef.current)
      })
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      if (mouseMoveRafRef.current !== null) {
        window.cancelAnimationFrame(mouseMoveRafRef.current)
        mouseMoveRafRef.current = null
      }
    }
  }, [])

  const {
    orbs,
    particles,
    sendEmote,
    sendHandRaise,
    sendModeration,
    activeScene,
    sendSceneChange,
    selectedOrbId,
    setSelectedOrbId,
    socketRef,
    applyParticipantsSnapshot,
    onSelfPointerDown,
    onSelfPointerMove,
    onSelfPointerUp,
  } = useSpheresEngine(slug!, user, activeSpeakers)

  const spatialPositions = useMemo(() => orbs.map((orb) => ({ id: orb.id, x: orb.x, y: orb.y, isSelf: !!orb.isSelf })), [orbs])

  const {
    isMuted,
    isDeafened,
    toggleMic,
    toggleDeafen,
    connectionState,
    participantCount,
    role,
    audioLevels,
    ensureAudioReady,
    audioReady,
    spatialAudioAvailable,
    canPublishAudio,
    lastAudioError,
    retryConnection,
  } = useLiveKitAudio({
    slug: slug!,
    enabled: !!user,
    onActiveSpeakersChanged: setActiveSpeakers,
    spatialPositions,
    currentRole: orbs.find((orb) => orb.isSelf)?.role,
  })

  const selfOrb = useMemo(() => orbs.find((orb) => orb.isSelf), [orbs])
  const selectedUser = useMemo(() => orbs.find((orb) => orb.id === selectedOrbId), [orbs, selectedOrbId])
  const effectiveRole = (selfOrb?.role ?? role) as 'conductor' | 'speaker' | 'listener'
  const isConductor = effectiveRole === 'conductor'

  const selfAudioLevel = selfOrb ? (audioLevels[selfOrb.id] ?? 0) : 0
  const reactiveGlow = selfAudioLevel > 0
    ? `inset 0 0 0 1px rgba(255,255,255,${0.2 + selfAudioLevel * 0.4}), 0 0 ${15 + selfAudioLevel * 25}px rgba(122,120,255,${0.3 + selfAudioLevel * 0.4})`
    : `inset 0 1px 1px rgba(255,255,255,0.15), 0 8px 32px rgba(0,0,0,0.4)`

  const { data: requestsData } = useQuery({
    queryKey: ['sphereRequests', slug],
    queryFn: () => fetchSphereRequests(slug!),
    enabled: isConductor && !!slug,
    refetchInterval: 10000,
  })
  const pendingRequests = requestsData?.requests ?? []

  const { data: participantsData } = useQuery({
    queryKey: ['sphereParticipants', slug],
    queryFn: () => fetchSphereParticipants(slug!),
    enabled: !!slug && !!user,
    refetchInterval: 8000,
  })

  useEffect(() => {
    if (!participantsData?.participants) return
    applyParticipantsSnapshot(participantsData.participants)
  }, [participantsData, applyParticipantsSnapshot])

  const approveMutation = useMutation({
    mutationFn: (requestId: number) => approveSphereRequest(slug!, requestId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sphereRequests', slug] }),
  })

  const denyMutation = useMutation({
    mutationFn: (requestId: number) => denySphereRequest(slug!, requestId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sphereRequests', slug] }),
  })

  const handRaiseMutation = useMutation({
    mutationFn: () => toggleSphereHandRaise(slug!),
    onSuccess: ({ raised }) => {
      setRoomNotice(raised ? 'Hand raised. Waiting for the conductor.' : 'Hand lowered.')
      queryClient.invalidateQueries({ queryKey: ['sphereParticipants', slug] })
    },
  })

  const promoteMutation = useMutation({
    mutationFn: (userId: number) => promoteSphereSpeaker(slug!, userId),
    onSuccess: () => {
      setRoomNotice('Speaker invited to the stage.')
      queryClient.invalidateQueries({ queryKey: ['sphereParticipants', slug] })
    },
  })

  const demoteMutation = useMutation({
    mutationFn: (userId: number) => demoteSphereSpeaker(slug!, userId),
    onSuccess: () => {
      setRoomNotice('Speaker moved back to listeners.')
      queryClient.invalidateQueries({ queryKey: ['sphereParticipants', slug] })
    },
  })

  useEffect(() => {
    if (!lastAudioError) return
    setRoomNotice(lastAudioError)
  }, [lastAudioError])

  useEffect(() => {
    if (!roomNotice) return
    const timeout = window.setTimeout(() => setRoomNotice(null), 2600)
    return () => window.clearTimeout(timeout)
  }, [roomNotice])

  useEffect(() => {
    const ws = socketRef.current
    if (!ws || !user) return

    const handler = (event: MessageEvent) => {
      const data = JSON.parse(event.data)
      if (data.type === 'force_mute' && String(data.target_user_id) === String(user.id)) {
        if (!isMuted) {
          void toggleMic()
        }
      } else if (data.type === 'user_removed' && String(data.target_user_id) === String(user.id)) {
        navigate(`/c/${slug}`)
      }
    }

    ws.addEventListener('message', handler)
    return () => ws.removeEventListener('message', handler)
  }, [socketRef, user, isMuted, toggleMic, navigate, slug])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault()
        void toggleMic()
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault()
        void toggleDeafen()
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault()
        setEmotePickerOpen((prev) => !prev)
      } else if (e.key === 'Escape') {
        if (selectedOrbId) {
          setSelectedOrbId(null)
        } else if (emotePickerOpen) {
          setEmotePickerOpen(false)
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleMic, toggleDeafen, selectedOrbId, emotePickerOpen, setSelectedOrbId])

  useEffect(() => {
    const move = (event: PointerEvent) => onSelfPointerMove(event)
    const up = (event: PointerEvent) => onSelfPointerUp(event.pointerId)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [onSelfPointerMove, onSelfPointerUp])

  const distanceStyled = useMemo(() => {
    const self = selfOrb
    const crowdScale = getCrowdScale(orbs.length)
    return orbs.map((orb) => {
      const base = getOrbRadius(orb.role) * crowdScale
      const distance = self ? Math.hypot(orb.x - self.x, orb.y - self.y) : 0
      const normalized = clamp(distance / 75, 0, 1)
      const audioLevel = audioLevels[orb.id] ?? 0
      const talkingBoost = orb.isTalking ? 0.1 : 0
      const detailBoost = audioLevel * 0.2
      const depthScale = orb.isSelf ? 1 : 1.2 - normalized * 0.46 + talkingBoost + detailBoost
      const opacity = orb.isSelf ? 1 : 1 - normalized * 0.42
      const blur = orb.isSelf ? 0 : normalized * 2.4
      const saturation = orb.isSelf ? 1.08 : 1.06 - normalized * 0.2
      const zOrder = Math.round(100 - normalized * 50 + (orb.isTalking ? 20 : 0))
      const glow = 0.2 + audioLevel * 0.7 + (orb.isTalking ? 0.35 : 0)

      return {
        orb,
        base,
        normalized,
        depthScale,
        opacity,
        blur,
        saturation,
        zOrder,
        glow,
        audioLevel,
      }
    })
  }, [orbs, selfOrb, audioLevels])

  if (!user) {
    return (
      <div className="fixed inset-0 bg-black text-white flex flex-col items-center justify-center space-y-4">
        <Link to="/login" className="px-8 py-3 bg-white text-black rounded-full font-bold">
          Login
        </Link>
      </div>
    )
  }

  return (
    <div id="spheres-space-root" className="fixed inset-0 z-50 overflow-hidden bg-black font-sans selection:bg-purple-500/30">
      <div className="absolute inset-0 opacity-80 transition-opacity duration-700">
        <Suspense fallback={null}>
          <SpheresNebulaScene activeScene={activeScene} orbs={orbs} audioLevels={audioLevels} />
        </Suspense>
      </div>

      <div className="absolute inset-0 bg-[#020205]/42 overflow-hidden transition-all duration-700 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(38,50,88,0.18)_0%,rgba(3,5,13,0.82)_72%)]" />
        <div className="absolute inset-0 opacity-[0.035] bg-[radial-gradient(rgba(255,255,255,0.15)_0.5px,transparent_0.5px)] [background-size:3px_3px]" />
      </div>

      <div className={`relative w-full h-full pointer-events-none transition-all duration-500 ${isDeafened ? 'opacity-55' : 'opacity-100'} ${selectedOrbId ? 'scale-95 blur-[1px] grayscale-[0.12]' : ''}`}>
        {distanceStyled.map(({ orb, base, depthScale, opacity, blur, saturation, zOrder, glow, audioLevel, normalized }) => {
          return (
            <div
              key={orb.id}
              onClick={() => setSelectedOrbId(orb.id)}
              onPointerDown={(event) => {
                if (!orb.isSelf) return
                event.currentTarget.setPointerCapture(event.pointerId)
                onSelfPointerDown(event.pointerId)
                void ensureAudioReady()
              }}
              // The hit area needs to be large enough to click the 3D orb behind it
              className={`absolute pointer-events-auto -translate-x-1/2 -translate-y-1/2 will-change-transform flex flex-col items-center justify-end gap-3 transition-all duration-300 ease-out cursor-pointer hover:scale-110 active:scale-95 ${orb.leaving ? 'animate-fade-out-fast' : ''}`}
              style={{
                left: `${orb.x}%`,
                top: `${orb.y}%`,
                width: `${base * 2}vw`,
                height: `${base * 2}vw`,
                maxWidth: orb.role === 'conductor' ? '112px' : '96px',
                maxHeight: orb.role === 'conductor' ? '112px' : '96px',
                minWidth: '56px',
                minHeight: '56px',
                zIndex: zOrder,
                opacity,
                filter: `blur(${blur}px) saturate(${saturation})`,
                transform: `translate(-50%, -50%) scale(${depthScale})`,
              }}
            >
              {orb.handRaised && <div className="absolute -top-3 right-0 text-xl animate-bounce z-20 drop-shadow-lg">✋</div>}
            </div>
          )
        })}

        {particles.map((particle) => (
          <div
            key={particle.id}
            className="absolute pointer-events-none text-2xl"
            style={{ left: `${particle.x}%`, top: `${particle.y}%`, opacity: particle.life, transform: `scale(${particle.life})`, animation: 'spin-slow 3s linear infinite' }}
          >
            {particle.emoji}
          </div>
        ))}
      </div>

      <div 
        className={`absolute top-10 left-10 z-30 pointer-events-none select-none transition-all duration-500 ease-out ${selectedOrbId ? 'opacity-0' : 'opacity-100'}`}
        style={{ transform: `perspective(1000px) rotateX(${-mousePos.y * 4}deg) rotateY(${mousePos.x * 4}deg) translateZ(10px)` }}
      >
        <h1 className="text-4xl font-sans tracking-[0.4em] font-light text-white/90 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">SPHERES</h1>
        <div className="h-px w-12 bg-white/20 my-3" />
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isDeafened ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`} />
          <p className="text-[10px] text-white/50 tracking-[0.2em]">{participantCount} LISTENING</p>
        </div>
        <p className="text-[10px] mt-2 text-white/35 tracking-[0.15em] uppercase">
          {spatialAudioAvailable ? (audioReady ? 'Spatial Audio Active' : 'Tap mic or deafen to activate audio') : 'Browser fallback audio'}
        </p>
        <p className="text-[10px] mt-1 text-white/35 tracking-[0.15em] uppercase">Room {connectionState}</p>
        <p className="text-[10px] mt-1 text-white/35 tracking-[0.15em] uppercase">Role {effectiveRole}</p>
        <p className="text-[10px] mt-1 text-white/35 tracking-[0.15em] uppercase">
          Scene {activeScene === 0 ? 'Solar' : activeScene === 1 ? 'Nebula Glow' : 'Earth Night'}
        </p>
      </div>

      {roomNotice && (
        <div className="absolute top-10 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/10 bg-black/65 px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-white/80 backdrop-blur-xl">
          {roomNotice}
        </div>
      )}

      {isConductor && !selectedOrbId && (
        <div className="absolute top-10 right-10 z-30">
          <div className="mb-3 rounded-2xl border border-white/10 bg-black/45 p-2 backdrop-blur-xl">
            <div className="mb-1 px-2 text-[10px] uppercase tracking-[0.18em] text-white/50">Spaces</div>
            <div className="flex items-center gap-1">
              {[
                { id: 0, label: 'Solar' },
                { id: 1, label: 'Nebula Glow' },
                { id: 2, label: 'Earth Night' },
              ].map((scene) => (
                <button
                  key={scene.id}
                  onClick={() => {
                    sendSceneChange(scene.id)
                    setRoomNotice(`Switched to ${scene.label} space.`)
                  }}
                  className={`rounded-xl px-3 py-1.5 text-[10px] font-semibold tracking-[0.12em] transition-all ${activeScene === scene.id ? 'bg-white text-black' : 'bg-white/10 text-white/75 hover:bg-white/20'}`}
                >
                  {scene.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setRequestsPanelOpen((prev) => !prev)}
            className="relative flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/10 text-white/70 hover:text-white hover:bg-black/50 transition-all text-xs font-medium tracking-wide"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
            Requests
            {pendingRequests.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-[var(--spheres-purple)] text-white rounded-full px-1">
                {pendingRequests.length}
              </span>
            )}
          </button>

          {requestsPanelOpen && (
            <div className="absolute top-full right-0 mt-2 w-72 rounded-2xl bg-black/60 backdrop-blur-2xl border border-white/10 shadow-2xl overflow-hidden animate-slideInFromBottom">
              <div className="p-3 border-b border-white/5">
                <p className="text-[10px] uppercase tracking-widest text-white/40 font-semibold">Pending Requests</p>
              </div>
              {pendingRequests.length === 0 ? (
                <div className="p-5 text-center">
                  <p className="text-xs text-white/30">No pending requests</p>
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto">
                  {pendingRequests.map((request) => (
                    <div key={request.id} className="flex items-center gap-3 p-3 border-b border-white/5 last:border-0">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-white/10 shrink-0">
                        {request.profile_image ? (
                          <img src={request.profile_image} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/40 text-xs font-bold">{request.username[0].toUpperCase()}</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-white truncate">{request.username}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => approveMutation.mutate(request.id)}
                          disabled={approveMutation.isPending}
                          className="px-2.5 py-1 text-[10px] font-semibold rounded-full bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => denyMutation.mutate(request.id)}
                          disabled={denyMutation.isPending}
                          className="px-2.5 py-1 text-[10px] font-semibold rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                        >
                          Deny
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {emotePickerOpen && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 transition-all duration-300 z-30">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-black/60 backdrop-blur-xl border border-white/10 shadow-2xl">
            {EMOTE_OPTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  sendEmote(emoji)
                  setEmotePickerOpen(false)
                }}
                className="text-2xl hover:scale-125 active:scale-90 transition-transform p-1"
                aria-label={`Send ${emoji} emote`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      <div 
        className={`absolute bottom-10 left-1/2 z-40 transition-all duration-[600ms] ease-[cubic-bezier(0.23,1,0.32,1)] ${selectedOrbId ? 'translate-y-32 opacity-0' : 'translate-y-0 opacity-100'}`}
        style={{ transform: `perspective(1000px) translateX(-50%) rotateX(${-mousePos.y * 6}deg) rotateY(${mousePos.x * 6}deg) translateZ(20px)` }}
      >
        <div 
          className="pointer-events-auto flex items-center gap-6 px-5 py-3 rounded-[2.5rem] bg-white/5 backdrop-blur-3xl transition-all duration-300"
          style={{ boxShadow: reactiveGlow }}
        >
          <button
            onClick={async () => {
              try {
                await leaveSphere(slug!)
              } catch {
                // no-op
              }
              navigate(`/c/${slug}`)
            }}
            aria-label="Exit sphere"
            className="w-12 h-12 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-red-500/20 border border-transparent transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-90 hover:scale-[1.05]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" /></svg>
          </button>
          <div className="w-px h-8 bg-white/10" />

          <button
            onClick={() => setEmotePickerOpen((prev) => !prev)}
            aria-label="Toggle emote picker"
            className={`w-12 h-12 rounded-full flex items-center justify-center border border-transparent transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-90 hover:scale-[1.05] ${emotePickerOpen ? 'text-pink-300 bg-pink-500/20' : 'text-pink-400 hover:text-pink-300 hover:bg-pink-500/20'}`}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" className="w-6 h-6"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
          </button>

          <button
            onClick={async () => {
              const unlocked = await ensureAudioReady()

              if (effectiveRole === 'listener') {
                if (!audioReady || !unlocked || connectionState !== 'connected') {
                  if (connectionState !== 'connected') {
                    retryConnection()
                  }
                  setRoomNotice(connectionState === 'connected' ? 'Audio unlocked. You can now listen.' : 'Joining voice room...')
                  return
                }

                handRaiseMutation.mutate()
                return
              }

              if (!unlocked) {
                setRoomNotice('Tap again if your browser blocked audio.')
                return
              }

              if (connectionState !== 'connected') {
                retryConnection()
                setRoomNotice('Audio room is still connecting.')
                return
              }

              if (isDeafened) {
                await toggleDeafen()
                setRoomNotice('Audio undeafened.')
              }

              void toggleMic()
            }}
            aria-label={effectiveRole === 'listener' ? 'Raise hand to speak' : isMuted ? 'Unmute microphone' : 'Mute microphone'}
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] shadow-xl relative active:scale-95 hover:scale-[1.05] ${effectiveRole === 'listener' ? 'bg-yellow-500/18 text-yellow-200 border border-yellow-400/30 hover:bg-yellow-500/24' : connectionState !== 'connected' ? 'bg-white/5 text-white/30 border border-white/10 cursor-not-allowed' : isMuted ? 'bg-white/5 text-white/50 border border-white/5 hover:bg-white/10' : 'bg-[var(--spheres-purple)] text-white scale-[1.05] hover:scale-[1.1] shadow-[0_0_40px_rgba(88,86,214,0.5)] border border-[#7A78FF]'}`}
          >
            {canPublishAudio && effectiveRole !== 'listener' && !isMuted && <div className="absolute inset-0 rounded-full border border-white/30 animate-ping opacity-50" />}
            {effectiveRole === 'listener' ? (
              <span className="text-2xl">✋</span>
            ) : isMuted ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7"><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
            )}
          </button>

          <button
            onClick={() => {
              if (connectionState !== 'connected') {
                retryConnection()
                setRoomNotice('Joining voice room...')
                return
              }
              void toggleDeafen()
            }}
            aria-label={isDeafened ? 'Undeafen audio' : 'Deafen audio'}
            className={`w-12 h-12 flex items-center justify-center rounded-full transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-90 hover:scale-[1.05] border ${connectionState !== 'connected' ? 'bg-white/5 text-white/30 border-white/10 cursor-not-allowed' : isDeafened ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border-transparent'}`}
          >
            {isDeafened ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6"><line x1="1" y1="1" x2="23" y2="23" /><path d="M11 5L6 9H2v6h4l5 4V5z" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
            )}
          </button>

          {effectiveRole === 'listener' && (
            <>
              <div className="w-px h-8 bg-white/10" />
              <button
                onClick={() => handRaiseMutation.mutate()}
                aria-label="Raise hand"
                className={`w-12 h-12 rounded-full flex items-center justify-center border transition-all text-lg ${selfOrb?.handRaised ? 'bg-yellow-500/20 border-yellow-500/30' : 'bg-white/5 border-transparent hover:bg-white/10'}`}
              >
                ✋
              </button>
            </>
          )}

          {isConductor && selectedUser && !selectedUser.isSelf && (
            <>
              <div className="w-px h-8 bg-white/10" />
              {selectedUser.role === 'listener' ? (
                <button
                  onClick={() => promoteMutation.mutate(Number(selectedUser.id))}
                  aria-label="Invite selected listener to speak"
                  className="w-12 h-12 rounded-full flex items-center justify-center bg-green-500/20 text-green-300 hover:bg-green-500/30 transition-all"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path d="M12 4v16" /><path d="M4 12h16" /></svg>
                </button>
              ) : (
                <button
                  onClick={() => demoteMutation.mutate(Number(selectedUser.id))}
                  aria-label="Move selected speaker to listeners"
                  className="w-12 h-12 rounded-full flex items-center justify-center bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-all"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><path d="M5 12h14" /></svg>
                </button>
              )}
              <button
                onClick={() => sendModeration('mute_speaker', Number(selectedUser.id))}
                aria-label="Mute selected speaker"
                className="w-12 h-12 rounded-full flex items-center justify-center bg-white/5 text-white/70 hover:text-white hover:bg-white/10 transition-all"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-5 h-5"><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5 2.2" /><path d="M19 10v2a7 7 0 0 1-.45 2.48" /></svg>
              </button>
              <button
                onClick={() => sendModeration('remove_from_room', Number(selectedUser.id))}
                aria-label="Remove selected user"
                className="w-12 h-12 rounded-full flex items-center justify-center bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </>
          )}

          {isConductor && (
            <>
              <div className="w-px h-8 bg-white/10" />
              <button
                onClick={async () => {
                  try {
                    await endSphere(slug!)
                  } catch {
                    // no-op
                  }
                  navigate(`/c/${slug}`)
                }}
                aria-label="End sphere"
                className="w-12 h-12 rounded-full flex items-center justify-center bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 transition-all"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
              </button>
            </>
          )}
        </div>
      </div>

      {selectedOrbId && selectedUser && <GlassProfileCard username={selectedUser.username} onClose={() => setSelectedOrbId(null)} />}
    </div>
  )
}
