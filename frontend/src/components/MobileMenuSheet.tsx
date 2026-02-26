import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { useQuery } from '@tanstack/react-query'
import { fetchLivestreams, fetchMyCommunities, fetchTrendingPosts } from '../api'
import { useFollow } from '../hooks/useFollow'
import type { Community } from '../types'

interface MobileMenuSheetProps {
  open: boolean
  onClose: () => void
}

interface UserStats {
  username: string
  profile_image: string | null
  posts_count: number
  karma: number
  followers_count: number
  following_count: number
}

interface SuggestedUser {
  id: number
  username: string
  first_name: string
  last_name: string
  profile_image: string | null
  followers_count: number
}

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

export default function MobileMenuSheet({ open, onClose }: MobileMenuSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  const handleNavigate = (href: string) => {
    navigate(href)
    onClose()
  }

  const handleLogout = async () => {
    await logout()
    onClose()
    navigate('/')
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm lg:hidden animate-fadeIn"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="fixed bottom-0 left-0 right-0 z-[70] lg:hidden rounded-t-2xl overflow-hidden animate-slideUp"
        style={{
          backgroundColor: 'var(--bg-primary)',
          maxHeight: '85vh',
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2 sticky top-0 z-10" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <div className="w-9 h-1 rounded-full" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(85vh - 28px)' }}>

          {/* User Section (if logged in) */}
          {user && (
            <div className="px-5 pb-4">
              <button
                onClick={() => handleNavigate(`/user/${user.username}`)}
                className="w-full flex items-center gap-3 p-3 rounded-2xl transition-colors active:bg-[var(--bg-tertiary)]"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-semibold overflow-hidden"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  {user.profile?.image ? (
                    <img src={user.profile.image} alt="" className="w-full h-full object-cover" />
                  ) : (
                    user.username.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {user.first_name || user.username}
                  </p>
                  <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>View your profile</p>
                </div>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }}>
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </div>
          )}

          {/* Menu Items */}
          <div className="px-5 pb-6">
            {/* Primary Actions */}
            <div className="rounded-2xl overflow-hidden mb-4" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <MenuItem
                icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>}
                label="Home"
                isActive={location.pathname === '/'}
                onClick={() => handleNavigate('/')}
              />
              <MenuItem
                icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>}
                label="Explore"
                isActive={location.pathname === '/explore'}
                onClick={() => handleNavigate('/explore')}
              />
              <MenuItem
                icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" /></svg>}
                label="Live"
                isActive={location.pathname.startsWith('/live')}
                onClick={() => handleNavigate('/live')}
                badge="LIVE"
                badgeColor="#FF3B30"
              />
            </div>

            {/* Secondary Actions */}
            <div className="rounded-2xl overflow-hidden mb-4" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              {user && (
                <>
                  <MenuItem
                    icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>}
                    label="Saved Posts"
                    onClick={() => handleNavigate('/?tab=saved')}
                  />
                  <MenuItem
                    icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><path d="M3 3v18h18" /><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" /></svg>}
                    label="Creator Dashboard"
                    onClick={() => handleNavigate('/dashboard')}
                  />
                  <MenuItem
                    icon={<svg viewBox="0 0 22 22" className="w-5 h-5"><path fill="#1DA1F2" d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681.132-.637.075-1.299-.165-1.903.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" /></svg>}
                    label="Get Verified"
                    onClick={() => handleNavigate('/get-verified')}
                    badge="NEW"
                    badgeColor="#1DA1F2"
                  />
                </>
              )}
              <MenuItem
                icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>}
                label="Settings"
                onClick={() => handleNavigate('/settings')}
              />
              <MenuItem
                icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>}
                label="About"
                onClick={() => handleNavigate('/about')}
                isLast
              />
            </div>

            {/* Communities Section */}
            {user && <CommunitiesSection onNavigate={handleNavigate} currentPath={location.pathname} />}

            {/* Auth Actions */}
            {user ? (
              <button
                onClick={handleLogout}
                className="w-full py-3.5 rounded-2xl text-center font-medium transition-colors active:opacity-80"
                style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--danger)' }}
              >
                Sign Out
              </button>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={() => handleNavigate('/login')}
                  className="flex-1 py-3.5 rounded-2xl text-center font-medium transition-colors active:opacity-80"
                  style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                >
                  Sign In
                </button>
                <button
                  onClick={() => handleNavigate('/register')}
                  className="flex-1 py-3.5 rounded-2xl text-center font-medium text-white transition-colors active:opacity-80"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  Sign Up
                </button>
              </div>
            )}
          </div>
        </div>

        <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
        .animate-slideUp { animation: slideUp 0.3s cubic-bezier(0.32, 0.72, 0, 1); }
      `}</style>
      </div>
    </>
  )
}

// Communities section for mobile
function CommunitiesSection({ onNavigate, currentPath }: { onNavigate: (href: string) => void; currentPath: string }) {
  const { user } = useAuth()
  const [isExpanded, setIsExpanded] = useState(true)

  const { data: communities, isLoading } = useQuery({
    queryKey: ['myCommunities'],
    queryFn: fetchMyCommunities,
    enabled: !!user,
    staleTime: 60000,
  })

  if (!user) return null

  return (
    <div className="rounded-2xl overflow-hidden mb-4" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3.5"
        style={{ borderBottom: isExpanded ? '0.5px solid var(--border-light)' : 'none' }}
      >
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5" style={{ color: 'var(--text-secondary)' }}>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Communities</span>
        </div>
        <svg
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
          className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          style={{ color: 'var(--text-tertiary)' }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-2 pb-2">
          {isLoading ? (
            <div className="py-4 flex justify-center">
              <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
            </div>
          ) : communities && communities.length > 0 ? (
            <div className="space-y-1 py-2">
              {communities.slice(0, 5).map((community: Community) => {
                const isActive = currentPath === `/c/${community.slug}`
                return (
                  <button
                    key={community.id}
                    onClick={() => onNavigate(`/c/${community.slug}`)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors active:bg-[var(--bg-tertiary)]"
                    style={{
                      backgroundColor: isActive ? 'var(--accent-alpha)' : 'transparent',
                      color: isActive ? 'var(--accent)' : 'var(--text-primary)'
                    }}
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold overflow-hidden shrink-0"
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
                      <span className="ml-auto w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
                    )}
                  </button>
                )
              })}
              {communities.length > 5 && (
                <button
                  onClick={() => onNavigate('/communities/discover')}
                  className="w-full text-center py-2 text-xs font-medium"
                  style={{ color: 'var(--accent)' }}
                >
                  +{communities.length - 5} more
                </button>
              )}
            </div>
          ) : (
            <div className="py-4 text-center">
              <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>No communities yet</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-2" style={{ borderTop: '0.5px solid var(--border-light)' }}>
            <button
              onClick={() => onNavigate('/communities/discover')}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-colors active:opacity-80"
              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--accent)' }}
            >
              🔍 Discover
            </button>
            <button
              onClick={() => onNavigate('/communities/new')}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-colors active:opacity-80"
              style={{ backgroundColor: 'var(--accent)', color: 'white' }}
            >
              ⊕ Create
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Clean menu item component
function MenuItem({
  icon,
  label,
  isActive,
  onClick,
  badge,
  badgeColor,
  isLast
}: {
  icon: React.ReactNode
  label: string
  isActive?: boolean
  onClick: () => void
  badge?: string
  badgeColor?: string
  isLast?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-[var(--bg-tertiary)]"
      style={{
        color: isActive ? 'var(--accent)' : 'var(--text-primary)',
        borderBottom: isLast ? 'none' : '0.5px solid var(--border-light)'
      }}
    >
      <span style={{ color: isActive ? 'var(--accent)' : 'var(--text-secondary)' }}>
        {icon}
      </span>
      <span className="flex-1 text-left font-medium">{label}</span>
      {badge && (
        <span
          className="px-2 py-0.5 rounded text-[10px] font-bold text-white"
          style={{ backgroundColor: badgeColor }}
        >
          {badge}
        </span>
      )}
      {isActive && (
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
      )}
    </button>
  )
}

// Keep these helper functions for potential future use but not in the menu
function QuickAccessContent({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const currentTab = searchParams.get('tab') || 'foryou'
  const currentPath = location.pathname

  const { data: stats } = useQuery({
    queryKey: ['userStats'],
    queryFn: fetchUserStats,
    enabled: !!user,
    staleTime: 30000,
  })

  const navItems = [
    { icon: '🏠', label: 'Home', href: '/', isActive: currentPath === '/' && !searchParams.get('tab') },
    { icon: '🔥', label: 'Hot Posts', href: '/?tab=hot', isActive: currentTab === 'hot' },
    { icon: '✨', label: 'Fresh Posts', href: '/?tab=fresh', isActive: currentTab === 'fresh' },
    { icon: '📺', label: 'Go Live', href: '/live', isActive: currentPath === '/live' },
    { icon: '🔍', label: 'Explore', href: '/explore', isActive: currentPath === '/explore' },
    { icon: '📝', label: 'Create Post', href: '/posts/new', isActive: currentPath === '/posts/new' },
    { icon: '👤', label: 'My Profile', href: user ? `/user/${user.username}` : '/login', isActive: false },
    { icon: '⚙️', label: 'Settings', href: '/settings', isActive: currentPath === '/settings' },
    { icon: 'ℹ️', label: 'About', href: '/about', isActive: currentPath === '/about' },
  ]

  const handleClick = (href: string) => {
    navigate(href)
    onClose()
  }

  return (
    <div className="space-y-4">
      {/* User Stats (if logged in) */}
      {user && stats && (
        <div
          className="p-4 rounded-2xl"
          style={{ backgroundColor: 'var(--bg-tertiary)' }}
        >
          <Link to={`/user/${user.username}`} onClick={onClose} className="flex items-center gap-3 mb-4">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold overflow-hidden"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              {stats.profile_image ? (
                <img src={stats.profile_image} alt="" className="w-full h-full object-cover" />
              ) : (
                user.username.charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{user.username}</p>
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>View profile</p>
            </div>
          </Link>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--bg-primary)' }}>
              <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{stats.posts_count}</p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Posts</p>
            </div>
            <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--bg-primary)' }}>
              <p className="text-xl font-bold" style={{ color: 'var(--success)' }}>{stats.karma}</p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Karma</p>
            </div>
            <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--bg-primary)' }}>
              <p className="text-xl font-bold" style={{ color: 'var(--accent)' }}>{stats.followers_count}</p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Followers</p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Links */}
      <div className="space-y-1">
        {navItems.map((item) => (
          <button
            key={item.href}
            onClick={() => handleClick(item.href)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all active:scale-[0.98]"
            style={{
              backgroundColor: item.isActive ? 'var(--accent-alpha)' : 'transparent',
              color: item.isActive ? 'var(--accent)' : 'var(--text-primary)'
            }}
          >
            <span className="text-xl">{item.icon}</span>
            <span className="font-medium">{item.label}</span>
            {item.isActive && (
              <span className="ml-auto w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

function TrendingContent({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()

  const { data: trending, isLoading } = useQuery({
    queryKey: ['trending-posts'],
    queryFn: () => fetchTrendingPosts(8),
    staleTime: 60000,
  })

  const handleClick = (slug: string, publicId: string) => {
    navigate(`/post/${slug || publicId}`)
    onClose()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-sm px-1 mb-3" style={{ color: 'var(--text-tertiary)' }}>
        See what's trending right now
      </p>
      {trending && trending.results.length > 0 ? (
        trending.results.map((post) => (
          <button
            key={post.public_id}
            onClick={() => handleClick(post.slug, post.public_id)}
            className="w-full flex items-center justify-between p-4 rounded-xl transition-all active:scale-[0.98]"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>📈</span>
              <div className="text-left">
                <p className="font-semibold truncate max-w-[200px]" style={{ color: 'var(--text-primary)' }}>{post.title}</p>
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  {post.author.username} · {post.likes_count} ❤️ · {post.comments_count} 💬
                </p>
              </div>
            </div>
            {(post.likes_count + post.comments_count) > 10 && (
              <span className="px-2 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: '#FF6B3520', color: '#FF6B35' }}>
                🔥 Hot
              </span>
            )}
          </button>
        ))
      ) : (
        <p className="text-sm text-center py-8" style={{ color: 'var(--text-tertiary)' }}>
          No trending posts yet
        </p>
      )}
    </div>
  )
}

function PeopleContent({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { isFollowing, toggleFollow, isLoading: followLoading } = useFollow()

  const { data: suggestions, isLoading } = useQuery({
    queryKey: ['suggestions'],
    queryFn: fetchSuggestions,
    staleTime: 60000,
  })

  const colors = ['#FF6B35', '#A855F7', '#3B82F6', '#10B981', '#F59E0B']

  const handleProfileClick = (username: string) => {
    navigate(`/user/${username}`)
    onClose()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm px-1 mb-3" style={{ color: 'var(--text-tertiary)' }}>
        People you might want to follow
      </p>
      {suggestions && suggestions.length > 0 ? (
        suggestions.map((s, i) => {
          const following = isFollowing(s.username)

          return (
            <div
              key={s.username}
              className="flex items-center justify-between p-3 rounded-xl"
              style={{ backgroundColor: 'var(--bg-tertiary)' }}
            >
              <button
                onClick={() => handleProfileClick(s.username)}
                className="flex items-center gap-3 text-left"
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold overflow-hidden"
                  style={{ backgroundColor: colors[i % colors.length] }}
                >
                  {s.profile_image ? (
                    <img src={s.profile_image} alt="" className="w-full h-full object-cover" />
                  ) : (
                    s.username.charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {s.first_name || s.username}
                  </p>
                  <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                    @{s.username} · {s.followers_count} followers
                  </p>
                </div>
              </button>
              {user && (
                <button
                  onClick={() => toggleFollow(s.username)}
                  disabled={followLoading}
                  className="px-4 py-2 rounded-full text-sm font-semibold transition-all"
                  style={{
                    backgroundColor: following ? 'var(--bg-primary)' : 'var(--accent)',
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
        <p className="text-center py-8" style={{ color: 'var(--text-tertiary)' }}>
          No suggestions available
        </p>
      )}

      <button
        onClick={() => { navigate('/explore'); onClose() }}
        className="w-full py-3 rounded-xl text-sm font-semibold"
        style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--accent)' }}
      >
        Discover more people →
      </button>
    </div>
  )
}

function LiveContent({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()

  const { data: liveStreams = [], isLoading } = useQuery({
    queryKey: ['liveStreams', 'mobile-menu'],
    queryFn: () => fetchLivestreams('live'),
    refetchInterval: 10000,
  })

  const handleStreamClick = (id: number) => {
    navigate(`/live/${id}`)
    onClose()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {liveStreams.length > 0 ? (
        <>
          <p className="text-sm px-1 mb-3" style={{ color: 'var(--text-tertiary)' }}>
            {liveStreams.length} live now
          </p>
          {liveStreams.map(stream => (
            <button
              key={stream.id}
              onClick={() => handleStreamClick(Number(stream.id))}
              className="w-full flex items-center gap-3 p-3 rounded-xl transition-all active:scale-[0.98] text-left"
              style={{ backgroundColor: 'var(--bg-tertiary)' }}
            >
              <div className="relative">
                <img
                  src={stream.host.profile_image || '/default-avatar.png'}
                  alt={stream.host.username}
                  className="w-12 h-12 rounded-full object-cover"
                  style={{ border: '3px solid #FF3B30' }}
                />
                <span className="absolute -bottom-1 -right-1 px-1.5 py-0.5 text-[10px] font-bold rounded text-white" style={{ backgroundColor: '#FF3B30' }}>
                  LIVE
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                  {stream.title}
                </p>
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  @{stream.host.username}
                </p>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--bg-primary)' }}>
                <span className="text-sm">👁</span>
                <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {stream.viewer_count}
                </span>
              </div>
            </button>
          ))}
        </>
      ) : (
        <div className="text-center py-8">
          <p className="text-4xl mb-3">📺</p>
          <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No live streams</p>
          <p className="text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>Be the first to go live!</p>
        </div>
      )}

      <button
        onClick={() => { navigate('/live'); onClose() }}
        className="w-full py-3 rounded-xl text-sm font-semibold text-white"
        style={{ backgroundColor: '#FF3B30' }}
      >
        🎬 Go to Live page
      </button>
    </div>
  )
}
