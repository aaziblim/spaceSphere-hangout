import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { changePassword } from '../../api'
import SettingsCard from './SettingsCard'

export default function SecuritySection() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')

  const isDirty = currentPassword.length > 0 && newPassword.length > 0 && confirmPassword.length > 0

  const mutation = useMutation({
    mutationFn: () => changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setError('')
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail
      if (Array.isArray(detail)) {
        setError(detail.join(' '))
      } else if (typeof detail === 'string') {
        setError(detail)
      } else {
        setError('Failed to change password.')
      }
    },
  })

  const handleSave = () => {
    setError('')
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    mutation.mutate()
  }

  return (
    <SettingsCard
      id="security"
      title="Security"
      description="Manage your password"
      onSave={handleSave}
      isSaving={mutation.isPending}
      isDirty={isDirty}
      saveLabel="Change Password"
    >
      {mutation.isSuccess && (
        <p className="text-sm mb-4" style={{ color: 'var(--success)' }}>
          Password changed successfully.
        </p>
      )}
      {error && (
        <p className="text-sm mb-4" style={{ color: 'var(--danger)' }}>{error}</p>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            Current password
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-xl text-sm outline-none"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-light)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            New password
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-xl text-sm outline-none"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-light)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            Confirm new password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-xl text-sm outline-none"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-light)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
      </div>
    </SettingsCard>
  )
}
