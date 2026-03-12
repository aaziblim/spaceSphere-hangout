import { useState, useEffect } from 'react'
import { Link, useSearchParams, useLocation } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { useQuery } from '@tanstack/react-query'
import { fetchLivestreams, fetchUserStreak, fetchCommunityPulse, fetchMyCommunities, fetchTrendingPosts } from '../api'
import type { Community } from '../types'
import { useFollow } from '../hooks/useFollow'
import MilestoneToast, { MILESTONES, shouldShowMilestone, type Milestone } from './MilestoneToast'

// Types
interface SuggestedUser {
  id: number
  username: string
  first_name: string
  last_name: string
  profile_image: string | null
  followers_count: number
}

interface UserStats {
  username: string
  profile_image: string | null
  posts_count: number
  karma: number
  followers_count: number
  following_count: number
}

// API functions
async function fetchUserStats(): Promise<UserStats> {
  const res = await fetch('/api/stats/', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch stats')
  return res.json()
}

async function fetchSuggestions(): Promise<SuggestedUser[]> {
  const res = await fetch('/api/suggestions/', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch suggestions')
  return res.json()
}

// ==================== LEFT SIDEBAR ====================

export function LeftSidebar() {
  const { user } = useAuth()

  return (
    <aside className="hidden lg:block w-64 shrink-0 sticky top-20 h-[calc(100vh-5rem)] overflow-y-auto pb-8">
      <div className="space-y-4">
        {/* User Stats Card (when logged in) */}
        {user && <UserStatsCard />}

        {/* Quick Navigation */}
        <QuickNav />

        {/* Your Streak */}
        {user && <StreakCard />}

        {/* Communities */}
        {user && <CommunitiesNav />}

        {/* Community Pulse */}
        <CommunityPulse />
      </div>
    </aside>
  )
}

function UserStatsCard() {
  const { user } = useAuth()

  const { data: stats } = useQuery({
    queryKey: ['userStats'],
    queryFn: fetchUserStats,
    enabled: !!user,
    staleTime: 30000, // 30 seconds
  })

  if (!user) return null

  return (
    <div
      className="p-4 rounded-2xl"
      style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}
    >
      <Link to={`/user/${user.username}`} className="flex items-center gap-3 mb-4 group">
        <div className="w-12 h-12 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
          {(stats?.profile_image || user.profile?.image) ? (
            <img src={(stats?.profile_image || user.profile?.image)!} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: 'var(--accent)' }}>
              {user.username.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div>
          <p className="font-semibold text-sm group-hover:underline" style={{ color: 'var(--text-primary)' }}>
            {user.username}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            View profile →
          </p>
        </div>
      </Link>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 rounded-xl" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
          <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{stats?.posts_count ?? 0}</p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Posts</p>
        </div>
        <div className="p-2 rounded-xl" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
          <p className="text-lg font-bold" style={{ color: 'var(--success)' }}>{stats?.karma ?? 0}</p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Karma</p>
        </div>
        <div className="p-2 rounded-xl" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
          <p className="text-lg font-bold" style={{ color: 'var(--accent)' }}>{stats?.followers_count ?? 0}</p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Followers</p>
        </div>
      </div>
    </div>
  )
}

function QuickNav() {
  const [isExpanded, setIsExpanded] = useState(false)
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const currentTab = searchParams.get('tab') || 'foryou'
  const currentPath = location.pathname

  const allNavItems = [
    { icon: '🏠', label: 'Home', href: '/', isActive: currentPath === '/' && !searchParams.get('tab'), essential: true },
    { icon: '📺', label: 'Live', href: '/live', isActive: currentPath === '/live' || currentPath.startsWith('/live/'), essential: true },
    { icon: '🔍', label: 'Explore', href: '/explore', isActive: currentPath === '/explore', essential: true },
    { icon: '🔥', label: 'Hot', href: '/?tab=hot', isActive: currentTab === 'hot', essential: false },
    { icon: '✨', label: 'Fresh', href: '/?tab=fresh', isActive: currentTab === 'fresh', essential: false },
    { icon: '📝', label: 'Create Post', href: '/posts/new', isActive: currentPath === '/posts/new', essential: false },
  ]

  const visibleItems = isExpanded ? allNavItems : allNavItems.filter(item => item.essential)
  const hasInActiveMore = !isExpanded && allNavItems.some(item => !item.essential && item.isActive)

  return (
    <div
      className="p-3 rounded-2xl transition-all duration-300"
      style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}
    >
      <div className="flex items-center justify-between mb-2 px-2">
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
          Focus
        </p>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-[10px] font-bold uppercase tracking-tight hover:underline flex items-center gap-1 group"
          style={{ color: 'var(--accent)' }}
        >
          {isExpanded ? 'Less' : 'More'}
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}
            className={`w-2.5 h-2.5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      <div className="space-y-0.5">
        {visibleItems.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            className="flex items-center gap-3 px-3 py-2 rounded-xl transition-all hover:bg-[var(--bg-secondary)]"
            style={{
              backgroundColor: item.isActive ? 'var(--accent-alpha)' : 'transparent',
              color: item.isActive ? 'var(--accent)' : 'var(--text-primary)'
            }}
          >
            <span className="text-base">{item.icon}</span>
            <span className="text-sm font-medium">{item.label}</span>
            {item.isActive && (
              <span className="ml-auto w-1 h-1 rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
            )}
          </Link>
        ))}

        {!isExpanded && hasInActiveMore && (
          <div className="mt-1 pt-1 border-t border-[var(--border-light)]">
            <p className="text-[9px] font-bold text-center uppercase tracking-tighter" style={{ color: 'var(--accent)' }}>
              Active elsewhere
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function StreakCard() {
  const { user } = useAuth()
  const [activeMilestone, setActiveMilestone] = useState<Milestone | null>(null)

  const { data: streakData } = useQuery({
    queryKey: ['userStreak'],
    queryFn: fetchUserStreak,
    enabled: !!user,
    staleTime: 60000, // 1 minute
    refetchOnWindowFocus: true,
  })

  const currentStreak = streakData?.current_streak ?? 0

  // Check for milestone achievements
  useEffect(() => {
    if (currentStreak >= 7 && shouldShowMilestone('week_warrior')) {
      setActiveMilestone(MILESTONES.week_warrior)
    }
  }, [currentStreak])

  if (!user) return null

  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const days = streakData?.days ?? [false, false, false, false, false, false, false]

  return (
    <>
      {activeMilestone && (
        <MilestoneToast
          milestone={activeMilestone}
          onClose={() => setActiveMilestone(null)}
        />
      )}
      <div
        className="p-4 rounded-2xl"
        style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
            This Week
          </p>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--accent-alpha)', color: 'var(--accent)' }}>
            🔥 {currentStreak} day streak
          </span>
        </div>
        <div className="flex justify-between">
          {days.map((active, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${active ? 'scale-110' : ''}`}
                style={{
                  backgroundColor: active ? 'var(--accent)' : 'var(--bg-tertiary)',
                  color: active ? 'white' : 'var(--text-tertiary)'
                }}
              >
                {active ? '✓' : dayLabels[i]}
              </div>
              <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{dayLabels[i]}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function CommunityPulse() {
  const { data: pulseData } = useQuery({
    queryKey: ['communityPulse'],
    queryFn: fetchCommunityPulse,
    staleTime: 30000, // 30 seconds
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  })

  const pulse = pulseData?.pulse ?? 50

  const getMood = () => {
    if (pulse > 80) return { emoji: '🔥', text: 'On Fire!', color: 'var(--accent)' }
    if (pulse > 60) return { emoji: '✨', text: 'Vibing', color: 'var(--accent)' }
    if (pulse > 40) return { emoji: '😌', text: 'Chill', color: 'var(--accent-hover)' }
    return { emoji: '💤', text: 'Quiet', color: 'var(--text-tertiary)' }
  }

  const mood = getMood()

  return (
    <div
      className="p-4 rounded-2xl"
      style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}
    >
      <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)' }}>
        Community Pulse
      </p>
      <div className="flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-2xl animate-pulse"
          style={{ backgroundColor: mood.color + '20' }}
        >
          {mood.emoji}
        </div>
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold" style={{ color: mood.color }}>{Math.round(pulse)}%</span>
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{mood.text}</span>
          </div>
          <div className="mt-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{ width: `${pulse}%`, backgroundColor: mood.color }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ==================== RIGHT SIDEBAR ====================

export function RightSidebar() {
  return (
    <aside className="hidden xl:block w-72 shrink-0 sticky top-20 h-[calc(100vh-5rem)] overflow-y-auto pb-8">
      <div className="space-y-4">
        {/* Trending Topics */}
        <TrendingTopics />

        {/* Who to Follow */}
        <WhoToFollow />

        {/* Live Activity */}
        <LiveActivity />

        {/* Footer Links */}
        <FooterLinks />
      </div>
    </aside>
  )
}

function TrendingTopics() {
  const { data: trending, isLoading } = useQuery({
    queryKey: ['trending-posts'],
    queryFn: () => fetchTrendingPosts(5),
    staleTime: 60000,
  })

  return (
    <div
      className="p-4 rounded-2xl"
      style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
          Trending Now
        </p>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: 'var(--accent)' }} />
          <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: 'var(--accent)' }} />
        </span>
      </div>
      <div className="space-y-2">
        {isLoading ? (
          Array(3).fill(0).map((_, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
              <div className="w-full space-y-1">
                <div className="h-3 w-3/4 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }} />
                <div className="h-2 w-1/2 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }} />
              </div>
            </div>
          ))
        ) : trending && trending.results.length > 0 ? (
          trending.results.map((post) => (
            <Link
              key={post.public_id}
              to={`/post/${post.slug || post.public_id}`}
              className="flex items-center gap-2 p-2 rounded-xl transition-all hover:translate-x-1"
              style={{ backgroundColor: 'var(--bg-tertiary)' }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                  {post.title}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {post.author.username}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    ·
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {post.likes_count} ❤️ · {post.comments_count} 💬
                  </span>
                </div>
              </div>
              {(post.likes_count + post.comments_count) > 10 && <span className="text-xs">🔥</span>}
            </Link>
          ))
        ) : (
          <p className="text-xs text-center py-2" style={{ color: 'var(--text-tertiary)' }}>
            No trending posts yet
          </p>
        )}
      </div>
    </div>
  )
}

