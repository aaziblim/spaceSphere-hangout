import { useState } from 'react'
import { Link } from 'react-router-dom'
import VerifiedBadge from './VerifiedBadge'
import UserActionMenu from './UserActionMenu'
import type { Post } from '../types'

export function timeAgo(date: string) {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
    if (seconds < 60) return 'now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d`
    return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function readingTime(text: string): string | null {
    const words = text.trim().split(/\s+/).length
    if (words < 50) return null
    const minutes = Math.ceil(words / 200)
    return `${minutes} min read`
}

export const VIBE_REACTIONS = [
    { emoji: '🔥', label: 'Fire', color: '#FF6B35' },
    { emoji: '💜', label: 'Love', color: '#A855F7' },
    { emoji: '🤯', label: 'Mind-blown', color: '#3B82F6' },
    { emoji: '😂', label: 'Funny', color: '#FBBF24' },
] as const

export function getSavedPosts(): Set<string> {
    try {
        const saved = localStorage.getItem('savedPosts')
        return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch {
        return new Set()
    }
}

export function toggleSavedPost(postId: string): boolean {
    const saved = getSavedPosts()
    const isSaved = saved.has(postId)
    if (isSaved) {
        saved.delete(postId)
    } else {
        saved.add(postId)
    }
    localStorage.setItem('savedPosts', JSON.stringify([...saved]))
    return !isSaved
}

export function isCurrentUserVerified(): boolean {
    try {
        const status = localStorage.getItem('verificationStatus')
        return status ? JSON.parse(status).isVerified : false
    } catch {
        return false
    }
}

/**
 * Wilson Lower Bound Confidence Interval
 */
export function wilsonScore(ups: number, downs: number): number {
    const n = ups + downs
    if (n === 0) return 0
    const z = 1.96
    const p = ups / n
    const left = p + (z * z) / (2 * n)
    const right = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)
    const under = 1 + (z * z) / n
    return (left - right) / under
}

export function getHotScore(post: Post): number {
    const ups = post.likes_count
    const downs = post.dislikes_count
    const comments = post.comments_count || 0
    const ageHours = (Date.now() - new Date(post.date_posted).getTime()) / (1000 * 60 * 60)
    const wilson = wilsonScore(ups, downs)
    const timeFactor = 1 / Math.pow(ageHours + 2, 1.5)
    const velocity = (comments * 2) / Math.max(ageHours, 1)
    return (wilson * 40) + (timeFactor * 30) + (velocity * 30)
}

export function getForYouScore(post: Post): number {
    const ageHours = (Date.now() - new Date(post.date_posted).getTime()) / (1000 * 60 * 60)
    const ups = post.likes_count
    const downs = post.dislikes_count
    const totalVotes = ups + downs
    const wilson = wilsonScore(ups, downs)
    const engagementRate = totalVotes > 0 ? ups / totalVotes : 0.5
    const controversyScore = totalVotes > 5 ? 1 - Math.abs(engagementRate - 0.5) * 2 : 0
    const activityScore = Math.log10(Math.max(post.comments_count || 1, 1) + 1)
    const freshnessMultiplier = Math.max(0.3, 1 - (ageHours / 168))
    const contentLength = post.content?.length || 0
    const qualityBoost = contentLength > 200 ? 1.2 : contentLength > 100 ? 1.1 : 1
    return ((wilson * 35) + (controversyScore * 15) + (activityScore * 25) + (totalVotes * 0.3)) * freshnessMultiplier * qualityBoost
}

export default function PostCard({
    post,
    onLike,
    onDislike,
    liking,
    disliking,
    isAuthenticated,
    isHot,
    currentUsername
}: {
    post: Post
    onLike?: () => void
    onDislike?: () => void
    liking?: boolean
    disliking?: boolean
    isAuthenticated: boolean
    isHot?: boolean
    currentUsername?: string
}) {
    const [showVibes, setShowVibes] = useState(false)
    const [selectedVibe, setSelectedVibe] = useState<number | null>(null)
    const [isSaved, setIsSaved] = useState(() => getSavedPosts().has(post.public_id || String(post.id)))
    const [shareToast, setShareToast] = useState<string | null>(null)
    const [likeAnim, setLikeAnim] = useState(false)
    const [saveAnim, setSaveAnim] = useState(false)
    const [vibeAnim, setVibeAnim] = useState(false)
    const readTime = readingTime(post.content)

    const isAuthorVerified = post.author.is_verified || (currentUsername === post.author.username && isCurrentUserVerified())
    const postUrl = `${window.location.origin}/posts/${post.slug || post.public_id || post.id}`

    const handleShare = async (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const shareData = { title: post.title || 'Check out this post', text: post.content.slice(0, 100), url: postUrl }
        try {
            if (navigator.share && navigator.canShare?.(shareData)) {
                await navigator.share(shareData)
                setShareToast('Shared!')
            } else {
                await navigator.clipboard.writeText(postUrl)
                setShareToast('Link copied!')
            }
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                await navigator.clipboard.writeText(postUrl)
                setShareToast('Link copied!')
            }
        }
        setTimeout(() => setShareToast(null), 2000)
    }

    const handleSave = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setSaveAnim(true)
        setTimeout(() => setSaveAnim(false), 300)
        setIsSaved(toggleSavedPost(post.public_id || String(post.id)))
    }

    const handleLikeClick = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (isAuthenticated && !liking && !disliking) {
            setLikeAnim(true)
            setTimeout(() => setLikeAnim(false), 500)
            onLike?.()
        }
    }

    const handleVibe = (index: number) => {
        setSelectedVibe(selectedVibe === index ? null : index)
        setShowVibes(false)
        setVibeAnim(true)
        setTimeout(() => setVibeAnim(false), 400)
    }

    return (
        <article className="rounded-3xl transition-all duration-300 hover:translate-y-[-4px] group" style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}>
            <div className="p-4 pb-3 flex items-center gap-3">
                <Link to={`/user/${post.author.username}`} className="relative shrink-0">
                    <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-offset-2 transition-transform group-hover:scale-105" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: isHot ? '#FF6B35' : 'var(--border-light)' }}>
                        {post.author.profile_image ? <img src={post.author.profile_image} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white font-semibold text-sm" style={{ backgroundColor: 'var(--accent)' }}>{post.author.username.slice(0, 1).toUpperCase()}</div>}
                    </div>
                </Link>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <Link to={`/user/${post.author.username}`} className="font-semibold text-sm hover:underline truncate" style={{ color: 'var(--text-primary)' }}>{post.author.username}</Link>
                        {isAuthorVerified && <VerifiedBadge size="sm" />}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {post.community && (
                            <>
                                <Link to={`/c/${post.community.slug}`} className="font-bold hover:underline" style={{ color: 'var(--accent)' }}>
                                    c/{post.community.slug}
                                </Link>
                                <span className="opacity-50">•</span>
                            </>
                        )}
                        <span>{timeAgo(post.date_posted)}</span>
                        {readTime && <><span className="opacity-50">•</span><span>{readTime}</span></>}
                    </div>
                </div>
                <UserActionMenu
                    username={post.author.username}
                    currentUsername={currentUsername}
                    contentType="post"
                    targetId={{ post_id: post.id }}
                />
            </div>

            {(post.post_image_url || post.post_video_url) && (
                <Link to={`/posts/${post.slug || post.public_id || post.id}`} className="block relative overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                    {post.post_video_url ? (
                        <video
                            src={post.post_video_url}
                            controls
                            muted
                            playsInline
                            preload="metadata"
                            className="w-full max-h-[520px] object-cover"
                        />
                    ) : <img src={post.post_image_url!} alt="" className="w-full max-h-[520px] object-cover transition-transform duration-500 group-hover:scale-[1.02]" />}
                </Link>
            )}

            <div className="p-4 pt-3">
                <Link to={`/posts/${post.slug || post.public_id || post.id}`}>
                    <h2 className="text-[17px] font-bold mb-1.5 hover:underline leading-tight" style={{ color: 'var(--text-primary)' }}>{post.title}</h2>
                    <p className="text-[15px] leading-relaxed line-clamp-3" style={{ color: 'var(--text-secondary)' }}>{post.content}</p>
                </Link>

                <div className="flex items-center gap-0.5 mt-3">
                    <button onClick={handleLikeClick} aria-label="Like" className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all hover:scale-105 ${likeAnim ? 'animate-heartBeat' : ''}`} style={{ backgroundColor: post.user_has_liked ? 'var(--accent-alpha)' : 'transparent', color: post.user_has_liked ? 'var(--accent)' : 'var(--text-secondary)', opacity: !isAuthenticated || liking || disliking ? 0.5 : 1 }}>
                        <svg viewBox="0 0 24 24" fill={post.user_has_liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                        </svg>
                        {post.likes_count > 0 && <span>{post.likes_count}</span>}
                    </button>

                    <button onClick={e => { e.preventDefault(); e.stopPropagation(); if (isAuthenticated && !liking && !disliking) onDislike?.() }} aria-label="Dislike" className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all hover:scale-105" style={{ backgroundColor: post.user_has_disliked ? 'var(--bg-tertiary)' : 'transparent', color: post.user_has_disliked ? 'var(--text-primary)' : 'var(--text-tertiary)', opacity: !isAuthenticated || liking || disliking ? 0.5 : 1 }}>
                        <svg viewBox="0 0 24 24" fill={post.user_has_disliked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5} className="w-4 h-4"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" /></svg>
                        {post.dislikes_count > 0 && <span className="text-xs">{post.dislikes_count}</span>}
                    </button>

                    <Link to={`/posts/${post.slug || post.public_id || post.id}`} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all hover:scale-105" style={{ color: 'var(--text-secondary)' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                        {post.comments_count > 0 && <span>{post.comments_count}</span>}
                    </Link>

                    <div className="relative">
                        <button
                            onClick={() => isAuthenticated && setShowVibes(!showVibes)}
                            aria-label="Reactions"
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all hover:scale-105 ${vibeAnim ? 'animate-pop' : ''}`}
                            style={{
                                backgroundColor: selectedVibe !== null ? `${VIBE_REACTIONS[selectedVibe].color}20` : 'transparent',
                                color: selectedVibe !== null ? VIBE_REACTIONS[selectedVibe].color : 'var(--text-secondary)',
                                opacity: !isAuthenticated ? 0.5 : 1
                            }}
                        >
                            {selectedVibe !== null ? (
                                <>
                                    <span className="text-lg">{VIBE_REACTIONS[selectedVibe].emoji}</span>
                                    <span className="text-xs font-semibold">{VIBE_REACTIONS[selectedVibe].label}</span>
                                </>
                            ) : (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                                    <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth={2} strokeLinecap="round" />
                                    <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth={2} strokeLinecap="round" />
                                </svg>
                            )}
                        </button>
                        {showVibes && (
                            <div className="absolute bottom-full left-0 mb-2 flex gap-1 p-2 rounded-2xl shadow-xl z-10 border animate-slideInFromBottom" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-light)' }}>
                                {VIBE_REACTIONS.map((vibe, i) => (
                                    <button
                                        key={vibe.label}
                                        onClick={() => handleVibe(i)}
                                        aria-label={vibe.label}
                                        className="p-2 rounded-xl hover:scale-125 transition-all"
                                        style={{
                                            backgroundColor: selectedVibe === i ? `${vibe.color}30` : 'transparent',
                                            outline: selectedVibe === i ? `2px solid ${vibe.color}` : 'none',
                                            outlineOffset: '2px'
                                        }}
                                    >
                                        <span className="text-xl">{vibe.emoji}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex-1" />

                    <button onClick={handleSave} aria-label="Save" className={`p-2 rounded-xl transition-all hover:scale-105 ${saveAnim ? 'animate-pop' : ''}`} style={{ color: isSaved ? 'var(--warning)' : 'var(--text-secondary)' }}>
                        <svg viewBox="0 0 24 24" fill={isSaved ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                        </svg>
                    </button>

                    <button onClick={handleShare} aria-label="Share" className="p-2 rounded-xl transition-all hover:scale-105" style={{ color: 'var(--text-secondary)' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
                        {shareToast && <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap bg-gray-800 text-white shadow-xl animate-fade-in">{shareToast}</div>}
                    </button>
                </div>
            </div>
        </article>
    )
}
