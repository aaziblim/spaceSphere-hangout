import { useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import VerifiedBadge from '../components/VerifiedBadge'

// Get verification status from localStorage
function getVerificationStatus(): { isVerified: boolean; tier?: string } {
  try {
    const status = localStorage.getItem('verificationStatus')
    return status ? JSON.parse(status) : { isVerified: false }
  } catch {
    return { isVerified: false }
  }
}

export default function CreatorDashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const verificationStatus = getVerificationStatus()

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div
          className="rounded-2xl p-8 text-center"
          style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}
        >
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Sign in to view your dashboard</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            Access your creator analytics and insights
          </p>
          <button
            onClick={() => navigate('/login')}
            className="px-6 py-2.5 rounded-full font-medium text-white"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            Sign In
          </button>
        </div>
      </div>
    )
  }

  if (!verificationStatus.isVerified) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div
          className="rounded-2xl p-8 text-center"
          style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--brand-blue-alpha)' }}>
            <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="var(--brand-blue)" strokeWidth={1.5}>
              <path d="M12 15v2m0 0v2m0-2h2m-2 0H9m3-11V5m0 1a7 7 0 1 1 0 14 7 7 0 0 1 0-14z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Unlock Creator Analytics
          </h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            Get verified to access detailed analytics, insights, and track your growth over time.
          </p>
          <button
            onClick={() => navigate('/get-verified')}
            className="px-6 py-2.5 rounded-full font-medium text-white inline-flex items-center gap-2"
            style={{ backgroundColor: 'var(--brand-blue)' }}
          >
            <VerifiedBadge size="sm" className="[&_path]:fill-white" />
            Get Verified
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div
        className="rounded-2xl p-8 text-center"
        style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}
      >
        <div className="flex items-center justify-center gap-2 mb-2">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Creator Dashboard</h1>
          <VerifiedBadge size="md" />
        </div>
        <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
          Track your performance and grow your audience
        </p>

        <div className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
          <svg viewBox="0 0 24 24" className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }}>
            <path d="M3 3v18h18" />
            <path d="M7 16l4-4 4 4 5-5" />
          </svg>
        </div>

        <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Analytics Coming Soon</h2>
        <p className="text-sm max-w-md mx-auto mb-8" style={{ color: 'var(--text-secondary)' }}>
          We're building detailed analytics to help you understand your audience, track post performance, and measure growth. This feature is under active development.
        </p>

        <div className="grid sm:grid-cols-3 gap-4 max-w-lg mx-auto">
          <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
            <svg viewBox="0 0 24 24" className="w-6 h-6 mx-auto mb-2" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ color: 'var(--accent)' }}>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Post Views</p>
          </div>
          <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
            <svg viewBox="0 0 24 24" className="w-6 h-6 mx-auto mb-2" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ color: 'var(--accent)' }}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Audience Insights</p>
          </div>
          <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
            <svg viewBox="0 0 24 24" className="w-6 h-6 mx-auto mb-2" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ color: 'var(--accent)' }}>
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Growth Trends</p>
          </div>
        </div>
      </div>
    </div>
  )
}
