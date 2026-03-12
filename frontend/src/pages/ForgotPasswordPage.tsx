import { useState } from 'react'
import { Link } from 'react-router-dom'
import { requestPasswordReset } from '../api'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setStatus('loading')
    try {
      await requestPasswordReset(email.trim())
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--accent-alpha)', color: 'var(--accent)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Check your email</h1>
        <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
          If an account with <strong>{email}</strong> exists, we've sent a reset link. Check your inbox and spam folder.
        </p>
        <Link to="/login" className="text-sm font-medium hover:underline" style={{ color: 'var(--accent)' }}>
          Back to login
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto py-16 px-4">
      <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Forgot password</h1>
      <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
        Enter your email address and we'll send you a link to reset your password.
      </p>

      {status === 'error' && (
        <div className="p-4 rounded-xl mb-6 text-sm" style={{ backgroundColor: 'var(--danger-alpha)', color: 'var(--danger)' }}>
          Something went wrong. Please try again.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            className="w-full px-4 py-3 rounded-xl border text-sm outline-none transition-colors"
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        <button
          type="submit"
          disabled={status === 'loading'}
          className="w-full py-3 rounded-full text-white text-sm font-medium transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {status === 'loading' ? 'Sending...' : 'Send reset link'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
        Remember your password? <Link to="/login" className="font-medium hover:underline" style={{ color: 'var(--accent)' }}>Log in</Link>
      </p>
    </div>
  )
}
