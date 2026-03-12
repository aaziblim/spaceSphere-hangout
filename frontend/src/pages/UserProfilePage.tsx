import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchUserProfile } from '../api'
import { useAuth } from '../AuthContext'
import { useFollow } from '../hooks/useFollow'
import { MessageButton, ChatDrawer } from '../components/Chat'
import VerifiedBadge from '../components/VerifiedBadge'
import UserActionMenu from '../components/UserActionMenu'

export default function UserProfilePage() {
  const { username } = useParams<{ username: string }>()
  const { user: currentUser } = useAuth()
  const { isFollowing, toggleFollow, isLoading: followLoading } = useFollow()
  const [chatOpen, setChatOpen] = useState(false)

  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ['userProfile', username],
    queryFn: () => fetchUserProfile(username!),
    enabled: !!username,
  })

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4">
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}>
          <div className="p-6">
            <div className="flex items-center gap-5 mb-6">
              <div className="w-20 h-20 rounded-full skeleton" />
              <div className="flex-1 space-y-2">
                <div className="h-6 w-32 skeleton rounded" />
                <div className="h-4 w-24 skeleton rounded" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-4 w-full skeleton rounded" />
              <div className="h-4 w-3/4 skeleton rounded" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (isError || !profile) {
    return (
      <div className="max-w-2xl mx-auto px-4">
        <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}>
          <div className="w-14 h-14 mx-auto mb-3 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7" style={{ color: 'var(--danger)' }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>User not found</h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>This profile doesn't exist or has been removed</p>
        </div>
      </div>
    )
  }

  const isOwnProfile = currentUser?.username === username
  const isCurrentlyFollowing = username ? isFollowing(username) : false

  // Check verification - from API or localStorage if viewing own profile
  const isProfileVerified = profile.is_verified || (isOwnProfile && (() => {
    try {
      const status = localStorage.getItem('verificationStatus')
      return status ? JSON.parse(status).isVerified : false
    } catch {
      return false
    }
  })())

  return (
    <div className="max-w-2xl mx-auto px-4">
      {/* Profile Card */}
      <div className="rounded-2xl overflow-hidden mb-6" style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}>
        <div className="p-6">
          {/* Header - Mobile-friendly stacked layout */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-5">
            {/* Avatar */}
            <div className="flex items-center gap-4 sm:block">
              <div
                className="w-20 h-20 sm:w-20 sm:h-20 rounded-full overflow-hidden flex-shrink-0"
                style={{ backgroundColor: 'var(--bg-tertiary)' }}
              >
                {profile.profile_image ? (
                  <img src={profile.profile_image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-white text-2xl font-semibold"
                    style={{ backgroundColor: 'var(--accent)' }}
                  >
                    {profile.username.slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>

              {/* Name - Shows next to avatar on mobile */}
              <div className="sm:hidden">
                <h1 className="text-xl font-bold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                  {profile.first_name || profile.username}
                  {isProfileVerified && <VerifiedBadge size="md" />}
                </h1>
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>@{profile.username}</p>
              </div>
            </div>

            {/* Info - Desktop */}
            <div className="flex-1 min-w-0 hidden sm:block">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <h1 className="text-xl font-bold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                    {profile.first_name || profile.username}
                    {isProfileVerified && <VerifiedBadge size="md" />}
                  </h1>
                  <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>@{profile.username}</p>
                </div>

                {isOwnProfile ? (
                  <Link
                    to="/profile"
                    className="px-4 py-2 text-sm font-medium rounded-full border transition-colors hover:bg-[var(--bg-tertiary)]"
                    style={{
                      borderColor: 'var(--border)',
                      color: 'var(--text-primary)',
                      backgroundColor: 'transparent'
                    }}
                  >
                    Edit Profile
                  </Link>
                ) : currentUser ? (
                  <div className="flex items-center gap-2">
                    <MessageButton
                      targetUser={{
                        id: profile.id ?? 0,
                        username: profile.username,
                        first_name: profile.first_name,
                        profile_image: profile.profile_image,
                      }}
                      isFollowing={isCurrentlyFollowing}
                      onOpenChat={() => setChatOpen(true)}
                    />
                    <button
                      onClick={() => username && toggleFollow(username)}
                      disabled={followLoading}
                      className="px-5 py-2 text-sm font-medium rounded-full transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
                      style={{
                        backgroundColor: isCurrentlyFollowing ? 'var(--bg-tertiary)' : 'var(--accent)',
                        color: isCurrentlyFollowing ? 'var(--text-primary)' : 'white'
                      }}
                    >
                      {followLoading ? '...' : isCurrentlyFollowing ? 'Following' : 'Follow'}
                    </button>
                    <UserActionMenu
                      username={profile.username}
                      currentUsername={currentUser.username}
                      contentType="user"
                      targetId={{ username: profile.username }}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Action Buttons - Mobile (full width, clean) */}
          <div className="sm:hidden mb-5">
            {isOwnProfile ? (
              <Link
                to="/profile"
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border transition-colors active:scale-[0.98]"
                style={{
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                  backgroundColor: 'var(--bg-tertiary)'
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Edit Profile
              </Link>
            ) : currentUser ? (
              <div className="flex gap-3">
                <button
                  onClick={() => username && toggleFollow(username)}
                  disabled={followLoading}
                  className="flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all active:scale-[0.98] disabled:opacity-50"
                  style={{
                    backgroundColor: isCurrentlyFollowing ? 'var(--bg-tertiary)' : 'var(--accent)',
                    color: isCurrentlyFollowing ? 'var(--text-primary)' : 'white'
                  }}
                >
                  {followLoading ? '...' : isCurrentlyFollowing ? 'Following' : 'Follow'}
                </button>
                <button
                  onClick={() => setChatOpen(true)}
                  aria-label="Send message"
                  className="px-5 py-2.5 rounded-xl transition-all active:scale-[0.98]"
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)'
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </button>
                <UserActionMenu
                  username={profile.username}
                  currentUsername={currentUser.username}
                  contentType="user"
                  targetId={{ username: profile.username }}
                />
              </div>
            ) : null}
          </div>

          {/* Bio */}
          {profile.bio && (
            <p className="text-[15px] leading-relaxed mb-5" style={{ color: 'var(--text-primary)' }}>
              {profile.bio}
            </p>
          )}

          {/* Stats */}
          <div className="flex gap-6" style={{ borderTop: '1px solid var(--border-light)', paddingTop: '1rem' }}>
            <div className="text-center">
              <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{profile.posts_count ?? 0}</div>
              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Posts</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{profile.followers_count ?? 0}</div>
              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Followers</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{profile.following_count ?? 0}</div>
              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Following</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="rounded-xl p-1 flex gap-1 mb-6"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <button
          className="flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors"
          style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
        >
          Posts
        </button>
        <button
          className="flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors hover:opacity-80"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Likes
        </button>
        <button
          className="flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors hover:opacity-80"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Saved
        </button>
      </div>

      {/* Posts Grid */}
      {profile.posts?.length === 0 ? (
        <div
          className="rounded-2xl p-8 text-center"
          style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}
        >
          <div
            className="w-14 h-14 mx-auto mb-3 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7" style={{ color: 'var(--text-tertiary)' }}>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No posts yet</h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {isOwnProfile ? "Share your first moment" : "This user hasn't posted yet"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1">
          {profile.posts?.map((post: any) => (
            <Link
              key={post.id}
              to={`/posts/${post.slug || post.public_id || post.id}`}
              className="aspect-square overflow-hidden relative group"
              style={{ backgroundColor: 'var(--bg-tertiary)' }}
            >
              {post.post_image_url ? (
                <img src={post.post_image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div
                  className="w-full h-full p-3 flex items-center justify-center"
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                >
                  <p className="text-xs text-center line-clamp-4" style={{ color: 'var(--text-secondary)' }}>
                    {post.content}
                  </p>
                </div>
              )}
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                <div className="flex items-center gap-1 text-white text-sm font-medium">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                  {post.likes_count ?? 0}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Chat Drawer */}
      <ChatDrawer isOpen={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  )
}
