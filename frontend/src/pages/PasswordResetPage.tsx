import { useState } from 'react'
import { useAuth } from '../AuthContext'
import { Link } from 'react-router-dom'

const apiBase = import.meta.env.VITE_API_BASE ?? '/api'

export default function PasswordResetPage() {
  const { user } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errors, setErrors] = useState<string[]>([])

  if (!user) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center">
        <h1 className="text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Change Password</h1>
        <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>You need to be logged in to change your password.</p>
        <Link
          to="/login"
          className="px-6 py-3 rounded-full text-white text-sm font-medium transition-all hover:opacity-90"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          Log in
        </Link>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors([])

    if (newPassword !== confirmPassword) {
      setErrors(['New passwords do not match.'])
      return
    }

    if (newPassword.length < 8) {
      setErrors(['Password must be at least 8 characters.'])
      return
    }

    setStatus('loading')
    try {
      const csrfMatch = document.cookie.match(/csrftoken=([^;]+)/)
      const res = await fetch(`${apiBase}/auth/password/`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfMatch ? { 'X-CSRFToken': csrfMatch[1] } : {}),
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      })

      if (res.ok) {
        setStatus('success')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        const data = await res.json()
        const detail = data.detail
        if (Array.isArray(detail)) {
          setErrors(detail)
        } else if (typeof detail === 'string') {
          setErrors([detail])
        } else {
          setErrors(['Something went wrong. Please try again.'])
        }
        setStatus('error')
      }
    } catch {
      setErrors(['Network error. Please try again.'])
      setStatus('error')
    }
  }

  return (
    <div className="max-w-md mx-auto py-12 px-4">
      <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Change Password</h1>
      <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
        Update your account password. You'll stay logged in after the change.
      </p>

      {status === 'success' && (
        <div className="p-4 rounded-xl mb-6 text-sm font-medium" style={{ backgroundColor: 'var(--success-alpha)', color: 'var(--success)' }}>
          Password changed successfully.
        </div>
      )}

      {errors.length > 0 && (
        <div className="p-4 rounded-xl mb-6 text-sm" style={{ backgroundColor: 'var(--danger-alpha)', color: 'var(--danger)' }}>
          {errors.map((err, i) => (
            <p key={i}>{err}</p>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
            Current password
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-xl border text-sm outline-none transition-colors"
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
            New password
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-xl border text-sm outline-none transition-colors"
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
            Confirm new password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            required
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
          {status === 'loading' ? 'Changing...' : 'Change password'}
        </button>
      </form>
    </div>
  )
}
