import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import ProfileSection from '../components/settings/ProfileSection'
import AccountSection from '../components/settings/AccountSection'
import AppearanceSection from '../components/settings/AppearanceSection'
import NotificationsSection from '../components/settings/NotificationsSection'
import PrivacySection from '../components/settings/PrivacySection'
import SecuritySection from '../components/settings/SecuritySection'
import DangerZoneSection from '../components/settings/DangerZoneSection'

const sections = [
  { id: 'profile', label: 'Profile', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-[18px] h-[18px]">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )},
  { id: 'account', label: 'Account', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-[18px] h-[18px]">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <polyline points="3 7 12 13 21 7" />
    </svg>
  )},
  { id: 'appearance', label: 'Appearance', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-[18px] h-[18px]">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  )},
  { id: 'notifications', label: 'Notifications', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-[18px] h-[18px]">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )},
  { id: 'privacy', label: 'Privacy', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-[18px] h-[18px]">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )},
  { id: 'security', label: 'Security', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-[18px] h-[18px]">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )},
  { id: 'danger', label: 'Danger Zone', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-[18px] h-[18px]">
      <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  )},
]

export default function SettingsPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [activeSection, setActiveSection] = useState('profile')
  const sectionRefs = useRef<Map<string, IntersectionObserverEntry>>(new Map())
  const tabBarRef = useRef<HTMLDivElement>(null)

  // Auth guard
  useEffect(() => {
    if (!loading && !user) {
      navigate('/login', { replace: true })
    }
  }, [user, loading, navigate])

  // Scroll to hash on mount
  useEffect(() => {
    const hash = location.hash.replace('#', '')
    if (hash) {
      setTimeout(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' })
      }, 150)
    }
  }, [])

  // Intersection observer for scroll-spy
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          sectionRefs.current.set(entry.target.id, entry)
        })
        const visible = Array.from(sectionRefs.current.values())
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) {
          setActiveSection(visible[0].target.id)
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
    )

    const ids = sections.map(s => s.id)
    ids.forEach(id => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [])

  // Auto-scroll active pill into view on mobile
  useEffect(() => {
    if (!tabBarRef.current) return
    const activeBtn = tabBarRef.current.querySelector(`[data-section="${activeSection}"]`) as HTMLElement
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [activeSection])

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  if (loading || !user) {
    return (
      <div className="py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-32 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
          <div className="h-4 w-56 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 rounded-2xl" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="py-6 sm:py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Settings
        </h1>
        <p className="text-sm mt-1.5" style={{ color: 'var(--text-secondary)' }}>
          Manage your account, privacy, and preferences
        </p>
      </div>

      {/* Mobile: Horizontal tab bar */}
      <div className="lg:hidden mb-6 -mx-4 px-4 overflow-x-auto scrollbar-none">
        <div ref={tabBarRef} className="flex gap-2 w-max pb-2">
          {sections.map(s => {
            const isActive = activeSection === s.id
            const isDanger = s.id === 'danger'
            return (
              <button
                key={s.id}
                data-section={s.id}
                onClick={() => scrollTo(s.id)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200"
                style={{
                  backgroundColor: isActive ? (isDanger ? 'rgba(255,59,48,0.1)' : 'var(--accent-alpha)') : 'var(--bg-primary)',
                  color: isActive ? (isDanger ? 'var(--danger)' : 'var(--accent)') : 'var(--text-secondary)',
                  border: isActive ? `1.5px solid ${isDanger ? 'var(--danger)' : 'var(--accent)'}` : '1.5px solid var(--border-light)',
                }}
              >
                {s.icon}
                {s.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex gap-8">
        {/* Desktop: Sticky sidebar */}
        <nav className="hidden lg:block w-52 flex-shrink-0">
          <div className="sticky top-24">
            <div
              className="rounded-2xl p-2 space-y-0.5"
              style={{
                backgroundColor: 'var(--bg-primary)',
                boxShadow: 'var(--card-shadow)',
                border: '1px solid var(--border-light)',
              }}
            >
              {sections.map(s => {
                const isActive = activeSection === s.id
                const isDanger = s.id === 'danger'
                return (
                  <button
                    key={s.id}
                    onClick={() => scrollTo(s.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 text-left"
                    style={{
                      backgroundColor: isActive
                        ? (isDanger ? 'rgba(255,59,48,0.08)' : 'var(--accent-alpha)')
                        : 'transparent',
                      color: isActive
                        ? (isDanger ? 'var(--danger)' : 'var(--accent)')
                        : (isDanger ? 'var(--danger)' : 'var(--text-secondary)'),
                    }}
                  >
                    {s.icon}
                    {s.label}
                    {isActive && (
                      <div
                        className="ml-auto w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: isDanger ? 'var(--danger)' : 'var(--accent)' }}
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </nav>

        {/* Section cards */}
        <div className="flex-1 min-w-0 space-y-6 pb-12">
          <ProfileSection />
          <AccountSection />
          <AppearanceSection />
          <NotificationsSection />
          <PrivacySection />
          <SecuritySection />
          <DangerZoneSection />
        </div>
      </div>
    </div>
  )
}
