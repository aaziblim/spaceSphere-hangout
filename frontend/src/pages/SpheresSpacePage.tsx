import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchMyCommunities, fetchSphereStatus } from '../api'
import { useAuth } from '../AuthContext'
import type { Community, SphereStatus } from '../types'

type LiveSphereRow = {
  community: Community
  status: SphereStatus
}

async function fetchMyLiveSpheres(): Promise<LiveSphereRow[]> {
  const communities = await fetchMyCommunities()

  // Prevent a potentially large N+1 burst. We can expand later if needed.
  const candidates = communities.slice(0, 12)

  const settled = await Promise.allSettled(
    candidates.map(async (community) => {
      const status = await fetchSphereStatus(community.slug)
      if (!status?.is_live) return null
      return { community, status }
    }),
  )

  return settled
    .map((r) => (r.status === 'fulfilled' ? r.value : null))
    .filter(Boolean) as LiveSphereRow[]
}

export default function SpheresSpacePage() {
  const { user } = useAuth()

  const {
    data: liveSpheres = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['my-live-spheres'],
    queryFn: fetchMyLiveSpheres,
    enabled: !!user,
    staleTime: 30_000,
  })

  const sortedLiveSpheres = useMemo(() => {
    return [...liveSpheres].sort((a, b) => (b.status.participant_count ?? 0) - (a.status.participant_count ?? 0))
  }, [liveSpheres])

  if (!user) {
    return (
      <div className="w-full max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
          Spheres
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          Sign in to enter spatial audio rooms.
        </p>
        <Link to="/login" className="px-5 py-2.5 rounded-full text-white font-semibold" style={{ backgroundColor: 'var(--accent)' }}>
          Log in
        </Link>
      </div>
    )
  }

  return (
    <div className="w-full max-w-3xl mx-auto p-6">
      <div
        className="rounded-3xl p-6 mb-6"
        style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--gradient-stream)' }}
          >
            <img src="/spheres-audio-icon.svg" alt="" className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Spheres
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Your audio world: position-based spatial listening.
            </p>
          </div>
        </div>
        <div className="text-xs mt-3" style={{ color: 'var(--text-tertiary)' }}>
          Tip: Enter a live sphere, then tap your orb to activate audio.
        </div>
      </div>

      {isError && (
        <div className="mb-4 rounded-2xl p-4" style={{ backgroundColor: 'var(--danger-alpha)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>
            Could not load your live spheres.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
          >
            Retry
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="rounded-3xl p-6" style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Loading live spheres...
          </p>
        </div>
      ) : sortedLiveSpheres.length === 0 ? (
        <div className="rounded-3xl p-6" style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}>
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
              <span className="text-2xl" aria-hidden>
                🎧
              </span>
            </div>
            <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
              No live spheres in your communities
            </h2>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              Join more communities to find live audio spaces.
            </p>
            <Link
              to="/communities/discover"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-white font-semibold"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              Discover Communities
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedLiveSpheres.map(({ community, status }) => (
            <div
              key={community.slug}
              className="rounded-3xl overflow-hidden"
              style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}
            >
              <div className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'var(--gradient-community)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-on-accent)" strokeWidth={2} className="w-5 h-5">
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="4" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold" style={{ color: 'var(--text-primary)' }}>
                      {community.name}
                    </p>
                    {status.conductor ? (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--accent-alpha)', color: 'var(--accent)' }}>
                        Hosted by {status.conductor.username}
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                        Live now
                      </span>
                    )}
                  </div>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                    {status.participant_count ?? 0} listening
                  </p>
                </div>
                <Link
                  to={`/spheres/${community.slug}`}
                  className="px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all active:scale-[0.98]"
                  style={{ background: 'var(--gradient-stream)', color: 'var(--text-on-accent)' }}
                >
                  Enter Spheres
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

