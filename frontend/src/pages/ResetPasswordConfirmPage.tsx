import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { confirmPasswordReset } from '../api'

export default function ResetPasswordConfirmPage() {
  const { uid, token } = useParams<{ uid: string; token: string }>()
  const navigate = useNavigate()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errors, setErrors] = useState<string[]>([])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors([])

    if (newPassword !== confirmPassword) {
      setErrors(['Passwords do not match.'])
      return
    }
    if (newPassword.length < 8) {
      setErrors(['Password must be at least 8 characters.'])
      return
    }
    if (!uid || !token) {
      setErrors(['Invalid reset link.'])
      return
    }

    setStatus('loading')
    try {
      await confirmPasswordReset(uid, token, newPassword)
      setStatus('success')
      setTimeout(() => navigate('/login'), 2000)
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      if (Array.isArray(detail)) {
        setErrors(detail)
      } else if (typeof detail === 'string') {
        setErrors([detail])
      } else {
        setErrors(['Something went wrong. The link may have expired.'])
      }
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--success-alpha)', color: 'var(--success)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-8 h-8">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Password reset</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Redirecting to login...</p>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto py-16 px-4">
      <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Set new password</h1>
      <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>Choose a strong password for your account.</p>

      {errors.length > 0 && (
        <div className="p-4 rounded-xl mb-6 text-sm" style={{ backgroundColor: 'var(--danger-alpha)', color: 'var(--danger)' }}>
          {errors.map((err, i) => <p key={i}>{err}</p>)}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>New password</label>
          <input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-xl border text-sm outline-none transition-colors"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>Confirm password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-xl border text-sm outline-none transition-colors"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        <button
          type="submit"
          disabled={status === 'loading'}
          className="w-full py-3 rounded-full text-white text-sm font-medium transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {status === 'loading' ? 'Resetting...' : 'Reset password'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
        <Link to="/login" className="font-medium hover:underline" style={{ color: 'var(--accent)' }}>Back to login</Link>
      </p>
    </div>
  )
}
