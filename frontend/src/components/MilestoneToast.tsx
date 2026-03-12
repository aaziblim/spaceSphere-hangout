import { useEffect, useState } from 'react'

export interface Milestone {
    id: string
    title: string
    description: string
    emoji: string
    color: string
}

export const MILESTONES: Record<string, Milestone> = {
    first_post: {
        id: 'first_post',
        title: 'First Post!',
        description: 'You published your first post',
        emoji: '🚀',
        color: '#3B82F6'
    },
    rising_star: {
        id: 'rising_star',
        title: 'Rising Star',
        description: 'You published 10 posts',
        emoji: '⭐',
        color: '#FBBF24'
    },
    karma_king: {
        id: 'karma_king',
        title: 'Karma King',
        description: 'You reached 100 karma points',
        emoji: '👑',
color: 'var(--warning)'
    },
    week_warrior: {
        id: 'week_warrior',
        title: 'Week Warrior',
        description: '7-day activity streak!',
        emoji: '🔥',
        color: 'var(--danger)'
    },
    community_builder: {
        id: 'community_builder',
        title: 'Community Builder',
        description: 'Joined 5 communities',
        emoji: '🏨️',
        color: 'var(--success)'
    },
    social_butterfly: {
        id: 'social_butterfly',
        title: 'Social Butterfly',
        description: 'Reached 50 followers',
        emoji: '🦋',
        color: '#A855F7'
    }
}

// Get shown milestones from localStorage
export function getShownMilestones(): Set<string> {
    try {
        const shown = localStorage.getItem('shownMilestones')
        return shown ? new Set(JSON.parse(shown)) : new Set()
    } catch {
        return new Set()
    }
}

// Mark milestone as shown
export function markMilestoneShown(id: string): void {
    const shown = getShownMilestones()
    shown.add(id)
    localStorage.setItem('shownMilestones', JSON.stringify([...shown]))
}

// Check if milestone should show
export function shouldShowMilestone(id: string): boolean {
    return !getShownMilestones().has(id)
}

interface MilestoneToastProps {
    milestone: Milestone
    onClose: () => void
}

// Confetti particle colors
const CONFETTI_COLORS = ['#FF6B35', '#A855F7', '#3B82F6', '#10B981', '#FBBF24', '#EF4444', '#EC4899']

export default function MilestoneToast({ milestone, onClose }: MilestoneToastProps) {
    const [particles, setParticles] = useState<Array<{ id: number; x: number; color: string; delay: number }>>([])

    useEffect(() => {
        // Generate confetti particles
        const newParticles = Array.from({ length: 40 }, (_, i) => ({
            id: i,
            x: Math.random() * 100,
            color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
            delay: Math.random() * 0.5
        }))
        setParticles(newParticles)

        // Mark as shown
        markMilestoneShown(milestone.id)

        // Auto-close after 5 seconds
        const timer = setTimeout(onClose, 5000)
        return () => clearTimeout(timer)
    }, [milestone.id, onClose])

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
            {/* Confetti */}
            <div className="absolute inset-0 overflow-hidden">
                {particles.map((p) => (
                    <div
                        key={p.id}
                        className="absolute w-3 h-3 rounded-sm animate-confetti"
                        style={{
                            left: `${p.x}%`,
                            backgroundColor: p.color,
                            animationDelay: `${p.delay}s`,
                            transform: `rotate(${Math.random() * 360}deg)`
                        }}
                    />
                ))}
            </div>

            {/* Toast card */}
            <div
                className="relative pointer-events-auto p-8 rounded-3xl shadow-2xl max-w-sm mx-4 text-center animate-zoomInNoTranslate"
                style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: `2px solid ${milestone.color}40`
                }}
                onClick={onClose}
            >
                {/* Badge */}
                <div
                    className="w-24 h-24 mx-auto mb-4 rounded-full flex items-center justify-center text-5xl animate-badgeReveal animate-glow"
                    style={{
                        backgroundColor: `${milestone.color}20`,
                        boxShadow: `0 0 30px ${milestone.color}60`
                    }}
                >
                    {milestone.emoji}
                </div>

                {/* Title */}
                <h2
                    className="text-2xl font-bold mb-2"
                    style={{ color: milestone.color }}
                >
                    {milestone.title}
                </h2>

                {/* Description */}
                <p className="text-base mb-4" style={{ color: 'var(--text-secondary)' }}>
                    {milestone.description}
                </p>

                {/* Achievement unlocked text */}
                <div
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold"
                    style={{
                        backgroundColor: `${milestone.color}20`,
                        color: milestone.color
                    }}
                >
                    <span>🏆</span>
                    <span>Achievement Unlocked!</span>
                </div>

                {/* Tap to dismiss */}
                <p className="mt-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Tap to dismiss
                </p>
            </div>
        </div>
    )
}
