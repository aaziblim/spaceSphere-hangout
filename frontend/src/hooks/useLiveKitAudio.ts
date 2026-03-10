import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Room,
  RoomEvent,
  ConnectionState,
  Track,
  type LocalTrack,
  type RemoteTrackPublication,
  type Participant,
  type RemoteParticipant,
} from 'livekit-client'
import { joinSphere } from '../api'

type LiveKitConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

interface UseLiveKitAudioOptions {
  slug: string
  enabled: boolean
  onActiveSpeakersChanged?: (speakerIds: string[]) => void
}

interface UseLiveKitAudioReturn {
  isMuted: boolean
  toggleMic: () => Promise<void>
  isDeafened: boolean
  toggleDeafen: () => void
  connectionState: LiveKitConnectionState
  participantCount: number
  role: 'conductor' | 'speaker' | 'listener'
}

export function useLiveKitAudio({
  slug,
  enabled,
  onActiveSpeakersChanged,
}: UseLiveKitAudioOptions): UseLiveKitAudioReturn {
  const [isMuted, setIsMuted] = useState(true)
  const [isDeafened, setIsDeafened] = useState(false)
  const [connectionState, setConnectionState] = useState<LiveKitConnectionState>('disconnected')
  const [participantCount, setParticipantCount] = useState(0)
  const [role, setRole] = useState<'conductor' | 'speaker' | 'listener'>('listener')

  const roomRef = useRef<Room | null>(null)
  const localTrackRef = useRef<LocalTrack | null>(null)
  const deafenedRef = useRef(false)

  // Keep ref in sync with state for event callbacks
  deafenedRef.current = isDeafened

  // --- Connect to LiveKit Room ---
  useEffect(() => {
    if (!enabled || !slug) return

    let cancelled = false

    const connect = async () => {
      setConnectionState('connecting')

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

        // --- Event listeners ---
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
          setParticipantCount(room.numParticipants + 1) // +1 for local
        })

        room.on(RoomEvent.ParticipantDisconnected, () => {
          setParticipantCount(room.numParticipants + 1)
        })

        room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
          const ids = speakers.map((s) => s.identity)
          onActiveSpeakersChanged?.(ids)
        })

        // Handle remote audio tracks — attach/detach based on deafen
        room.on(
          RoomEvent.TrackSubscribed,
          (track: RemoteTrackPublication['track'], _pub: RemoteTrackPublication, _participant: RemoteParticipant) => {
            if (track && track.kind === Track.Kind.Audio) {
              const el = track.attach()
              el.id = `lk-audio-${_participant.identity}`
              el.volume = deafenedRef.current ? 0 : 1
              document.body.appendChild(el)
            }
          },
        )

        room.on(RoomEvent.TrackUnsubscribed, (track) => {
          if (track) track.detach().forEach((el) => el.remove())
        })

        // Connect
        await room.connect(livekit_url, token)

        if (cancelled) {
          room.disconnect()
          return
        }

        roomRef.current = room
        setConnectionState('connected')
        setParticipantCount(room.numParticipants + 1)
      } catch (err) {
        console.error('LiveKit connection failed:', err)
        if (!cancelled) setConnectionState('disconnected')
      }
    }

    connect()

    return () => {
      cancelled = true
      if (roomRef.current) {
        roomRef.current.disconnect()
        roomRef.current = null
      }
      // Clean up any audio elements we attached
      document.querySelectorAll('[id^="lk-audio-"]').forEach((el) => el.remove())
      setConnectionState('disconnected')
    }
  }, [slug, enabled])

  // --- Mic toggle ---
  const toggleMic = useCallback(async () => {
    const room = roomRef.current
    if (!room || connectionState !== 'connected') return

    if (!isMuted) {
      // Mute: unpublish local audio track
      if (localTrackRef.current) {
        await room.localParticipant.unpublishTrack(localTrackRef.current)
        localTrackRef.current.stop()
        localTrackRef.current = null
      }
      setIsMuted(true)
    } else {
      // Unmute: capture and publish mic
      try {
        const tracks = await room.localParticipant.createTracks({ audio: true })
        const audioTrack = tracks.find((t) => t.kind === Track.Kind.Audio)
        if (audioTrack) {
          await room.localParticipant.publishTrack(audioTrack)
          localTrackRef.current = audioTrack
        }
        setIsMuted(false)
      } catch (err) {
        console.error('Mic access denied:', err)
        alert('Could not access microphone.')
      }
    }
  }, [isMuted, connectionState])

  // --- Deafen toggle ---
  const toggleDeafen = useCallback(() => {
    setIsDeafened((prev) => {
      const next = !prev
      // Set volume on all remote audio elements
      document.querySelectorAll<HTMLAudioElement>('[id^="lk-audio-"]').forEach((el) => {
        el.volume = next ? 0 : 1
      })
      return next
    })
  }, [])

  return {
    isMuted,
    toggleMic,
    isDeafened,
    toggleDeafen,
    connectionState,
    participantCount,
    role,
  }
}