function WhoToFollow() {
  const { user } = useAuth()
  const { isFollowing, toggleFollow, isLoading: followLoading } = useFollow()

  const { data: suggestions, isLoading } = useQuery({
    queryKey: ['suggestions'],
    queryFn: fetchSuggestions,
    staleTime: 60000, // 1 minute
  })

  const colors = ['#FF6B35', '#A855F7', '#3B82F6', '#10B981', '#F59E0B']

  return (
    <div
      className="p-4 rounded-2xl"
      style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}
    >
      <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)' }}>
        Who to Follow
      </p>
      <div className="space-y-3">
        {isLoading ? (
          // Loading skeleton
          Array(3).fill(0).map((_, i) => (
            <div key={i} className="flex items-center justify-between animate-pulse">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
                <div className="space-y-1">
                  <div className="h-3 w-20 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
                  <div className="h-2 w-14 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
                </div>
              </div>
              <div className="h-6 w-14 rounded-full" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
            </div>
          ))
        ) : suggestions && suggestions.length > 0 ? (
          suggestions.map((suggestedUser, i) => {
            const following = isFollowing(suggestedUser.username)

            return (
              <div key={suggestedUser.username} className="flex items-center justify-between">
                <Link to={`/user/${suggestedUser.username}`} className="flex items-center gap-2 group">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold overflow-hidden"
                    style={{ backgroundColor: colors[i % colors.length] }}
                  >
                    {suggestedUser.profile_image ? (
                      <img src={suggestedUser.profile_image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      suggestedUser.username.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-medium group-hover:underline" style={{ color: 'var(--text-primary)' }}>
                        {suggestedUser.first_name || suggestedUser.username}
                      </span>
                    </div>
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      @{suggestedUser.username} · {suggestedUser.followers_count} followers
                    </span>
                  </div>
                </Link>
                {user && (
                  <button
                    onClick={() => toggleFollow(suggestedUser.username)}
                    disabled={followLoading}
                    className="px-3 py-1 rounded-full text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-50"
                    style={{
                      backgroundColor: following ? 'var(--bg-tertiary)' : 'var(--accent)',
                      color: following ? 'var(--text-primary)' : 'white'
                    }}
                  >
                    {following ? 'Following' : 'Follow'}
                  </button>
                )}
              </div>
            )
          })
        ) : (
          <p className="text-sm text-center py-2" style={{ color: 'var(--text-tertiary)' }}>
            No suggestions available
          </p>
        )}
      </div>
      {suggestions && suggestions.length > 0 && (
        <Link
          to="/explore"
          className="block w-full mt-3 py-2 text-sm font-medium rounded-xl transition-all text-center"
          style={{ color: 'var(--accent)', backgroundColor: 'var(--bg-tertiary)' }}
        >
          Show more
        </Link>
      )}
    </div>
  )
}

function LiveActivity() {
  const { data: liveStreams = [], isLoading } = useQuery({
    queryKey: ['liveStreams', 'sidebar'],
    queryFn: () => fetchLivestreams('live'),
    refetchInterval: 10000, // Refresh every 10 seconds
  })

  // Show top 3 live streams
  const displayStreams = liveStreams.slice(0, 3)

  return (
    <div
      className="p-4 rounded-2xl"
      style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
          Live Now
        </p>
        {displayStreams.length > 0 && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: 'var(--danger)' }} />
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: 'var(--danger)' }} />
          </span>
        )}
      </div>
      <div className="space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
          </div>
        ) : displayStreams.length > 0 ? (
          displayStreams.map((stream, i) => (
            <Link
              key={stream.id}
              to={`/live/${stream.id}`}
              className="flex items-center gap-3 py-2 px-3 rounded-xl transition-all hover:scale-[1.02]"
              style={{ backgroundColor: i === 0 ? 'var(--bg-tertiary)' : 'transparent' }}
            >
              <div className="relative">
                <img
                  src={stream.host.profile_image || '/default-avatar.png'}
                  alt={stream.host.username}
                  className="w-9 h-9 rounded-full object-cover"
                  style={{ border: '2px solid var(--danger)' }}
                />
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2" style={{ backgroundColor: 'var(--danger)', borderColor: 'var(--bg-primary)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  @{stream.host.username}
                </p>
                <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                  {stream.title}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs">👁</span>
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {stream.viewer_count}
                </span>
              </div>
            </Link>
          ))
        ) : (
          <div className="text-center py-3">
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              No live streams right now
            </p>
            <Link
              to="/live"
              className="text-xs font-medium mt-1 inline-block hover:underline"
              style={{ color: 'var(--accent)' }}
            >
              Be the first to go live →
            </Link>
          </div>
        )}
        {displayStreams.length > 0 && (
          <Link
            to="/live"
            className="block text-center text-xs font-medium pt-2 hover:underline"
            style={{ color: 'var(--accent)' }}
          >
            See all live streams →
          </Link>
        )}
      </div>
    </div>
  )
}

