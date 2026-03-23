import { useRef, useCallback, useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchPosts, likePost, dislikePost, fetchCommunityPulse } from '../api'
import { useAuth } from '../AuthContext'

import PostCard, { getSavedPosts, getHotScore, getForYouScore } from '../components/PostCard'
import ActiveStreamsCarousel from '../components/ActiveStreamsCarousel'
import type { Paginated, Post } from '../types'

type FilterTab = 'foryou' | 'fresh' | 'hot' | 'saved'
const FEED_CACHE_KEY = 'homeFeedCacheV1'

function readCachedFeed(): Post[] {
  try {
    const raw = localStorage.getItem(FEED_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Post[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeCachedFeed(posts: Post[]) {
  try {
    localStorage.setItem(FEED_CACHE_KEY, JSON.stringify(posts.slice(0, 120)))
  } catch {
    // no-op
  }
}

export default function HomePage() {
  const { user } = useAuth()

  const queryClient = useQueryClient()
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  const urlTab = searchParams.get('tab')
  const activeTab: FilterTab = (urlTab === 'hot' || urlTab === 'fresh' || urlTab === 'saved') ? urlTab : 'foryou'

  const setActiveTab = (tab: FilterTab) => {
    if (tab === 'foryou') {
      searchParams.delete('tab')
    } else {
      searchParams.set('tab', tab)
    }
    setSearchParams(searchParams)
  }

  const { data: pulseData } = useQuery({
    queryKey: ['communityPulse'],
    queryFn: fetchCommunityPulse,
    staleTime: 30000,
    refetchInterval: 30000,
  })

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ['posts'],
    queryFn: ({ pageParam = 1 }) => fetchPosts(pageParam),
    getNextPageParam: (lastPage: Paginated<Post>) => {
      if (!lastPage.next) return undefined
      const url = new URL(lastPage.next, window.location.origin)
      return Number(url.searchParams.get('page'))
    },
    initialPageParam: 1,
  })

  const updatePostInCache = (updated: Post) => {
    queryClient.setQueryData(['posts'], (old: { pages: Paginated<Post>[]; pageParams: number[] } | undefined) => {
      if (!old) return old
      return {
        ...old,
        pages: old.pages.map(page => ({
          ...page,
          results: page.results.map(p => p.id === updated.id ? updated : p)
        }))
      }
    })
    // Also invalidate any community post queries to keep them in sync
    if (updated.community) {
      queryClient.invalidateQueries({ queryKey: ['communityPosts', updated.community.slug] })
    }
  }

  const likeMutation = useMutation({
    mutationFn: likePost,
    onSuccess: updatePostInCache,
  })

  const dislikeMutation = useMutation({
    mutationFn: dislikePost,
    onSuccess: updatePostInCache,
  })

  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    const [entry] = entries
    if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  useEffect(() => {
    const el = loadMoreRef.current
    if (!el) return
    const observer = new IntersectionObserver(handleObserver, { threshold: 0.1 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [handleObserver])

  const posts = data?.pages.flatMap(p => p.results) ?? []
  const cachedPosts = useMemo(() => readCachedFeed(), [])
  const effectivePosts = posts.length > 0 ? posts : (isError ? cachedPosts : posts)
  const sortOrderRef = useRef<{ tab: FilterTab; order: number[] } | null>(null)

  useEffect(() => {
    if (posts.length > 0) {
      writeCachedFeed(posts)
    }
  }, [posts])

  const sortedPosts = useMemo(() => {
    if (!effectivePosts.length) return []
    if (activeTab === 'saved') {
      const currentSaved = getSavedPosts()
      return effectivePosts.filter(p => currentSaved.has(p.public_id || String(p.id)))
        .sort((a, b) => new Date(b.date_posted).getTime() - new Date(a.date_posted).getTime())
    }

    const currentPostIds = effectivePosts.map(p => p.id).sort((a, b) => a - b).join(',')
    const cachedPostIds = sortOrderRef.current?.order?.slice().sort((a, b) => a - b).join(',')
    const needsResort = sortOrderRef.current?.tab !== activeTab || currentPostIds !== cachedPostIds

    if (!needsResort && sortOrderRef.current) {
      const postsMap = new Map(effectivePosts.map(p => [p.id, p]))
      return sortOrderRef.current.order.map(id => postsMap.get(id)).filter((p): p is Post => p !== undefined)
    }

    const sorted = [...effectivePosts].sort((a, b) => {
      if (activeTab === 'hot') {
        return getHotScore(b) - getHotScore(a)
      }
      if (activeTab === 'fresh') {
        return new Date(b.date_posted).getTime() - new Date(a.date_posted).getTime()
      }
      return getForYouScore(b) - getForYouScore(a)
    })

    sortOrderRef.current = { tab: activeTab, order: sorted.map(p => p.id) }
    return sorted
  }, [effectivePosts, activeTab])

  const savedCount = useMemo(() => getSavedPosts().size, [activeTab])

  const tabs: { key: FilterTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: 'foryou', label: 'For You', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg> },
    { key: 'fresh', label: 'Fresh', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg> },
    { key: 'hot', label: 'Hot', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4"><path d="M12 2c.5 2.5 2 4.5 4 6 2.5 2 4 5 4 8a8 8 0 1 1-16 0c0-3 1.5-6 4-8 2-1.5 3.5-3.5 4-6z" /></svg> },
    { key: 'saved', label: 'Saved', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>, badge: savedCount > 0 ? savedCount : undefined },
  ]

  if (isError && cachedPosts.length === 0) {
    return <div className="p-8 text-center text-red-500">Failed to load posts.</div>
  }

  return (
    <div className="w-full">
      {/* Active Streams - Stories Style */}
      <ActiveStreamsCarousel />

      <div className="mb-6">
        {isError && cachedPosts.length > 0 && (
          <div
            className="mb-3 px-4 py-2 rounded-xl text-xs font-medium"
            style={{ backgroundColor: 'var(--warning-alpha)', color: 'var(--warning)' }}
          >
            Connection issue. Showing last available feed.
          </div>
        )}
        <div className="flex items-center justify-between mb-4 py-3 px-4 rounded-2xl transition-all" style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--accent-alpha)', color: 'var(--accent)' }}>
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>The Hangout</p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{pulseData?.active_users ?? 0} people here now</p>
            </div>
          </div>
          {user && <Link to="/posts/new" className="px-4 py-2 rounded-full text-white text-sm font-medium transition-all hover:opacity-90" style={{ backgroundColor: 'var(--accent)' }}>Share something</Link>}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap active:scale-95 ${activeTab === tab.key
                ? 'text-[var(--accent)]'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                }`}
              style={activeTab === tab.key
                ? { backgroundColor: 'var(--accent-alpha)' }
                : {}}
            >
              {tab.icon} {tab.label} {tab.badge && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white/20 text-[10px]">{tab.badge}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        {/* Featured: Spheres (spatial audio) */}
        <div
          className="rounded-3xl p-5"
          style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}
        >
          <div className="flex items-center gap-4 mb-2">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--gradient-stream)' }}
            >
              <img src="/spheres-audio-icon.svg" alt="" className="w-7 h-7" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Spheres
              </p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Spatial audio rooms where position matters
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-4">
            <Link
              to={user ? '/spheres' : '/login'}
              className="px-4 py-2.5 rounded-full text-sm font-semibold transition-all active:scale-[0.98]"
              style={{ background: 'var(--accent)', color: 'var(--text-on-accent)' }}
            >
              Enter Spheres
            </Link>
            <Link
              to="/communities/discover"
              className="px-4 py-2.5 rounded-full text-sm font-semibold transition-all active:scale-[0.98]"
              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
            >
              Discover Communities
            </Link>
          </div>
        </div>

        {sortedPosts.map(post => (
          <PostCard
            key={post.id}
            post={post}
            isAuthenticated={!!user}
            currentUsername={user?.username}
            onLike={() => likeMutation.mutate(post.public_id || String(post.id))}
            onDislike={() => dislikeMutation.mutate(post.public_id || String(post.id))}
            liking={likeMutation.isPending}
            disliking={dislikeMutation.isPending}
          />
        ))}

        {isLoading && (
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-5 rounded-2xl" style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}>
                {/* Header skeleton */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full skeleton" />
                  <div className="flex-1">
                    <div className="h-4 w-28 skeleton rounded mb-2" />
                    <div className="h-3 w-20 skeleton rounded" />
                  </div>
                </div>
                {/* Content skeleton */}
                <div className="space-y-2 mb-4">
                  <div className="h-4 w-full skeleton rounded" />
                  <div className="h-4 w-5/6 skeleton rounded" />
                  <div className="h-4 w-3/4 skeleton rounded" />
                </div>
                {/* Image placeholder skeleton */}
                <div className="h-48 w-full skeleton rounded-xl mb-4" />
                {/* Actions skeleton */}
                <div className="flex items-center gap-4">
                  <div className="h-8 w-16 skeleton rounded-full" />
                  <div className="h-8 w-16 skeleton rounded-full" />
                  <div className="h-8 w-16 skeleton rounded-full" />
                </div>
              </div>
            ))}
          </div>
        )}

        <div ref={loadMoreRef} className="h-10 flex items-center justify-center">
          {isFetchingNextPage && <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />}
        </div>
      </div>
    </div>
  )
}
