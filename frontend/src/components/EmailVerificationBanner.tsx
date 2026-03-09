import { useState } from 'react'
import { useAuth } from '../AuthContext'
import { resendVerificationEmail } from '../api'

export default function EmailVerificationBanner() {
  const { user } = useAuth()
  const [resent, setResent] = useState(false)
  const [sending, setSending] = useState(false)

  if (!user || user.profile?.email_verified) return null

  const handleResend = async () => {
    setSending(true)
    try {
      await resendVerificationEmail()
      setResent(true)
    } catch {
      // silently fail
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="mb-4 px-4 py-3 rounded-xl text-sm flex items-center justify-between gap-3"
      style={{ backgroundColor: 'rgba(255, 159, 10, 0.1)', color: '#f59e0b' }}
    >
      <p>
        Please verify your email address. Check your inbox for a verification link.
      </p>
      <button
        onClick={handleResend}
        disabled={sending || resent}
        className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:opacity-80 disabled:opacity-50"
        style={{ backgroundColor: '#f59e0b', color: '#fff' }}
      >
        {resent ? 'Sent!' : sending ? 'Sending...' : 'Resend'}
      </button>
    </div>
  )
}