function FooterLinks() {
  return (
    <div className="px-2 text-center">
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        {['About', 'Terms', 'Privacy', 'Help'].map(link => (
          <Link
            key={link}
            to={link === 'About' ? '/about' : `/${link.toLowerCase()}`}
            className="text-xs transition-colors hover:underline"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {link}
          </Link>
        ))}
      </div>
      <p className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        © 2026 Sphere
      </p>
    </div>
  )
}

function CommunitiesNav() {
  const { user } = useAuth()
  const location = useLocation()
  const currentPath = location.pathname

  const { data: communities, isLoading } = useQuery({
    queryKey: ['myCommunities'],
    queryFn: fetchMyCommunities,
    enabled: !!user,
    staleTime: 60000,
  })

  if (!user) return null

  return (
    <div
      className="p-3 rounded-2xl"
      style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}
    >
      <div className="flex items-center justify-between mb-3 px-2">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
          Communities
        </p>
        <Link
          to="/communities/discover"
          className="text-[10px] font-bold uppercase tracking-tight hover:underline"
          style={{ color: 'var(--accent)' }}
        >
          Discover
        </Link>
      </div>

      <div className="space-y-1">
        {isLoading ? (
          <div className="p-4 text-center">
            <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
          </div>
        ) : communities && communities.length > 0 ? (
          communities.map((community: Community) => {
            const isActive = currentPath === `/c/${community.slug}`
            return (
              <Link
                key={community.id}
                to={`/c/${community.slug}`}
                className="flex items-center gap-3 px-3 py-2 rounded-xl transition-all hover:translate-x-1"
                style={{
                  backgroundColor: isActive ? 'var(--bg-tertiary)' : 'transparent',
                  color: isActive ? 'var(--accent)' : 'var(--text-primary)'
                }}
              >
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold overflow-hidden shrink-0"
                  style={{ backgroundColor: 'var(--bg-tertiary)' }}
                >
                  {community.icon_url ? (
                    <img src={community.icon_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span>{community.name.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <span className="text-sm font-medium truncate">{community.name}</span>
                {isActive && (
                  <span className="ml-auto w-1 h-1 rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
                )}
              </Link>
            )
          })
        ) : (
          <div className="px-2 py-3 text-center rounded-xl bg-opacity-50" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
            <p className="text-[10px] uppercase font-bold tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>
              No communities yet
            </p>
            <Link
              to="/communities/discover"
              className="inline-block px-3 py-1.5 rounded-lg text-xs font-bold border transition-all hover:scale-105"
              style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
            >
              Start Exploring
            </Link>
          </div>
        )}
      </div>

      <Link
        to="/communities/new"
        className="flex items-center gap-3 px-3 py-2 mt-2 rounded-xl border border-dashed transition-all hover:border-solid group"
        style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
      >
        <span className="text-lg group-hover:scale-110 transition-transform">⊕</span>
        <span className="text-xs font-semibold">Create Community</span>
      </Link>
    </div>
  )
}
