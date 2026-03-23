import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Room,
  RoomEvent,
  ConnectionState,
  Track,
  type LocalTrack,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
} from 'livekit-client'
import { createSphere, fetchCsrf, joinSphere } from '../api'

type LiveKitConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

export interface SpatialParticipantPosition {
  id: string
  x: number
  y: number
  isSelf?: boolean
}

interface ParticipantAudioGraph {
  participantId: string
  audioElement: HTMLAudioElement
  sourceNode?: MediaElementAudioSourceNode
  analyserNode?: AnalyserNode
  gainNode?: GainNode
  pannerNode?: PannerNode
  dataArray?: Uint8Array<ArrayBuffer>
}

interface UseLiveKitAudioOptions {
  slug: string
  enabled: boolean
  onActiveSpeakersChanged?: (speakerIds: string[]) => void
  spatialPositions?: SpatialParticipantPosition[]
  currentRole?: 'conductor' | 'speaker' | 'listener'
}

interface UseLiveKitAudioReturn {
  isMuted: boolean
  toggleMic: () => Promise<void>
  isDeafened: boolean
  toggleDeafen: () => Promise<void>
  connectionState: LiveKitConnectionState
  participantCount: number
  role: 'conductor' | 'speaker' | 'listener'
  audioLevels: Record<string, number>
  ensureAudioReady: () => Promise<boolean>
  audioReady: boolean
  spatialAudioAvailable: boolean
  canPublishAudio: boolean
  lastAudioError: string | null
  retryConnection: () => void
}

const MIN_GAIN = 0.28
const MAX_GAIN = 1
const MAX_AUDIO_DISTANCE = 15
const X_SCALE = 0.2
const Z_SCALE = 0.25

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeLiveKitUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl)

    // Avoid mixed-content failures in HTTPS contexts.
    if (window.location.protocol === 'https:' && parsed.protocol === 'ws:') {
      parsed.protocol = 'wss:'
    }

    // If backend returns localhost while UI is served from another host,
    // prefer the current hostname for browser reachability.
    if (parsed.hostname === 'localhost' && window.location.hostname && window.location.hostname !== 'localhost') {
      parsed.hostname = window.location.hostname
    }

    return parsed.toString()
  } catch {
    return rawUrl
  }
}

function getApiErrorInfo(error: unknown): { status?: number; message?: string } {
  if (typeof error !== 'object' || !error || !('response' in error)) {
    if (error instanceof Error && error.message) {
      return { message: error.message }
    }
    return {}
  }

  const response = (error as { response?: { status?: number; data?: { error?: string; detail?: string; message?: string } } }).response
  return {
    status: response?.status,
    message: response?.data?.error ?? response?.data?.detail ?? response?.data?.message,
  }
}

