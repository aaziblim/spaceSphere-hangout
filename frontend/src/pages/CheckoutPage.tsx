import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import VerifiedBadge from '../components/VerifiedBadge'
import api, { fetchCsrf } from '../api'

// Pricing tiers
const TIERS = {
    basic: { name: 'Blue', price: 8, annual: 80, color: 'var(--brand-blue)' },
    premium: { name: 'Premium', price: 16, annual: 160, color: 'var(--brand-blue)' },
    organization: { name: 'Organization', price: 200, annual: 2000, color: 'var(--warning)' },
}

// Paystack Public Key (TEST MODE)
const PAYSTACK_PUBLIC_KEY = 'pk_test_67f7f38622f9793ca14f8714a4ea33cc6e46a1a9'
// MoMo providers
const MOMO_PROVIDERS = [
    { id: 'mtn', name: 'MTN MoMo', color: '#FFCC00', icon: '📱' },
    { id: 'vod', name: 'Vodafone Cash', color: '#E60000', icon: '📱' },
    { id: 'tgo', name: 'AirtelTigo', color: '#FF0000', icon: '📱' },
]

// Test credentials
const TEST = {
    card: '4084 0841 9095 5041',
    momo: '0551234987',
}

export default function CheckoutPage() {
    const { user } = useAuth()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()

    // Get tier and billing from URL
    const tier = searchParams.get('tier') || 'premium'
    const billing = (searchParams.get('billing') || 'annual') as 'monthly' | 'annual'
    const tierInfo = TIERS[tier as keyof typeof TIERS] || TIERS.premium

    // State
    const [step, setStep] = useState<'method' | 'payment'>('method')
    const [paymentMethod, setPaymentMethod] = useState<'card' | 'momo'>('card')
    const [momoProvider, setMomoProvider] = useState('mtn')
    const [phone, setPhone] = useState('')
    const [isProcessing, setIsProcessing] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Calculate price
    const amount = billing === 'annual' ? tierInfo.annual : tierInfo.price
    const currency = paymentMethod === 'momo' ? 'GHS' : 'USD'

    // Redirect if not logged in
    useEffect(() => {
        if (!user) {
            navigate('/login?redirect=/checkout?' + searchParams.toString())
        }
    }, [user, navigate, searchParams])

    const handlePayment = async () => {
        if (paymentMethod === 'momo' && phone.length < 10) {
            setError('Please enter a valid phone number')
            return
        }

        setIsProcessing(true)
        setError(null)

        try {
            // Ensure CSRF cookie is set
            await fetchCsrf()

            // Get CSRF token from cookie
            const getCsrfToken = () => {
                const match = document.cookie.match(/csrftoken=([^;]+)/)
                return match ? match[1] : ''
            }

            // Initialize payment with backend (with explicit CSRF header)
            const { data } = await api.post('/payments/initialize/', {
                tier,
                billing_cycle: billing,
                payment_method: paymentMethod === 'momo' ? 'mobile_money' : 'card',
                phone_number: paymentMethod === 'momo' ? phone : undefined,
                momo_provider: paymentMethod === 'momo' ? momoProvider : undefined,
            }, {
                headers: {
                    'X-CSRFToken': getCsrfToken()
                }
            })

            // Load Paystack
            if (!(window as any).PaystackPop) {
                const script = document.createElement('script')
                script.src = 'https://js.paystack.co/v1/inline.js'
                await new Promise((resolve, reject) => {
                    script.onload = resolve
                    script.onerror = reject
                    document.body.appendChild(script)
                })
            }

            // Configure Paystack
            const config: any = {
                key: data.public_key || PAYSTACK_PUBLIC_KEY,
                email: user!.email,
                amount: data.amount,
                currency: data.currency,
                ref: data.reference,
                channels: [paymentMethod === 'momo' ? 'mobile_money' : 'card'],
                callback: async (response: { reference: string }) => {
                    // Verify payment
                    try {
                        await api.post(`/payments/verify/${response.reference}/`)
                        navigate('/get-verified?success=true')
                    } catch {
                        setError('Payment verification failed')
                        setIsProcessing(false)
                    }
                },
                onClose: () => {
                    setIsProcessing(false)
                }
            }

            if (paymentMethod === 'momo') {
                config.mobile_money = { phone, provider: momoProvider }
            }

            const handler = (window as any).PaystackPop.setup(config)
            handler.openIframe()

        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to initialize payment')
            setIsProcessing(false)
        }
    }

    if (!user) return null

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <div className="w-full max-w-md">

                {/* Back Button */}
                <button
                    onClick={() => step === 'payment' ? setStep('method') : navigate('/get-verified')}
                    className="flex items-center gap-2 mb-6 text-sm font-medium transition-opacity hover:opacity-70"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                    {step === 'payment' ? 'Change payment method' : 'Back to plans'}
                </button>

                {/* Card */}
                <div
                    className="rounded-3xl overflow-hidden"
                    style={{ backgroundColor: 'var(--bg-primary)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15)' }}
                >
                    {/* Header */}
                    <div
                        className="p-6 text-center text-white"
                        style={{ background: `linear-gradient(135deg, ${tierInfo.color} 0%, ${tier === 'organization' ? 'var(--warning)' : 'var(--action-blue)'} 100%)` }}
                    >
                        <VerifiedBadge size="lg" className="mx-auto mb-3 [&_path]:fill-white" />
                        <h1 className="text-2xl font-bold mb-1">{tierInfo.name}</h1>
                        <p className="text-white/80 text-sm">
                            {billing === 'annual' ? 'Annual subscription' : 'Monthly subscription'}
                        </p>
                    </div>

                    {/* Price */}
                    <div className="p-6 text-center border-b" style={{ borderColor: 'var(--border)' }}>
                        <div className="flex items-baseline justify-center gap-1">
                            <span className="text-4xl font-bold" style={{ color: 'var(--text-primary)' }}>${amount}</span>
                            <span style={{ color: 'var(--text-tertiary)' }}>/{billing === 'annual' ? 'year' : 'month'}</span>
                        </div>
                        {billing === 'annual' && (
                            <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
                                ~${(amount / 12).toFixed(2)}/month · Save 17%
                            </p>
                        )}
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="mx-6 mt-6 p-4 rounded-xl text-sm text-center" style={{ backgroundColor: 'var(--danger-alpha)', color: 'var(--danger)' }}>
                            {error}
                        </div>
                    )}

                    {/* Step 1: Payment Method Selection */}
                    {step === 'method' && (
                        <div className="p-6">
                            <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                                How would you like to pay?
                            </h2>

                            <div className="space-y-3">
                                {/* Card Option */}
                                <button
                                    onClick={() => { setPaymentMethod('card'); setStep('payment') }}
                                    className="w-full p-4 rounded-2xl flex items-center gap-4 transition-all hover:scale-[1.02] active:scale-[0.98]"
                                    style={{ backgroundColor: 'var(--bg-tertiary)' }}
                                >
                                    <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-violet-500 to-purple-600">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} className="w-6 h-6">
                                            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                                            <line x1="1" y1="10" x2="23" y2="10" />
                                        </svg>
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Credit or Debit Card</p>
                                        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Visa, Mastercard, Amex</p>
                                    </div>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }}>
                                        <path d="M9 18l6-6-6-6" />
                                    </svg>
                                </button>

                                {/* MoMo Option */}
                                <button
                                    onClick={() => { setPaymentMethod('momo'); setStep('payment') }}
                                    className="w-full p-4 rounded-2xl flex items-center gap-4 transition-all hover:scale-[1.02] active:scale-[0.98]"
                                    style={{ backgroundColor: 'var(--bg-tertiary)' }}
                                >
                                    <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#FFCC00' }}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth={2} className="w-6 h-6">
                                            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                                            <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth={3} />
                                        </svg>
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Mobile Money</p>
                                        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>MTN, Vodafone, AirtelTigo</p>
                                    </div>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }}>
                                        <path d="M9 18l6-6-6-6" />
                                    </svg>
                                </button>
                            </div>

                            <p className="text-center text-xs mt-6" style={{ color: 'var(--text-tertiary)' }}>
                                🔒 Secured by Paystack
                            </p>
                        </div>
                    )}

                    {/* Step 2: Payment Form */}
                    {step === 'payment' && (
                        <div className="p-6">
                            {paymentMethod === 'card' ? (
                                <>
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-violet-500 to-purple-600">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} className="w-5 h-5">
                                                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                                                <line x1="1" y1="10" x2="23" y2="10" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Card Payment</p>
                                            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Secure payment via Paystack</p>
                                        </div>
                                    </div>

                                    <div className="p-4 rounded-xl mb-6" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                        <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>💡 Test Card</p>
                                        <code className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>{TEST.card}</code>
                                        <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Any expiry, any CVV</p>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <p className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Select Provider</p>
                                    <div className="grid grid-cols-3 gap-2 mb-6">
                                        {MOMO_PROVIDERS.map(p => (
                                            <button
                                                key={p.id}
                                                onClick={() => setMomoProvider(p.id)}
                                                className={`p-3 rounded-xl text-center transition-all ${momoProvider === p.id ? 'ring-2 ring-[var(--brand-blue)]' : ''}`}
                                                style={{ backgroundColor: 'var(--bg-tertiary)' }}
                                            >
                                                <div className="w-8 h-8 rounded-full mx-auto mb-2" style={{ backgroundColor: p.color }} />
                                                <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{p.id.toUpperCase()}</span>
                                            </button>
                                        ))}
                                    </div>

                                    <p className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Phone Number</p>
                                    <input
                                        type="tel"
                                        value={phone}
                                        onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                        placeholder="0551234987"
                                        className="w-full px-4 py-4 rounded-xl text-lg mb-4"
                                        style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                                    />

                                    <div className="p-4 rounded-xl mb-6" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                            💡 Test: Use <code className="px-1 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }}>{TEST.momo}</code>
                                        </p>
                                    </div>
                                </>
                            )}

                            <button
                                onClick={handlePayment}
                                disabled={isProcessing || (paymentMethod === 'momo' && phone.length < 10)}
                                className="w-full py-4 rounded-full font-semibold text-white text-lg transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                                style={{ background: `linear-gradient(135deg, ${tierInfo.color} 0%, ${tier === 'organization' ? 'var(--warning)' : 'var(--action-blue)'} 100%)` }}
                            >
                                {isProcessing ? (
                                    <span className="flex items-center justify-center gap-3">
                                        <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12" />
                                        </svg>
                                        Processing...
                                    </span>
                                ) : (
                                    `Pay $${amount}`
                                )}
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <p className="text-center text-xs mt-6" style={{ color: 'var(--text-tertiary)' }}>
                    By subscribing, you agree to our Terms of Service
                </p>
            </div>
        </div>
    )
}
