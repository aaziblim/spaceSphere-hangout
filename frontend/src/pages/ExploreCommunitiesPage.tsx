import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchCommunities } from '../api'
import type { Community } from '../types'

export default function ExploreCommunitiesPage() {
    const { data, isLoading } = useQuery({
        queryKey: ['communities'],
        queryFn: fetchCommunities,
    })

    const communities = data?.results || []

    return (
        <div className="max-w-3xl mx-auto px-4 py-8">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold tracking-tight mb-1" style={{ color: 'var(--text-primary)' }}>
                    Communities
                </h1>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Find your people.
                </p>
            </div>

            {/* Create CTA */}
            <Link
                to="/communities/new"
                className="flex items-center gap-3 p-4 rounded-2xl mb-6 group transition-all hover:translate-y-[-2px]"
                style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}
            >
                <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                    style={{ backgroundColor: 'var(--accent-alpha)', color: 'var(--accent)' }}
                >
                    +
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold group-hover:underline" style={{ color: 'var(--text-primary)' }}>
                        Create a community
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        Start something new
                    </p>
                </div>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                    <path d="M9 18l6-6-6-6" />
                </svg>
            </Link>

            {/* List */}
            {isLoading ? (
                <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}>
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="flex items-center gap-4 p-4" style={i < 5 ? { borderBottom: '1px solid var(--border-light)' } : undefined}>
                            <div className="w-12 h-12 rounded-2xl skeleton shrink-0" />
                            <div className="flex-1 space-y-2">
                                <div className="h-4 w-28 skeleton rounded-lg" />
                                <div className="h-3 w-48 skeleton rounded-lg" />
                            </div>
                            <div className="h-8 w-16 skeleton rounded-full" />
                        </div>
                    ))}
                </div>
            ) : communities.length === 0 ? (
                <div
                    className="rounded-2xl p-12 text-center"
                    style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}
                >
                    <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>No communities yet</p>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Be the first to create one.</p>
                </div>
            ) : (
                <div
                    className="rounded-2xl overflow-hidden"
                    style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}
                >
                    {communities.map((community, i) => (
                        <Link
                            key={community.id}
                            to={`/c/${community.slug}`}
                            className="flex items-center gap-4 p-4 transition-colors hover:bg-[var(--bg-secondary)] group"
                            style={i < communities.length - 1 ? { borderBottom: '1px solid var(--border-light)' } : undefined}
                        >
                            {/* Icon */}
                            <div
                                className="w-12 h-12 rounded-2xl overflow-hidden flex items-center justify-center text-lg font-bold shrink-0"
                                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--accent)' }}
                            >
                                {community.icon_url ? (
                                    <img src={community.icon_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    community.name.charAt(0).toUpperCase()
                                )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <p className="text-[15px] font-semibold truncate group-hover:underline" style={{ color: 'var(--text-primary)' }}>
                                    {community.name}
                                </p>
                                <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                                    {community.description || 'A community on Sphere'}
                                </p>
                                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                                    {community.members_count} {community.members_count === 1 ? 'member' : 'members'} · {community.posts_count} {community.posts_count === 1 ? 'post' : 'posts'}
                                </p>
                            </div>

                            {/* Action */}
                            {community.is_member ? (
                                <span
                                    className="text-xs font-medium px-3 py-1.5 rounded-full shrink-0"
                                    style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}
                                >
                                    Joined
                                </span>
                            ) : (
                                <span
                                    className="text-xs font-semibold px-4 py-1.5 rounded-full shrink-0"
                                    style={{ backgroundColor: 'var(--accent)', color: 'var(--text-on-accent)' }}
                                >
                                    Join
                                </span>
                            )}
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}
