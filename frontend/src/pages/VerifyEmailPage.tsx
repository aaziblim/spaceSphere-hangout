import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { verifyEmail, resendVerificationEmail } from '../api'
import { useAuth } from '../AuthContext'

export default function VerifyEmailPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { user, refresh } = useAuth()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [resending, setResending] = useState(false)

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('Invalid verification link.')
      return
    }

    verifyEmail(token)
      .then((res) => {
        setStatus('success')
        setMessage(res.detail)
        refresh().catch(() => {})
        setTimeout(() => navigate('/'), 2000)
      })
      .catch((err) => {
        setStatus('error')
        setMessage(err?.response?.data?.detail || 'Invalid or expired verification link.')
      })
  }, [token, navigate, refresh])

  const handleResend = async () => {
    if (!user) return
    setResending(true)
    try {
      await resendVerificationEmail()
      setMessage('Verification email sent! Check your inbox.')
    } catch {
      setMessage('Failed to resend. Please try again later.')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="max-w-md mx-auto py-16 px-4 text-center">
      {status === 'loading' && (
        <>
          <div className="w-12 h-12 mx-auto mb-6 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'transparent' }} />
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Verifying your email...</h1>
        </>
      )}

      {status === 'success' && (
        <>
          <div className="w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--success-alpha)', color: 'var(--success)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-8 h-8">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Email verified</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Redirecting to home...</p>
        </>
      )}

      {status === 'error' && (
        <>
          <div className="w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--danger-alpha)', color: 'var(--danger)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-8 h-8">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Verification failed</h1>
          <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>{message}</p>
          {user && (
            <button
              onClick={handleResend}
              disabled={resending}
              className="px-6 py-3 rounded-full text-white text-sm font-medium transition-all hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              {resending ? 'Sending...' : 'Resend verification email'}
            </button>
          )}
          <div className="mt-4">
            <Link to="/" className="text-sm font-medium hover:underline" style={{ color: 'var(--accent)' }}>Go home</Link>
          </div>
        </>
      )}
    </div>
  )
}