export function useLiveKitAudio({
  slug,
  enabled,
  onActiveSpeakersChanged,
  spatialPositions = [],
  currentRole,
}: UseLiveKitAudioOptions): UseLiveKitAudioReturn {
  const [isMuted, setIsMuted] = useState(true)
  const [isDeafened, setIsDeafened] = useState(false)
  const [connectionState, setConnectionState] = useState<LiveKitConnectionState>('disconnected')
  const [participantCount, setParticipantCount] = useState(0)
  const [role, setRole] = useState<'conductor' | 'speaker' | 'listener'>('listener')
  const [audioLevels, setAudioLevels] = useState<Record<string, number>>({})
  const [audioReady, setAudioReady] = useState(false)
  const [lastAudioError, setLastAudioError] = useState<string | null>(null)
  const [connectNonce, setConnectNonce] = useState(0)

  const roomRef = useRef<Room | null>(null)
  const localTrackRef = useRef<LocalTrack | null>(null)
  const deafenedRef = useRef(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const participantGraphsRef = useRef(new Map<string, ParticipantAudioGraph>())
  const analyserFrameRef = useRef<number | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const positionMapRef = useRef<Map<string, SpatialParticipantPosition>>(new Map())
  const audioLevelsRef = useRef<Record<string, number>>({})
  const spatialAudioSupportedRef = useRef(false)
  const syncSpatialRafRef = useRef<number | null>(null)
  const syncSpatialRequestedRef = useRef(false)
  const lastAnalyserAtRef = useRef<number>(0)
  const reconnectAttemptsRef = useRef(0)
  const maxReconnectAttempts = 5

  deafenedRef.current = isDeafened

  useEffect(() => {
    if (currentRole) {
      setRole(currentRole)
    }
  }, [currentRole])

  useEffect(() => {
    if (role !== 'listener' || !localTrackRef.current || !roomRef.current) return

    roomRef.current.localParticipant.unpublishTrack(localTrackRef.current).catch(() => {})
    localTrackRef.current.stop()
    localTrackRef.current = null
    setIsMuted(true)
  }, [role])

  const syncSpatialAudio = useCallback(() => {
    const context = audioContextRef.current
    const selfPosition = Array.from(positionMapRef.current.values()).find((entry) => entry.isSelf)

    participantGraphsRef.current.forEach((graph, participantId) => {
      const position = positionMapRef.current.get(participantId)
      if (!position || !selfPosition) {
        const gain = deafenedRef.current ? 0 : 1
        if (graph.gainNode && context) {
          graph.gainNode.gain.setTargetAtTime(gain, context.currentTime, 0.09)
        } else {
          graph.audioElement.volume = gain
        }
        return
      }

      const relativeX = (position.x - selfPosition.x) * X_SCALE
      const relativeZ = (position.y - selfPosition.y) * Z_SCALE
      
      // Let PannerNode handle spatial attenuation natively
      const gain = deafenedRef.current ? 0 : 1

      if (graph.pannerNode && context) {
        graph.pannerNode.positionX.setTargetAtTime(relativeX, context.currentTime, 0.08)
        graph.pannerNode.positionY.setTargetAtTime(0, context.currentTime, 0.08)
        graph.pannerNode.positionZ.setTargetAtTime(relativeZ, context.currentTime, 0.08)
      }

      if (graph.gainNode && context) {
        graph.gainNode.gain.setTargetAtTime(gain, context.currentTime, 0.09)
      } else {
        graph.audioElement.volume = gain
      }
    })
  }, [])

  // Coalesce potentially-frequent spatial sync calls (e.g. when orb positions update).
  const scheduleSyncSpatialAudio = useCallback(() => {
    if (syncSpatialRequestedRef.current) return
    syncSpatialRequestedRef.current = true

    syncSpatialRafRef.current = window.requestAnimationFrame(() => {
      syncSpatialRequestedRef.current = false
      syncSpatialRafRef.current = null
      syncSpatialAudio()
    })
  }, [syncSpatialAudio])

  const attachSpatialGraph = useCallback((graph: ParticipantAudioGraph) => {
    const context = audioContextRef.current
    if (!context || graph.sourceNode) return

    try {
      const sourceNode = context.createMediaElementSource(graph.audioElement)
      const analyserNode = context.createAnalyser()
      const gainNode = context.createGain()
      const pannerNode = context.createPanner()

      analyserNode.fftSize = 128
      analyserNode.smoothingTimeConstant = 0.84
      pannerNode.panningModel = 'HRTF'
      pannerNode.distanceModel = 'inverse'
      pannerNode.refDistance = 1.0
      pannerNode.maxDistance = 25
      pannerNode.rolloffFactor = 1.5
      pannerNode.coneInnerAngle = 360
      pannerNode.coneOuterAngle = 0
      gainNode.gain.value = deafenedRef.current ? 0 : 1

      sourceNode.connect(analyserNode)
      analyserNode.connect(gainNode)
      gainNode.connect(pannerNode)
      pannerNode.connect(context.destination)

      graph.sourceNode = sourceNode
      graph.analyserNode = analyserNode
      graph.gainNode = gainNode
      graph.pannerNode = pannerNode
      graph.dataArray = new Uint8Array(analyserNode.frequencyBinCount)

      scheduleSyncSpatialAudio()
    } catch (error) {
      console.error('Could not create spatial audio graph:', error)
    }
  }, [scheduleSyncSpatialAudio])

  const ensureAudioReady = useCallback(async () => {
    const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) {
      spatialAudioSupportedRef.current = false
      setAudioReady(false)
      return false
    }

    spatialAudioSupportedRef.current = true

    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContextCtor()
    }

    const context = audioContextRef.current
    const listener = context.listener
    if ('positionX' in listener) {
      listener.positionX.value = 0
      listener.positionY.value = 0
      listener.positionZ.value = 0
      listener.forwardX.value = 0
      listener.forwardY.value = 0
      listener.forwardZ.value = -1
      listener.upX.value = 0
      listener.upY.value = 1
      listener.upZ.value = 0
    }

    try {
      if (context.state !== 'running') {
        await context.resume()
      }

      if (roomRef.current) {
        await roomRef.current.startAudio().catch(() => {})
      }

      setAudioReady(context.state === 'running')
      participantGraphsRef.current.forEach((graph) => attachSpatialGraph(graph))
      scheduleSyncSpatialAudio()
      return context.state === 'running'
    } catch (error) {
      console.error('AudioContext resume blocked:', error)
      setAudioReady(false)
      return false
    }
  }, [attachSpatialGraph, scheduleSyncSpatialAudio])

  useEffect(() => {
    const nextMap = new Map<string, SpatialParticipantPosition>()
    spatialPositions.forEach((position) => {
      nextMap.set(position.id, position)
    })
    positionMapRef.current = nextMap
    scheduleSyncSpatialAudio()
  }, [spatialPositions, scheduleSyncSpatialAudio])

  useEffect(() => {
    scheduleSyncSpatialAudio()
  }, [isDeafened, scheduleSyncSpatialAudio])

  useEffect(() => {
    const tick = () => {
      // Reduce CPU load: analyser work + React state updates are expensive.
      // We only do heavy analyser reads at a fixed interval.
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const AUDIO_ANALYSER_INTERVAL_MS = 40
      if (now - lastAnalyserAtRef.current < AUDIO_ANALYSER_INTERVAL_MS) {
        analyserFrameRef.current = window.requestAnimationFrame(tick)
        return
      }
      lastAnalyserAtRef.current = now

      const nextLevels: Record<string, number> = {}

      participantGraphsRef.current.forEach((graph, participantId) => {
        if (!graph.analyserNode || !graph.dataArray) {
          nextLevels[participantId] = 0
          return
        }

        graph.analyserNode.getByteFrequencyData(graph.dataArray)
        let sum = 0
        for (let i = 0; i < graph.dataArray.length; i++) sum += graph.dataArray[i]
        const average = graph.dataArray.length ? sum / graph.dataArray.length : 0
        const normalized = clamp((average - 12) / 72, 0, 1)
        const previous = audioLevelsRef.current[participantId] ?? 0
        // Faster response than the previous smoothing (feels more "alive" in the nebula).
        nextLevels[participantId] = previous * 0.65 + normalized * 0.35
      })

      audioLevelsRef.current = nextLevels
      setAudioLevels(nextLevels)
      analyserFrameRef.current = window.requestAnimationFrame(tick)
    }

    analyserFrameRef.current = window.requestAnimationFrame(tick)
    return () => {
      if (analyserFrameRef.current !== null) {
        window.cancelAnimationFrame(analyserFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!enabled || !slug) return

    let cancelled = false

    const connect = async () => {
      setConnectionState('connecting')
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }

      try {
        // Ensure CSRF cookie/header path is warmed up for POST join/create calls.
        await fetchCsrf().catch(() => {})

        let joinPayload
        try {
          joinPayload = await joinSphere(slug)
        } catch (joinError) {
          const joinInfo = getApiErrorInfo(joinError)

          if (joinInfo.status === 404) {
            try {
              await createSphere(slug)
              joinPayload = await joinSphere(slug)
            } catch {
              throw joinError
            }
          } else if (joinInfo.status === 403) {
            // Direct entry to the room can miss CSRF initialization in some sessions.
            // Refresh once and retry before surfacing a hard 403.
            await fetchCsrf().catch(() => {})
            joinPayload = await joinSphere(slug)
          } else {
            throw joinError
          }
        }

        const { token, livekit_url, role: serverRole } = joinPayload
        if (cancelled) return

        setRole(serverRole)

        const room = new Room({
          audioCaptureDefaults: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          adaptiveStream: true,
        })

        room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
          const mapping: Record<ConnectionState, LiveKitConnectionState> = {
            [ConnectionState.Disconnected]: 'disconnected',
            [ConnectionState.Connecting]: 'connecting',
            [ConnectionState.Connected]: 'connected',
            [ConnectionState.Reconnecting]: 'reconnecting',
            [ConnectionState.SignalReconnecting]: 'reconnecting',
          }
          setConnectionState(mapping[state] ?? 'disconnected')
        })

        room.on(RoomEvent.ParticipantConnected, () => {
          setParticipantCount(room.numParticipants + 1)
        })

        room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
          setParticipantCount(room.numParticipants + 1)
          const graph = participantGraphsRef.current.get(participant.identity)
          if (graph) {
            graph.audioElement.remove()
            participantGraphsRef.current.delete(participant.identity)
            setAudioLevels((previous) => {
              const next = { ...previous }
              delete next[participant.identity]
              return next
            })
          }
        })

        room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
          const ids = speakers.map((speaker) => speaker.identity)
          onActiveSpeakersChanged?.(ids)
        })

        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack | undefined, _publication, participant: RemoteParticipant) => {
          if (!track || track.kind !== Track.Kind.Audio) return

          const existing = participantGraphsRef.current.get(participant.identity)
          if (existing) {
            existing.audioElement.remove()
            participantGraphsRef.current.delete(participant.identity)
          }

          const audioElement = document.createElement('audio')
          audioElement.id = `lk-audio-${participant.identity}`
          audioElement.autoplay = true
          audioElement.setAttribute('playsinline', 'true')
          audioElement.dataset.sphereAudio = 'true'
          audioElement.className = 'hidden'
          track.attach(audioElement)
          document.body.appendChild(audioElement)

          const graph: ParticipantAudioGraph = {
            participantId: participant.identity,
            audioElement,
          }

          participantGraphsRef.current.set(participant.identity, graph)
          if (audioContextRef.current) {
            attachSpatialGraph(graph)
          }
          scheduleSyncSpatialAudio()
        })

        room.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant: RemoteParticipant) => {
          if (track) {
            track.detach().forEach((element) => element.remove())
          }

          const graph = participantGraphsRef.current.get(participant.identity)
          if (graph) {
            graph.audioElement.remove()
            participantGraphsRef.current.delete(participant.identity)
            setAudioLevels((previous) => {
              const next = { ...previous }
              delete next[participant.identity]
              return next
            })
          }
        })

        const normalizedUrl = normalizeLiveKitUrl(livekit_url)
        await room.connect(normalizedUrl, token)
        if (cancelled) {
          room.disconnect()
          return
        }

        roomRef.current = room
        setConnectionState('connected')
        reconnectAttemptsRef.current = 0
        setParticipantCount(room.numParticipants + 1)
        setLastAudioError(null)
        await room.startAudio().catch(() => {})
        await ensureAudioReady()
      } catch (error) {
        console.error('LiveKit connection failed:', error)
        if (!cancelled) {
          setConnectionState('disconnected')

          const errorInfo = getApiErrorInfo(error)
          if (errorInfo.status && errorInfo.status >= 400 && errorInfo.status < 500) {
            setLastAudioError(errorInfo.message ?? 'This sphere is not ready for audio yet.')
            return
          }

          reconnectAttemptsRef.current += 1
          if (reconnectAttemptsRef.current > maxReconnectAttempts) {
            setLastAudioError('Voice transport unavailable. Please start LiveKit server and tap retry.')
            return
          }

          const delayMs = Math.min(3000 * Math.pow(2, reconnectAttemptsRef.current - 1), 30000)
          setLastAudioError(
            errorInfo.message ??
            `Voice transport unavailable. Retrying in ${Math.round(delayMs / 1000)}s...`,
          )
          reconnectTimeoutRef.current = window.setTimeout(() => {
            connect().catch(() => {})
          }, delayMs)
        }
      }
    }

    connect()

    return () => {
      cancelled = true
      if (roomRef.current) {
        roomRef.current.disconnect()
        roomRef.current = null
      }

      participantGraphsRef.current.forEach((graph) => {
        graph.audioElement.remove()
      })
      participantGraphsRef.current.clear()
      audioLevelsRef.current = {}
      setAudioLevels({})

      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {})
        audioContextRef.current = null
      }

      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }

      document.querySelectorAll('[data-sphere-audio="true"]').forEach((element) => element.remove())
      setAudioReady(false)
      setConnectionState('disconnected')
    }
  }, [slug, enabled, connectNonce, onActiveSpeakersChanged, ensureAudioReady, attachSpatialGraph, syncSpatialAudio])

  const toggleMic = useCallback(async () => {
    await ensureAudioReady()

    if (role === 'listener') {
      setLastAudioError('Raise your hand to get invited to speak.')
      return
    }

    if (isDeafened) {
      setLastAudioError('You are deafened. Undeafen to speak.')
      return
    }

    const room = roomRef.current
    if (!room || connectionState !== 'connected') {
      setLastAudioError('Audio room is still connecting.')
      return
    }

    setLastAudioError(null)

    if (!isMuted) {
      if (localTrackRef.current) {
        await room.localParticipant.unpublishTrack(localTrackRef.current)
        localTrackRef.current.stop()
        localTrackRef.current = null
      }
      setIsMuted(true)
      return
    }

    try {
      const tracks = await room.localParticipant.createTracks({ audio: true })
      const audioTrack = tracks.find((track) => track.kind === Track.Kind.Audio)
      if (audioTrack) {
        // Publish will fail here if the backend hasn't updated the LiveKit permissions yet.
        await room.localParticipant.publishTrack(audioTrack)
        localTrackRef.current = audioTrack
      }
      setIsMuted(false)
    } catch (error) {
      console.error('Mic access denied or publish failed:', error)
      setLastAudioError('Publish rejected. Waiting for server permission...')
      // If we failed to publish due to lingering listener permissions from LiveKit, reset.
      setIsMuted(true)
    }
  }, [connectionState, ensureAudioReady, isMuted, isDeafened, role])

  const toggleDeafen = useCallback(async () => {
    await ensureAudioReady()
    setIsDeafened((previous) => {
      const nextDeafened = !previous
      
      // If we are deafening, we should also mute the microphone
      if (nextDeafened && !isMuted) {
        if (localTrackRef.current) {
          const room = roomRef.current
          if (room) {
            room.localParticipant.unpublishTrack(localTrackRef.current).catch(console.error)
          }
          localTrackRef.current.stop()
          localTrackRef.current = null
        }
        setIsMuted(true)
      }
      
      return nextDeafened
    })
  }, [ensureAudioReady, isMuted])

  const retryConnection = useCallback(() => {
    setLastAudioError(null)
    setConnectionState('connecting')
    reconnectAttemptsRef.current = 0
    setConnectNonce((value) => value + 1)
  }, [])

  return {
    isMuted,
    toggleMic,
    isDeafened,
    toggleDeafen,
    connectionState,
    participantCount,
    role,
    audioLevels,
    ensureAudioReady,
    audioReady,
    spatialAudioAvailable: spatialAudioSupportedRef.current,
    canPublishAudio: role !== 'listener',
    lastAudioError,
    retryConnection,
  }
}
