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
import { joinSphere } from '../api'

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
}

const MIN_GAIN = 0.28
const MAX_GAIN = 1
const MAX_AUDIO_DISTANCE = 15
const X_SCALE = 0.18
const Z_SCALE = 0.22

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
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
        if (!graph.sourceNode) {
          graph.audioElement.volume = deafenedRef.current ? 0 : 1
        }
        return
      }

      const relativeX = (position.x - selfPosition.x) * X_SCALE
      const relativeZ = (position.y - selfPosition.y) * Z_SCALE
      const distance = Math.hypot(relativeX, relativeZ)
      const normalizedDistance = clamp(distance / MAX_AUDIO_DISTANCE, 0, 1)
      const gain = deafenedRef.current
        ? 0
        : MIN_GAIN + (MAX_GAIN - MIN_GAIN) * Math.pow(1 - normalizedDistance, 1.35)

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
      pannerNode.refDistance = 1.4
      pannerNode.maxDistance = 18
      pannerNode.rolloffFactor = 1.35
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

      syncSpatialAudio()
    } catch (error) {
      console.error('Could not create spatial audio graph:', error)
    }
  }, [syncSpatialAudio])

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
      setAudioReady(context.state === 'running')
      participantGraphsRef.current.forEach((graph) => attachSpatialGraph(graph))
      syncSpatialAudio()
      return context.state === 'running'
    } catch (error) {
      console.error('AudioContext resume blocked:', error)
      setAudioReady(false)
      return false
    }
  }, [attachSpatialGraph, syncSpatialAudio])

  useEffect(() => {
    const nextMap = new Map<string, SpatialParticipantPosition>()
    spatialPositions.forEach((position) => {
      nextMap.set(position.id, position)
    })
    positionMapRef.current = nextMap
    syncSpatialAudio()
  }, [spatialPositions, syncSpatialAudio])

  useEffect(() => {
    syncSpatialAudio()
  }, [isDeafened, syncSpatialAudio])

  useEffect(() => {
    const tick = () => {
      const nextLevels: Record<string, number> = {}

      participantGraphsRef.current.forEach((graph, participantId) => {
        if (!graph.analyserNode || !graph.dataArray) {
          nextLevels[participantId] = 0
          return
        }

        graph.analyserNode.getByteFrequencyData(graph.dataArray)
        const sum = graph.dataArray.reduce((total, value) => total + value, 0)
        const average = graph.dataArray.length ? sum / graph.dataArray.length : 0
        const normalized = clamp((average - 12) / 72, 0, 1)
        const previous = audioLevelsRef.current[participantId] ?? 0
        nextLevels[participantId] = previous * 0.72 + normalized * 0.28
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
        const { token, livekit_url, role: serverRole } = await joinSphere(slug)
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
          syncSpatialAudio()
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

        await room.connect(livekit_url, token)
        if (cancelled) {
          room.disconnect()
          return
        }

        roomRef.current = room
        setConnectionState('connected')
        setParticipantCount(room.numParticipants + 1)
        setLastAudioError(null)
        await ensureAudioReady()
      } catch (error) {
        console.error('LiveKit connection failed:', error)
        if (!cancelled) {
          setConnectionState('disconnected')
          setLastAudioError('Voice server unavailable. Retrying...')
          reconnectTimeoutRef.current = window.setTimeout(() => {
            connect().catch(() => {})
          }, 3000)
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
  }, [slug, enabled, onActiveSpeakersChanged, ensureAudioReady, attachSpatialGraph, syncSpatialAudio])

  const toggleMic = useCallback(async () => {
    await ensureAudioReady()

    if (role === 'listener') {
      setLastAudioError('Raise your hand to get invited to speak.')
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
        await room.localParticipant.publishTrack(audioTrack)
        localTrackRef.current = audioTrack
      }
      setIsMuted(false)
    } catch (error) {
      console.error('Mic access denied:', error)
      setLastAudioError('Could not access microphone.')
      alert('Could not access microphone.')
    }
  }, [connectionState, ensureAudioReady, isMuted, role])

  const toggleDeafen = useCallback(async () => {
    await ensureAudioReady()
    setIsDeafened((previous) => !previous)
  }, [ensureAudioReady])

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
  }
}
