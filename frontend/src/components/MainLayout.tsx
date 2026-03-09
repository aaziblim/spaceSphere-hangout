import { useState } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import Navbar from './Navbar'
import { LeftSidebar, RightSidebar } from './Sidebars'
import MobileMenuSheet from './MobileMenuSheet'
import { ChatDrawer, useChatUnread } from './Chat'
import { useAuth } from '../AuthContext'
import EmailVerificationBanner from './EmailVerificationBanner'

export default function MainLayout() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <Navbar />
      <div className="pt-16 pb-20 lg:pb-8">
        <div className="max-w-7xl mx-auto px-4 flex gap-6">
          {/* Left Sidebar - Desktop only */}
          <LeftSidebar />

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            <EmailVerificationBanner />
            <Outlet />
          </main>

          {/* Right Sidebar - Wide desktop only */}
          <RightSidebar />
        </div>
      </div>
      <MobileNav />
    </div>
  )
}

function MobileNav() {
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const { user } = useAuth()
  const unreadCount = useChatUnread()

  interface NavItem {
    href?: string
    icon: string
    label: string
    isCreate?: boolean
    isMessages?: boolean
    badge?: number
    isMenu?: boolean
    isLive?: boolean
  }

  const navItems: NavItem[] = [
    { href: '/', icon: 'home', label: 'Home' },
    { href: '/explore', icon: 'search', label: 'Explore' },
    { href: '/posts/new', icon: 'plus', label: 'New', isCreate: true },
    { icon: 'messages', label: 'Chat', isMessages: true, badge: unreadCount },
    { icon: 'menu', label: 'More', isMenu: true },
  ]

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden border-t" style={{
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border)'
      }}>
        <div className="flex items-center justify-around h-14 px-2 max-w-lg mx-auto">
          {navItems.map(item => (
            <NavIcon
              key={item.href || item.icon}
              href={item.href}
              icon={item.icon}
              label={item.label}
              isActive={item.href ? (location.pathname === item.href || (item.href === '/live' && location.pathname.startsWith('/live'))) : false}
              isCreate={item.isCreate}
              isLive={item.isLive}
              isMenu={item.isMenu}
              isMessages={item.isMessages}
              badge={item.badge}
              onMenuClick={() => setMenuOpen(true)}
              onMessagesClick={() => user && setChatOpen(true)}
            />
          ))}
        </div>
      </nav>

      <MobileMenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
      <ChatDrawer isOpen={chatOpen} onClose={() => setChatOpen(false)} />
    </>
  )
}

function NavIcon({ href, icon, label, isActive, isCreate, isLive, isMenu, isMessages, badge, onMenuClick, onMessagesClick }: {
  href?: string
  icon: string
  label: string
  isActive: boolean
  isCreate?: boolean
  isLive?: boolean
  isMenu?: boolean
  isMessages?: boolean
  badge?: number
  onMenuClick?: () => void
  onMessagesClick?: () => void
}) {
  const icons: Record<string, React.ReactNode> = {
    home: (
      <svg viewBox="0 0 24 24" fill={isActive ? "currentColor" : "none"} stroke="currentColor" strokeWidth={isActive ? 0 : 1.5} className="w-6 h-6">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
    search: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isActive ? 2 : 1.5} className="w-6 h-6">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
    ),
    messages: (
      <svg viewBox="0 0 24 24" fill={isActive ? "currentColor" : "none"} stroke="currentColor" strokeWidth={isActive ? 0 : 1.5} className="w-6 h-6">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    live: (
      <svg viewBox="0 0 24 24" fill={isActive ? "currentColor" : "none"} stroke="currentColor" strokeWidth={isActive ? 0 : 1.5} className="w-6 h-6">
        <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
      </svg>
    ),
    plus: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    ),
    menu: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6">
        <circle cx="12" cy="5" r="1.5" fill="currentColor" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        <circle cx="12" cy="19" r="1.5" fill="currentColor" />
      </svg>
    ),
    user: (
      <svg viewBox="0 0 24 24" fill={isActive ? "currentColor" : "none"} stroke="currentColor" strokeWidth={isActive ? 0 : 1.5} className="w-6 h-6">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  }

  if (isCreate) {
    return (
      <Link
        to={href!}
        className="w-10 h-10 rounded-full flex items-center justify-center text-white transition-transform active:scale-95"
        style={{ backgroundColor: 'var(--accent)' }}
      >
        {icons[icon]}
      </Link>
    )
  }

  if (isMessages) {
    return (
      <button
        onClick={onMessagesClick}
        className="flex flex-col items-center gap-0.5 py-1 px-3 relative"
        style={{ color: 'var(--text-secondary)' }}
      >
        {icons[icon]}
        <span className="text-[10px] font-medium">{label}</span>
        {badge !== undefined && badge > 0 && (
          <span
            className="absolute top-0 right-1.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white"
            style={{ backgroundColor: 'var(--danger)' }}
          >
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>
    )
  }

  if (isMenu) {
    return (
      <button
        onClick={onMenuClick}
        className="flex flex-col items-center gap-0.5 py-1 px-3"
        style={{ color: 'var(--text-secondary)' }}
      >
        {icons[icon]}
        <span className="text-[10px] font-medium">{label}</span>
      </button>
    )
  }

  if (isLive) {
    return (
      <Link
        to={href!}
        className="flex flex-col items-center gap-0.5 py-1 px-3 relative"
        style={{ color: isActive ? '#ef4444' : 'var(--text-secondary)' }}
      >
        {icons[icon]}
        <span className="text-[10px] font-medium">{label}</span>
        {/* Live indicator dot */}
        <span
          className="absolute top-0.5 right-2 w-2 h-2 rounded-full"
          style={{ backgroundColor: '#ef4444' }}
        />
      </Link>
    )
  }

  return (
    <Link
      to={href!}
      className="flex flex-col items-center gap-0.5 py-1 px-3"
      style={{ color: isActive ? 'var(--accent)' : 'var(--text-secondary)' }}
    >
      {icons[icon]}
      <span className="text-[10px] font-medium">{label}</span>
    </Link>
  )
}
