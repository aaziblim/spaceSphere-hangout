import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { updateProfile, resendVerificationEmail } from '../../api'
import { useAuth } from '../../AuthContext'
import SettingsCard from './SettingsCard'

export default function AccountSection() {
  const { user, refresh } = useAuth()
  const [email, setEmail] = useState(user?.email ?? '')
  const [resendMsg, setResendMsg] = useState('')
  const isDirty = email !== (user?.email ?? '')

  const emailVerified = user?.profile?.email_verified ?? false

  const mutation = useMutation({
    mutationFn: () => updateProfile({ email }),
    onSuccess: () => {
      refresh()
    },
  })

  const resendMutation = useMutation({
    mutationFn: resendVerificationEmail,
    onSuccess: () => setResendMsg('Verification email sent!'),
    onError: () => setResendMsg('Failed to send. Try again later.'),
  })

  return (
    <SettingsCard
      id="account"
      title="Account"
      description="Manage your email and account details"
      onSave={() => mutation.mutate()}
      isSaving={mutation.isPending}
      isDirty={isDirty}
    >
      {mutation.isError && (
        <p className="text-sm mb-4" style={{ color: 'var(--danger)' }}>
          Failed to update email. Try again.
        </p>
      )}
      {mutation.isSuccess && (
        <p className="text-sm mb-4" style={{ color: 'var(--success)' }}>
          Email updated. Please verify your new email address.
        </p>
      )}

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          Email address
        </label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-colors"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-light)',
            color: 'var(--text-primary)',
          }}
        />
      </div>

      {/* Verification status */}
      <div
        className="flex items-center justify-between px-4 py-3 rounded-xl"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <div className="flex items-center gap-2">
          {emailVerified ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" style={{ color: 'var(--success)' }}>
                <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={2} />
              </svg>
              <span className="text-sm font-medium" style={{ color: 'var(--success)' }}>
                Email verified
              </span>
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" style={{ color: 'var(--warning)' }}>
                <path d="M12 9v2m0 4h.01" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={2} />
              </svg>
              <span className="text-sm font-medium" style={{ color: 'var(--warning)' }}>
                Email not verified
              </span>
            </>
          )}
        </div>
        {!emailVerified && (
          <button
            onClick={() => resendMutation.mutate()}
            disabled={resendMutation.isPending}
            className="text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--accent)' }}
          >
            {resendMutation.isPending ? 'Sending...' : 'Resend'}
          </button>
        )}
      </div>
      {resendMsg && (
        <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
          {resendMsg}
        </p>
      )}

      {isDirty && (
        <p className="text-xs mt-3" style={{ color: 'var(--warning)' }}>
          Changing your email will require re-verification.
        </p>
      )}
    </SettingsCard>
  )
}
