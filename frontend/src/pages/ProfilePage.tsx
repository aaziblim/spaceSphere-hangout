import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { updateProfile } from '../api'
import { useAuth } from '../AuthContext'

export default function ProfilePage() {
  const { user, refresh, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [bio, setBio] = useState(user?.profile?.bio ?? '')
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (image) {
      const url = URL.createObjectURL(image)
      setImagePreview(url)
      return () => URL.revokeObjectURL(url)
    }
  }, [image])

  const mutation = useMutation({
    mutationFn: () => updateProfile({ bio, image: image ?? undefined }),
    onSuccess: () => {
      setSuccess('Profile updated successfully!')
      refresh()
    },
    onError: () => setError('Failed to update profile.'),
  })

  if (authLoading) {
    return (
      <div className="max-w-lg mx-auto px-4">
        <div className="rounded-2xl p-6 space-y-5" style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full skeleton" />
            <div className="space-y-2">
              <div className="h-5 w-28 skeleton rounded" />
              <div className="h-4 w-40 skeleton rounded" />
            </div>
          </div>
          <div className="h-24 w-full skeleton rounded-xl" />
          <div className="h-10 w-full skeleton rounded-xl" />
        </div>
      </div>
    )
  }

  if (!user) {
    navigate('/login')
    return null
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    mutation.mutate()
  }

  const displayImage = imagePreview || user.profile?.image

  return (
    <div className="max-w-lg mx-auto px-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Edit Profile</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Customize how you appear to others
        </p>
      </div>

      {/* Profile Card */}
      <div className="rounded-2xl p-6" style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'var(--card-shadow)' }}>
        {/* Avatar Section */}
        <div 
          className="flex items-center gap-5 pb-5 mb-5"
          style={{ borderBottom: '1px solid var(--border-light)' }}
        >
          <div className="relative group">
            <div 
              className="w-20 h-20 rounded-full overflow-hidden"
              style={{ backgroundColor: 'var(--bg-tertiary)' }}
            >
              {displayImage ? (
                <img src={displayImage} alt={user.username} className="w-full h-full object-cover" />
              ) : (
                <div 
                  className="w-full h-full flex items-center justify-center text-white font-semibold text-2xl"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  {user.username.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-full cursor-pointer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6 text-white">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setImage(e.target.files?.[0] ?? null)}
                disabled={mutation.isPending}
                className="hidden"
              />
            </label>
          </div>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{user.username}</h2>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{user.email}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--accent)' }}>Click photo to change</p>
          </div>
        </div>

        {/* Messages */}
        {success && (
          <div 
            className="mb-5 p-3 rounded-xl text-sm flex items-center gap-2"
            style={{ backgroundColor: 'var(--success-alpha)', color: 'var(--success)' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 flex-shrink-0">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            {success}
          </div>
        )}
        {error && (
          <div 
            className="mb-5 p-3 rounded-xl text-sm flex items-center gap-2"
            style={{ backgroundColor: 'var(--danger-alpha)', color: 'var(--danger)' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 flex-shrink-0">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Bio */}
          <div>
            <label 
              htmlFor="bio" 
              className="block text-sm font-medium mb-1.5"
              style={{ color: 'var(--text-secondary)' }}
            >
              Bio
            </label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              placeholder="Tell us about yourself…"
              disabled={mutation.isPending}
              className="w-full px-4 py-3 rounded-xl text-base focus:outline-none focus:ring-2 transition-all resize-y"
              style={{ 
                backgroundColor: 'var(--bg-secondary)', 
                color: 'var(--text-primary)',
                border: '1px solid var(--border-light)'
              }}
            />
            <p className="text-xs mt-1.5" style={{ color: 'var(--text-tertiary)' }}>
              Brief description for your profile
            </p>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full py-3 text-white font-medium rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:opacity-90 active:scale-[0.98] flex items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {mutation.isPending ? (
              <>
                <div 
                  className="w-4 h-4 border-2 rounded-full animate-spin"
                  style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }}
                />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
