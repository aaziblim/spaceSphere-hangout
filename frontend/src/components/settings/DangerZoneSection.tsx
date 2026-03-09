import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { deleteAccount } from '../../api'
import { useAuth } from '../../AuthContext'
import SettingsCard from './SettingsCard'
import { ConfirmationModal } from '../ConfirmationModal'

export default function DangerZoneSection() {
  const { logout } = useAuth()
  const [showConfirm, setShowConfirm] = useState(false)
  const [showPasswordStep, setShowPasswordStep] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => deleteAccount(password),
    onSuccess: () => {
      logout()
      window.location.href = '/'
    },
    onError: (err: any) => {
      setError(err?.response?.data?.detail ?? 'Failed to delete account.')
    },
  })

  const handleConfirm = () => {
    setShowConfirm(false)
    setShowPasswordStep(true)
    setPassword('')
    setError('')
  }

  const handleDelete = () => {
    if (!password) {
      setError('Password is required.')
      return
    }
    mutation.mutate()
  }

  return (
    <>
      <SettingsCard
        id="danger"
        title="Danger Zone"
        description="Irreversible actions"
        danger
      >
        <div
          className="flex items-center justify-between py-4 px-4 rounded-xl"
          style={{ backgroundColor: 'rgba(255,59,48,0.05)' }}
        >
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Delete account
            </p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Permanently delete your account and all data. This cannot be undone.
            </p>
          </div>
          <button
            onClick={() => setShowConfirm(true)}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white flex-shrink-0 transition-all active:scale-95"
            style={{ backgroundColor: 'var(--danger)' }}
          >
            Delete
          </button>
        </div>

        {/* Password confirmation step */}
        {showPasswordStep && (
          <div className="mt-4 p-4 rounded-xl" style={{ border: '1px solid var(--danger)', backgroundColor: 'var(--bg-secondary)' }}>
            <p className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
              Enter your password to confirm deletion
            </p>
            {error && (
              <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{error}</p>
            )}
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-sm outline-none mb-3"
              style={{
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                color: 'var(--text-primary)',
              }}
              placeholder="Your password"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowPasswordStep(false); setPassword(''); setError('') }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{ color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={mutation.isPending}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-50"
                style={{ backgroundColor: 'var(--danger)' }}
              >
                {mutation.isPending ? 'Deleting...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        )}
      </SettingsCard>

      <ConfirmationModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleConfirm}
        title="Delete your account?"
        description="This will permanently delete your account, posts, comments, and all associated data. This action cannot be undone."
        confirmText="Continue"
        isDestructive
      />
    </>
  )
}
