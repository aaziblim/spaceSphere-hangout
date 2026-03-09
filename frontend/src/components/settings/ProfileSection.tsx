import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { updateProfile } from '../../api'
import { useAuth } from '../../AuthContext'
import SettingsCard from './SettingsCard'
import type { User } from '../../types'

export default function ProfileSection() {
  const { user, refresh } = useAuth()
  const [firstName, setFirstName] = useState(user?.first_name ?? '')
  const [lastName, setLastName] = useState(user?.last_name ?? '')
  const [bio, setBio] = useState(user?.profile?.bio ?? '')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  const isDirty =
    firstName !== (user?.first_name ?? '') ||
    lastName !== (user?.last_name ?? '') ||
    bio !== (user?.profile?.bio ?? '') ||
    imageFile !== null

  const mutation = useMutation({
    mutationFn: () =>
      updateProfile({
        first_name: firstName,
        last_name: lastName,
        bio,
        ...(imageFile ? { image: imageFile } : {}),
      }),
    onSuccess: () => {
      refresh()
      setImageFile(null)
      setImagePreview(null)
    },
  })

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      setImagePreview(URL.createObjectURL(file))
    }
  }

  const avatarSrc = imagePreview ?? user?.profile?.image ?? undefined

  return (
    <SettingsCard
      id="profile"
      title="Profile"
      description="How you appear to others on Spherespace"
      onSave={() => mutation.mutate()}
      isSaving={mutation.isPending}
      isDirty={isDirty}
    >
      {mutation.isError && (
        <p className="text-sm mb-4" style={{ color: 'var(--danger)' }}>
          Failed to update profile. Try again.
        </p>
      )}
      {mutation.isSuccess && (
        <p className="text-sm mb-4" style={{ color: 'var(--success)' }}>
          Profile updated.
        </p>
      )}

      {/* Avatar */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative">
          <div
            className="w-20 h-20 rounded-full bg-cover bg-center flex items-center justify-center text-2xl font-bold text-white"
            style={{
              backgroundImage: avatarSrc ? `url(${avatarSrc})` : undefined,
              backgroundColor: avatarSrc ? undefined : 'var(--accent)',
            }}
          >
            {!avatarSrc && (user?.username?.[0]?.toUpperCase() ?? '?')}
          </div>
          <label
            className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center cursor-pointer"
            style={{ backgroundColor: 'var(--accent)', color: 'white' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
          </label>
        </div>
        <div>
          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
            @{user?.username}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Username cannot be changed
          </p>
        </div>
      </div>

      {/* Name Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            First name
          </label>
          <input
            type="text"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-colors"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-light)',
              color: 'var(--text-primary)',
            }}
            placeholder="First name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            Last name
          </label>
          <input
            type="text"
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-colors"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-light)',
              color: 'var(--text-primary)',
            }}
            placeholder="Last name"
          />
        </div>
      </div>

      {/* Bio */}
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          Bio
        </label>
        <textarea
          value={bio}
          onChange={e => setBio(e.target.value)}
          maxLength={300}
          rows={3}
          className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none transition-colors"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-light)',
            color: 'var(--text-primary)',
          }}
          placeholder="Tell people about yourself"
        />
        <p className="text-xs mt-1 text-right" style={{ color: 'var(--text-tertiary)' }}>
          {bio.length}/300
        </p>
      </div>
    </SettingsCard>
  )
}
