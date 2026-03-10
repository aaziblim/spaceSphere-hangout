import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { useTheme } from '../ThemeContext'
import { ChatDrawer, ChatButton, useChatUnread } from './Chat'
import NotificationBell from './NotificationBell'

export default function Navbar() {
  const { user, logout, loading } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [chatOpen, setChatOpen] = useState(false)
  const unreadCount = useChatUnread()

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 border-b backdrop-blur-lg"
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)',
          borderColor: 'var(--border)'
        }}
      >
        <div className="max-w-5xl mx-auto px-4">
          <div className="h-14 flex items-center justify-between">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2">
              <img src="/spherespace-logo.svg" alt="Spherespace Logo" className="w-8 h-8" />
              <span className="text-xl font-bold tracking-tight hidden sm:block" style={{ color: 'var(--text-primary)', fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif' }}>
                Spherespace
              </span>
            </Link>

            {/* Right side */}
            <div className="flex items-center gap-2">
              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" />
                    <line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                )}
              </button>

              {loading ? (
                <div className="w-9 h-9 rounded-full skeleton" />
              ) : user ? (
                <>
                  {/* Notifications */}
                  <NotificationBell />

                  {/* Chat button */}
                  <ChatButton onClick={() => setChatOpen(true)} unreadCount={unreadCount} />

                  {/* Create button - desktop */}
                  <Link
                    to="/posts/new"
                    className="hidden md:flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-sm font-medium transition-all hover:opacity-90 active:scale-95"
                    style={{ backgroundColor: 'var(--accent)' }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span>New Post</span>
                  </Link>

                  {/* Profile dropdown */}
                  <div className="relative group">
                    <button className="flex items-center" aria-label="Profile menu">
                      <div className="w-9 h-9 rounded-full overflow-hidden border-2 transition-colors" style={{ borderColor: 'var(--border)' }}>
                        {user.profile?.image ? (
                          <img src={user.profile.image} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white font-semibold text-sm" style={{ backgroundColor: 'var(--accent)' }}>
                            {user.username.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                      </div>
                    </button>

                    {/* Dropdown */}
                    <div
                      className="absolute right-0 top-full mt-2 w-52 py-1 rounded-xl border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all shadow-lg"
                      style={{
                        backgroundColor: 'var(--bg-primary)',
                        borderColor: 'var(--border)'
                      }}
                    >
                      <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                        <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{user.username}</p>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{user.email}</p>
                      </div>
                      <Link to={`/user/${user.username}`} className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-[var(--bg-tertiary)]" style={{ color: 'var(--text-primary)' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                        View Profile
                      </Link>
                      <Link to="/?tab=saved" className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-[var(--bg-tertiary)]" style={{ color: '#F59E0B' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
                          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                        </svg>
                        Saved Posts
                      </Link>
                      <Link to="/dashboard" className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-[var(--bg-tertiary)]" style={{ color: 'var(--text-primary)' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
                          <path d="M3 3v18h18" />
                          <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
                        </svg>
                        Dashboard
                      </Link>
                      <Link to="/get-verified" className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-[var(--bg-tertiary)]" style={{ color: 'var(--accent)' }}>
                        <svg viewBox="0 0 22 22" className="w-4 h-4">
                          <path fill="var(--accent)" d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681.132-.637.075-1.299-.165-1.903.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" />
                        </svg>
                        Get Verified
                      </Link>
                      <Link to="/settings" className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-[var(--bg-tertiary)]" style={{ color: 'var(--text-primary)' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
                          <circle cx="12" cy="12" r="3" />
                          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                        Settings
                      </Link>
                      <hr style={{ borderColor: 'var(--border)' }} />
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-[var(--bg-tertiary)]"
                        style={{ color: 'var(--danger)' }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                          <polyline points="16 17 21 12 16 7" />
                          <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                        Log out
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <Link
                    to="/login"
                    className="px-4 py-2 text-sm font-medium transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Log in
                  </Link>
                  <Link
                    to="/register"
                    className="px-4 py-2 rounded-full text-white text-sm font-medium transition-all hover:opacity-90 active:scale-95"
                    style={{ backgroundColor: 'var(--accent)' }}
                  >
                    Sign up
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Chat Drawer - Outside nav to avoid z-index/overflow issues */}
      <ChatDrawer isOpen={chatOpen} onClose={() => setChatOpen(false)} />
    </>
  )
}
