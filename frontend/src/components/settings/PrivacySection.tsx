import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchUserSettings, updateUserSettings } from '../../api'
import SettingsCard from './SettingsCard'
import SettingsToggle from './SettingsToggle'
import SettingsSelect from './SettingsSelect'
import type { UserSettings } from '../../types'

const visibilityOptions = [
  { value: 'public', label: 'Public', description: 'Anyone can see your profile' },
  { value: 'followers', label: 'Followers', description: 'Only followers can see' },
  { value: 'private', label: 'Private', description: 'Only you can see' },
]

const messageOptions = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'followers', label: 'Followers' },
  { value: 'nobody', label: 'Nobody' },
]

export default function PrivacySection() {
  const queryClient = useQueryClient()
  const { data: settings } = useQuery({
    queryKey: ['userSettings'],
    queryFn: fetchUserSettings,
  })

  const [local, setLocal] = useState<Partial<UserSettings>>({})

  useEffect(() => {
    if (settings) {
      setLocal({
        profile_visibility: settings.profile_visibility,
        show_online_status: settings.show_online_status,
        who_can_message: settings.who_can_message,
      })
    }
  }, [settings])

  const isDirty = settings
    ? local.profile_visibility !== settings.profile_visibility ||
      local.show_online_status !== settings.show_online_status ||
      local.who_can_message !== settings.who_can_message
    : false

  const mutation = useMutation({
    mutationFn: () => updateUserSettings(local),
    onSuccess: (data) => {
      queryClient.setQueryData(['userSettings'], data)
    },
  })

  if (!settings) {
    return (
      <SettingsCard id="privacy" title="Privacy">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }} />
          ))}
        </div>
      </SettingsCard>
    )
  }

  return (
    <SettingsCard
      id="privacy"
      title="Privacy"
      description="Control who can see your content and contact you"
      onSave={() => mutation.mutate()}
      isSaving={mutation.isPending}
      isDirty={isDirty}
    >
      {mutation.isSuccess && (
        <p className="text-sm mb-4" style={{ color: 'var(--success)' }}>Privacy settings saved.</p>
      )}

      {/* Profile Visibility */}
      <div className="mb-5">
        <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
          Profile visibility
        </p>
        <SettingsSelect
          value={local.profile_visibility ?? 'public'}
          options={visibilityOptions}
          onChange={v => setLocal(prev => ({ ...prev, profile_visibility: v as UserSettings['profile_visibility'] }))}
        />
      </div>

      {/* Online Status */}
      <div
        className="flex items-center justify-between py-4"
        style={{ borderTop: '1px solid var(--border-light)', borderBottom: '1px solid var(--border-light)' }}
      >
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Show online status</p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Let others see when you're active
          </p>
        </div>
        <SettingsToggle
          checked={!!local.show_online_status}
          onChange={v => setLocal(prev => ({ ...prev, show_online_status: v }))}
        />
      </div>

      {/* Who Can Message */}
      <div className="mt-5">
        <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
          Who can message you
        </p>
        <SettingsSelect
          value={local.who_can_message ?? 'everyone'}
          options={messageOptions}
          onChange={v => setLocal(prev => ({ ...prev, who_can_message: v as UserSettings['who_can_message'] }))}
        />
      </div>
    </SettingsCard>
  )
}
