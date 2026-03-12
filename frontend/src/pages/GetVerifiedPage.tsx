import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import VerifiedBadge from '../components/VerifiedBadge'
import api from '../api'

// Verification tiers
const TIERS = [
  {
    id: 'basic',
    name: 'Blue',
    price: 8,
    annual: 80,
    description: 'For individuals',
    features: ['Blue verified badge', 'Edit posts', 'Longer posts (10k chars)', 'Bookmark folders', 'Creator analytics'],
    color: 'var(--brand-blue)',
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 16,
    annual: 160,
    description: 'For creators',
    features: ['Everything in Blue', 'Priority in replies', 'Half ads in feed', 'Longer video uploads', 'Early feature access', 'Priority support'],
    color: 'var(--brand-blue)',
    popular: true,
  },
  {
    id: 'organization',
    name: 'Organization',
    price: 200,
    annual: 2000,
    description: 'For businesses',
    features: ['Everything in Premium', 'Gold badge', 'Affiliate accounts', 'Custom branding', 'Advanced analytics', 'Account manager'],
    color: 'var(--warning)',
  },
]

interface Subscription {
  tier: string
  tier_display: string
  status: string
  expires_at: string
  is_active: boolean
}

export default function GetVerifiedPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [selectedTier, setSelectedTier] = useState('premium')
  const [billing, setBilling] = useState<'monthly' | 'annual'>('annual')
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  // Check for success redirect
  const success = searchParams.get('success') === 'true'

  // Fetch subscription
  useEffect(() => {
    const fetch = async () => {
      if (!user) { setLoading(false); return }
      try {
        const { data } = await api.get('/payments/subscription/')
        if (data.has_subscription) setSubscription(data.subscription)
      } catch { }
      setLoading(false)
    }
    fetch()
  }, [user])

  const handleSubscribe = () => {
    if (!user) {
      navigate('/login')
      return
    }
    navigate(`/checkout?tier=${selectedTier}&billing=${billing}`)
  }

  const handleCancel = async () => {
    setCancelling(true)
    try {
      const { data } = await api.post('/payments/subscription/cancel/')
      setSubscription(data.subscription)
      setShowCancelModal(false)
    } catch { }
    setCancelling(false)
  }

  const currentTier = TIERS.find(t => t.id === selectedTier)!

  // Not logged in
  if (!user) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-24 h-24 mx-auto mb-8 rounded-full flex items-center justify-center" style={{ background: 'var(--gradient-verified)' }}>
            <VerifiedBadge size="lg" className="w-12 h-12 [&_path]:fill-white" />
          </div>
          <h1 className="text-3xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Get Verified</h1>
          <p className="text-lg mb-10" style={{ color: 'var(--text-secondary)' }}>Sign in to subscribe and unlock premium features</p>
          <button onClick={() => navigate('/login')} className="w-full py-4 rounded-full font-semibold text-white text-lg mb-4" style={{ background: 'var(--gradient-verified)' }}>
            Sign in
          </button>
          <button onClick={() => navigate('/register')} className="w-full py-4 rounded-full font-semibold text-lg border-2" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
            Create account
          </button>
        </div>
      </div>
    )
  }

  // Loading
  if (loading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Success screen
  if (success) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="relative w-28 h-28 mx-auto mb-8">
            <div className="absolute inset-0 rounded-full animate-ping opacity-25" style={{ backgroundColor: 'var(--brand-blue)' }} />
            <div className="relative w-full h-full rounded-full flex items-center justify-center" style={{ background: 'var(--gradient-verified)' }}>
              <VerifiedBadge size="lg" className="w-14 h-14 [&_path]:fill-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Welcome to Verified</h1>
          <p className="text-lg mb-4" style={{ color: 'var(--text-secondary)' }}>Your badge is now active!</p>
          <p className="text-sm mb-10" style={{ color: 'var(--text-tertiary)' }}>📧 A confirmation email has been sent to {user.email}</p>
          <button onClick={() => navigate(`/user/${user.username}`)} className="w-full py-4 rounded-full font-semibold text-white text-lg" style={{ background: 'var(--gradient-verified)' }}>
            View your profile
          </button>
        </div>
      </div>
    )
  }

  // Already subscribed
  if (subscription?.is_active) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-24 h-24 mx-auto mb-8 rounded-full flex items-center justify-center" style={{ background: 'var(--gradient-verified)' }}>
            <VerifiedBadge size="lg" className="w-12 h-12 [&_path]:fill-white" />
          </div>
          <h1 className="text-3xl font-bold mb-2 flex items-center justify-center gap-3" style={{ color: 'var(--text-primary)' }}>
            You're verified <VerifiedBadge size="lg" />
          </h1>
          <p className="text-lg mb-1" style={{ color: 'var(--text-secondary)' }}>{subscription.tier_display} subscription</p>
          <p className="text-sm mb-8" style={{ color: 'var(--text-tertiary)' }}>
            {subscription.status === 'cancelled' ? 'Expires' : 'Renews'} {new Date(subscription.expires_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>

          {subscription.status === 'cancelled' && (
            <div className="mb-6 px-4 py-3 rounded-xl" style={{ backgroundColor: 'var(--warning-alpha)' }}>
              <p className="text-sm" style={{ color: 'var(--warning)' }}>⚠️ Subscription cancelled</p>
            </div>
          )}

          <button onClick={() => navigate(`/user/${user.username}`)} className="w-full py-4 rounded-full font-semibold text-white text-lg mb-4" style={{ background: 'var(--gradient-verified)' }}>
            View profile
          </button>

          {subscription.status !== 'cancelled' && (
            <button onClick={() => setShowCancelModal(true)} className="w-full py-4 rounded-full font-semibold text-lg" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
              Cancel subscription
            </button>
          )}

          {/* Cancel Modal */}
          {showCancelModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="max-w-sm w-full rounded-3xl p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
                <h3 className="text-xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Cancel subscription?</h3>
                <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
                  Your badge stays active until {new Date(subscription.expires_at).toLocaleDateString()}.
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setShowCancelModal(false)} className="flex-1 py-3 rounded-full font-semibold" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>Keep</button>
                  <button onClick={handleCancel} disabled={cancelling} className="flex-1 py-3 rounded-full font-semibold text-white" style={{ backgroundColor: 'var(--danger)' }}>
                    {cancelling ? '...' : 'Cancel'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Main pricing page
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="text-center mb-12">
        <VerifiedBadge size="lg" className="mx-auto mb-5" />
        <h1 className="text-4xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Get Verified</h1>
        <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>Unlock premium features and stand out</p>
      </div>

      {/* Billing Toggle */}
      <div className="flex justify-center mb-10">
        <div className="inline-flex p-1.5 rounded-full gap-1" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
          <button onClick={() => setBilling('monthly')} className="px-6 py-3 rounded-full text-sm font-semibold transition-all" style={{ backgroundColor: billing === 'monthly' ? 'var(--bg-primary)' : 'transparent', color: billing === 'monthly' ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
            Monthly
          </button>
          <button onClick={() => setBilling('annual')} className="px-6 py-3 rounded-full text-sm font-semibold transition-all flex items-center gap-2" style={{ backgroundColor: billing === 'annual' ? 'var(--bg-primary)' : 'transparent', color: billing === 'annual' ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
            Annual <span className="px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{ backgroundColor: 'var(--success)' }}>-17%</span>
          </button>
        </div>
      </div>

      {/* Tier Cards */}
      <div className="grid md:grid-cols-3 gap-4 mb-12">
        {TIERS.map(tier => {
          const isSelected = selectedTier === tier.id
          const price = billing === 'annual' ? Math.round(tier.annual / 12) : tier.price

          return (
            <button
              key={tier.id}
              onClick={() => setSelectedTier(tier.id)}
              className={`relative p-6 rounded-2xl text-left transition-all border-2 ${isSelected ? 'border-[var(--brand-blue)] scale-[1.02]' : 'border-transparent hover:border-[var(--border)]'}`}
              style={{ backgroundColor: isSelected ? 'var(--brand-blue-alpha)' : 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}
            >
              {tier.popular && (
                <span className="absolute -top-3 right-4 px-3 py-1 rounded-full text-xs font-bold text-white" style={{ backgroundColor: 'var(--brand-blue)' }}>Popular</span>
              )}

              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${tier.color} 0%, ${tier.id === 'organization' ? 'var(--warning)' : 'var(--action-blue)'} 100%)` }}>
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="white" strokeWidth={3}><path d="M20 6L9 17l-5-5" /></svg>
                </div>
                <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{tier.name}</span>
              </div>

              <p className="text-xs mb-4" style={{ color: 'var(--text-tertiary)' }}>{tier.description}</p>

              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>${price}</span>
                <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>/mo</span>
              </div>

              <ul className="space-y-2">
                {tier.features.slice(0, 3).map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="var(--brand-blue)" strokeWidth={3}><path d="M20 6L9 17l-5-5" /></svg>
                    {f}
                  </li>
                ))}
              </ul>

              {/* Selection indicator */}
              <div className={`absolute top-5 right-5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-[var(--brand-blue)] bg-[var(--brand-blue)]' : 'border-[var(--border)]'}`}>
                {isSelected && <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="white" strokeWidth={3}><path d="M20 6L9 17l-5-5" /></svg>}
              </div>
            </button>
          )
        })}
      </div>

      {/* Subscribe Button */}
      <div className="max-w-md mx-auto">
        <button
          onClick={handleSubscribe}
          className="w-full py-4 rounded-full font-semibold text-white text-lg transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ background: `linear-gradient(135deg, ${currentTier.color} 0%, ${currentTier.id === 'organization' ? 'var(--warning)' : 'var(--action-blue)'} 100%)` }}
        >
          Subscribe for ${billing === 'annual' ? currentTier.annual : currentTier.price}/{billing === 'annual' ? 'year' : 'month'}
        </button>
        <p className="text-center text-sm mt-4" style={{ color: 'var(--text-tertiary)' }}>
          Cancel anytime · Secure payment
        </p>
      </div>
    </div>
  )
}
