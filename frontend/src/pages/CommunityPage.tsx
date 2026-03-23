import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api, { fetchCommunity, joinCommunity, leaveCommunity, fetchSphereStatus, createSphere, requestJoinSphere } from '../api'
import { useAuth } from '../AuthContext'
import PostCard from '../components/PostCard'
import type { Post } from '../types'

export default function CommunityPage() {
    const { slug } = useParams<{ slug: string }>()
    const { user } = useAuth()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const [tab, setTab] = useState<'posts' | 'about'>('posts')
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [sphereTitle, setSphereTitle] = useState('')
    const [requestSent, setRequestSent] = useState(false)

    const { data: community, isLoading, isError } = useQuery({
        queryKey: ['community', slug],
        queryFn: () => fetchCommunity(slug!),
        enabled: !!slug,
    })

    const { data: postsData } = useQuery({
        queryKey: ['communityPosts', slug],
        queryFn: async () => {
            const { data } = await api.get(`/posts/?community=${slug}`)
            return data.results as Post[]
        },
        enabled: !!slug,
    })

    const { data: sphereStatus } = useQuery({
        queryKey: ['sphereStatus', slug],
        queryFn: () => fetchSphereStatus(slug!),
        enabled: !!slug,
        refetchInterval: 15000,
    })

    const joinMutation = useMutation({
        mutationFn: () => joinCommunity(slug!),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['community', slug] })
            queryClient.invalidateQueries({ queryKey: ['myCommunities'] })
        },
    })

    const leaveMutation = useMutation({
        mutationFn: () => leaveCommunity(slug!),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['community', slug] })
            queryClient.invalidateQueries({ queryKey: ['myCommunities'] })
        },
    })

    const createSphereMutation = useMutation({
        mutationFn: () => createSphere(slug!, sphereTitle || undefined),
        onSuccess: () => {
            setShowCreateModal(false)
            setSphereTitle('')
            queryClient.invalidateQueries({ queryKey: ['sphereStatus', slug] })
            navigate(`/spheres/${slug}`)
        },
    })

    const requestJoinMutation = useMutation({
        mutationFn: () => requestJoinSphere(slug!),
        onSuccess: () => setRequestSent(true),
    })

    if (isLoading) {
        return (
            <div className="max-w-2xl mx-auto px-4">
                <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}>
                    <div className="p-6">
                        <div className="flex items-center gap-4 mb-5">
                            <div className="w-16 h-16 rounded-2xl skeleton shrink-0" />
                            <div className="flex-1 space-y-2">
                                <div className="h-5 w-36 skeleton rounded-lg" />
                                <div className="h-3 w-24 skeleton rounded-lg" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="h-4 w-full skeleton rounded-lg" />
                            <div className="h-4 w-2/3 skeleton rounded-lg" />
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    if (isError || !community) {
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
                    <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Community not found</h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>This community doesn't exist or has been removed.</p>
                </div>
            </div>
        )
    }

    const posts = postsData ?? []

    return (
        <div className="max-w-2xl mx-auto px-4">
            {/* Community Header Card */}
            <div className="rounded-2xl overflow-hidden mb-6" style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}>
                <div className="p-6">
                    {/* Identity */}
                    <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-5">
                        <div className="flex items-center gap-4 sm:block">
                            <div
                                className="w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center text-2xl font-bold shrink-0"
                                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--accent)' }}
                            >
                                {community.icon_url ? (
                                    <img src={community.icon_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    community.name.charAt(0).toUpperCase()
                                )}
                            </div>
                            {/* Mobile name */}
                            <div className="sm:hidden">
                                <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{community.name}</h1>
                                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>c/{community.slug}</p>
                            </div>
                        </div>

                        {/* Desktop name + actions */}
                        <div className="flex-1 min-w-0 hidden sm:block">
                            <div className="flex items-start justify-between gap-4 mb-1">
                                <div>
                                    <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{community.name}</h1>
                                    <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>c/{community.slug}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {user && (
                                        community.is_member ? (
                                            <button
                                                onClick={() => leaveMutation.mutate()}
                                                disabled={leaveMutation.isPending}
                                                className="px-5 py-2 text-sm font-medium rounded-full transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
                                                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                                            >
                                                Joined
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => joinMutation.mutate()}
                                                disabled={joinMutation.isPending}
                                                className="px-5 py-2 text-sm font-medium rounded-full transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
                                                style={{ backgroundColor: 'var(--accent)', color: 'var(--text-on-accent)' }}
                                            >
                                                Join
                                            </button>
                                        )
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Mobile actions */}
                    {user && (
                        <div className="sm:hidden mb-5 flex gap-3">
                            {community.is_member ? (
                                <button
                                    onClick={() => leaveMutation.mutate()}
                                    disabled={leaveMutation.isPending}
                                    className="flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all active:scale-[0.98] disabled:opacity-50"
                                    style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                                >
                                    Joined
                                </button>
                            ) : (
                                <button
                                    onClick={() => joinMutation.mutate()}
                                    disabled={joinMutation.isPending}
                                    className="flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all active:scale-[0.98] disabled:opacity-50"
                                    style={{ backgroundColor: 'var(--accent)', color: 'var(--text-on-accent)' }}
                                >
                                    Join
                                </button>
                            )}
                        </div>
                    )}

                    {/* Description */}
                    {community.description && (
                        <p className="text-[15px] leading-relaxed mb-5" style={{ color: 'var(--text-primary)' }}>
                            {community.description}
                        </p>
                    )}

                    {/* Stats + Meta */}
                    <div className="flex items-center gap-5 pt-4" style={{ borderTop: '1px solid var(--border-light)' }}>
                        <div className="text-center">
                            <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{community.members_count}</div>
                            <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Members</div>
                        </div>
                        <div className="text-center">
                            <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{community.posts_count}</div>
                            <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Posts</div>
                        </div>
                        <div className="flex-1" />
                        <span
                            className="text-xs font-medium px-2.5 py-1 rounded-lg"
                            style={{ backgroundColor: 'var(--accent-alpha)', color: 'var(--accent)' }}
                        >
                            {community.is_private ? 'Private' : 'Public'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div
                className="rounded-2xl overflow-hidden mb-6"
                style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}
            >
                {/* Smart Sphere Button */}
                {(() => {
                    const isLive = sphereStatus?.is_live
                    const isMember = community.is_member
                    const isAdminOrMod = community.user_role === 'admin' || community.user_role === 'moderator'

                    if (isLive && isMember) {
                        // Live sphere + member → Join
                        return (
                            <Link
                                to={`/spheres/${community.slug}`}
                                className="flex items-center gap-4 p-4 transition-all hover:translate-x-[0.5px] group"
                                style={{ borderBottom: '1px solid var(--border-light)' }}
                            >
                                <div className="relative">
                                    <div
                                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                                        style={{ background: 'var(--gradient-stream)' }}
                                    >
                                        <img src="/spheres-audio-icon.svg" alt="" className="w-6 h-6" />
                                    </div>
                                    <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full animate-sphere-pulse" style={{ backgroundColor: 'var(--success)' }}>
                                        <div className="absolute inset-0 rounded-full" style={{ backgroundColor: 'var(--success)', opacity: 0.4 }} />
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-semibold group-hover:underline" style={{ color: 'var(--text-primary)' }}>Enter Spheres</p>
                                        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--accent-alpha)', color: 'var(--accent)' }}>
                                            {sphereStatus?.participant_count} listening
                                        </span>
                                    </div>
                                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                        {sphereStatus?.conductor ? `Hosted by ${sphereStatus.conductor.username}` : 'Live now'}
                                    </p>
                                </div>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                                    <path d="M9 18l6-6-6-6" />
                                </svg>
                            </Link>
                        )
                    }

                    if (isLive && !isMember && !community.is_private) {
                        // Live sphere + non-member + public → Request to join
                        return (
                            <div
                                className="flex items-center gap-4 p-4"
                                style={{ borderBottom: '1px solid var(--border-light)' }}
                            >
                                <div className="relative">
                                    <div
                                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                                        style={{ background: 'var(--gradient-stream)' }}
                                    >
                                        <img src="/spheres-audio-icon.svg" alt="" className="w-6 h-6" />
                                    </div>
                                    <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full animate-sphere-pulse" style={{ backgroundColor: 'var(--success)' }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Spheres are Live</p>
                                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                        {sphereStatus?.participant_count} listening
                                    </p>
                                </div>
                                {user && (
                                    <button
                                        onClick={() => requestJoinMutation.mutate()}
                                        disabled={requestSent || requestJoinMutation.isPending}
                                        className="px-4 py-2 text-xs font-semibold rounded-full transition-all active:scale-95 disabled:opacity-60 flex items-center gap-2"
                                        style={requestSent
                                            ? { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }
                                            : { background: 'var(--gradient-stream)', color: 'var(--text-on-accent)' }
                                        }
                                    >
                                        {requestSent ? 'Request Sent' : 'Request to Join Spheres'}
                                    </button>
                                )}
                            </div>
                        )
                    }

                    if (!isLive && isAdminOrMod) {
                        // No sphere + admin/mod → Start Sphere
                        return (
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="w-full flex items-center gap-4 p-4 transition-all hover:translate-x-[0.5px] group text-left"
                                style={{ borderBottom: '1px solid var(--border-light)' }}
                            >
                                <div
                                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                                    style={{ background: 'var(--gradient-stream)' }}
                                >
                                    <img src="/spheres-audio-icon.svg" alt="" className="w-6 h-6" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold group-hover:underline" style={{ color: 'var(--text-primary)' }}>Start Spheres</p>
                                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Launch a live spatial audio room</p>
                                </div>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                                    <path d="M9 18l6-6-6-6" />
                                </svg>
                            </button>
                        )
                    }

                    // No sphere + regular member or non-member → hide sphere row
                    return null
                })()}

                {user && (
                    <Link
                        to={`/posts/new?community=${community.slug}`}
                        className="flex items-center gap-4 p-4 transition-colors hover:bg-[var(--bg-secondary)] group"
                    >
                        <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                            style={{ backgroundColor: 'var(--accent-alpha)', color: 'var(--accent)' }}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold group-hover:underline" style={{ color: 'var(--text-primary)' }}>Create Post</p>
                            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Share something with the community</p>
                        </div>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                            <path d="M9 18l6-6-6-6" />
                        </svg>
                    </Link>
                )}
            </div>

            {/* Sphere Creation Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateModal(false)}>
                    <div className="absolute inset-0 animate-fadeIn" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} />
                    <div
                        className="relative w-full max-w-sm rounded-2xl p-6 animate-zoomInNoTranslate"
                        style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3 mb-5">
                            <div
                                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                                style={{ background: 'var(--gradient-community)' }}
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-on-accent)" strokeWidth={2} className="w-5 h-5">
                                    <circle cx="12" cy="12" r="10" />
                                    <circle cx="12" cy="12" r="4" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Start a Sphere</h3>
                                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>All members will be notified</p>
                            </div>
                        </div>

                        <input
                            type="text"
                            value={sphereTitle}
                            onChange={e => setSphereTitle(e.target.value)}
                            placeholder={community.name}
                            className="w-full px-4 py-3 text-sm rounded-xl outline-none transition-colors mb-5"
                            style={{
                                backgroundColor: 'var(--bg-secondary)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border-light)',
                            }}
                            onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                            onBlur={e => (e.target.style.borderColor = 'var(--border-light)')}
                            autoFocus
                        />

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="flex-1 py-2.5 text-sm font-medium rounded-xl transition-all active:scale-[0.98]"
                                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => createSphereMutation.mutate()}
                                disabled={createSphereMutation.isPending}
                                className="flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all active:scale-[0.98] disabled:opacity-60"
                                style={{ background: 'var(--gradient-community)', color: 'var(--text-on-accent)' }}
                            >
                                {createSphereMutation.isPending ? 'Starting...' : 'Go Live'}
                            </button>
                        </div>

                        {createSphereMutation.isError && (
                            <p className="text-xs mt-3 text-center" style={{ color: 'var(--danger)' }}>
                                {(createSphereMutation.error as any)?.response?.status === 409
                                    ? 'A sphere is already live in this community.'
                                    : 'Failed to start sphere. Try again.'
                                }
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div
                className="rounded-xl p-1 flex gap-1 mb-6"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
            >
                {(['posts', 'about'] as const).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className="flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors"
                        style={tab === t
                            ? { backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }
                            : { color: 'var(--text-tertiary)' }
                        }
                    >
                        {t === 'posts' ? 'Posts' : 'About'}
                    </button>
                ))}
            </div>

            {/* Content */}
            {tab === 'posts' && (
                <div className="space-y-4">
                    {posts.length > 0 ? (
                        posts.map(post => (
                            <PostCard
                                key={post.id}
                                post={post}
                                isAuthenticated={!!user}
                                currentUsername={user?.username}
                                onLike={() => {
                                    api.post(`/posts/${post.public_id || post.slug || post.id}/like/`)
                                        .then(res => {
                                            queryClient.setQueryData(['communityPosts', slug], (old: Post[] | undefined) =>
                                                old?.map(p => p.id === res.data.id ? res.data : p)
                                            )
                                            queryClient.invalidateQueries({ queryKey: ['posts'] })
                                        })
                                }}
                                onDislike={() => {
                                    api.post(`/posts/${post.public_id || post.slug || post.id}/dislike/`)
                                        .then(res => {
                                            queryClient.setQueryData(['communityPosts', slug], (old: Post[] | undefined) =>
                                                old?.map(p => p.id === res.data.id ? res.data : p)
                                            )
                                            queryClient.invalidateQueries({ queryKey: ['posts'] })
                                        })
                                }}
                            />
                        ))
                    ) : (
                        <div
                            className="rounded-2xl p-8 text-center"
                            style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}
                        >
                            <div className="w-14 h-14 mx-auto mb-3 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7" style={{ color: 'var(--text-tertiary)' }}>
                                    <rect x="3" y="3" width="18" height="18" rx="2" />
                                    <line x1="12" y1="8" x2="12" y2="16" />
                                    <line x1="8" y1="12" x2="16" y2="12" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No posts yet</h3>
                            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Be the first to share something.</p>
                        </div>
                    )}
                </div>
            )}

            {tab === 'about' && (
                <div
                    className="rounded-2xl overflow-hidden"
                    style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}
                >
                    {community.description && (
                        <div className="p-5" style={{ borderBottom: '1px solid var(--border-light)' }}>
                            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Description</p>
                            <p className="text-[15px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                                {community.description}
                            </p>
                        </div>
                    )}
                    <div className="p-5" style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <div className="flex items-center justify-between">
                            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Created</span>
                            <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                                {new Date(community.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                            </span>
                        </div>
                    </div>
                    <div className="p-5">
                        <div className="flex items-center justify-between">
                            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Creator</span>
                            <Link to={`/user/${community.creator.username}`} className="text-sm font-medium hover:underline" style={{ color: 'var(--accent)' }}>
                                @{community.creator.username}
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
