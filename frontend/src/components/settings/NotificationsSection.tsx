import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchUserSettings, updateUserSettings } from '../../api'
import SettingsCard from './SettingsCard'
import SettingsToggle from './SettingsToggle'
import type { UserSettings } from '../../types'

const notifTypes = [
  { key: 'notify_likes' as const, label: 'Likes', desc: 'When someone likes your post' },
  { key: 'notify_comments' as const, label: 'Comments', desc: 'When someone comments on your post' },
  { key: 'notify_follows' as const, label: 'Follows', desc: 'When someone follows you' },
  { key: 'notify_replies' as const, label: 'Replies', desc: 'When someone replies to your comment' },
]

export default function NotificationsSection() {
  const queryClient = useQueryClient()
  const { data: settings } = useQuery({
    queryKey: ['userSettings'],
    queryFn: fetchUserSettings,
  })

  const [local, setLocal] = useState<Partial<UserSettings>>({})

  useEffect(() => {
    if (settings) {
      setLocal({
        notify_likes: settings.notify_likes,
        notify_comments: settings.notify_comments,
        notify_follows: settings.notify_follows,
        notify_replies: settings.notify_replies,
        email_notifications: settings.email_notifications,
      })
    }
  }, [settings])

  const isDirty = settings
    ? notifTypes.some(t => local[t.key] !== settings[t.key]) ||
      local.email_notifications !== settings.email_notifications
    : false

  const mutation = useMutation({
    mutationFn: () => updateUserSettings(local),
    onSuccess: (data) => {
      queryClient.setQueryData(['userSettings'], data)
    },
  })

  const toggle = (key: keyof UserSettings) => {
    setLocal(prev => ({ ...prev, [key]: !prev[key] }))
  }

  if (!settings) {
    return (
      <SettingsCard id="notifications" title="Notifications">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-12 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }} />
          ))}
        </div>
      </SettingsCard>
    )
  }

  return (
    <SettingsCard
      id="notifications"
      title="Notifications"
      description="Choose what you get notified about"
      onSave={() => mutation.mutate()}
      isSaving={mutation.isPending}
      isDirty={isDirty}
    >
      {mutation.isSuccess && (
        <p className="text-sm mb-4" style={{ color: 'var(--success)' }}>Notification preferences saved.</p>
      )}

      <div className="space-y-1">
        {notifTypes.map(t => (
          <div
            key={t.key}
            className="flex items-center justify-between py-3.5 px-1"
            style={{ borderBottom: '1px solid var(--border-light)' }}
          >
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t.label}</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t.desc}</p>
            </div>
            <SettingsToggle
              checked={!!local[t.key]}
              onChange={() => toggle(t.key)}
            />
          </div>
        ))}
      </div>

      <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--border-light)' }}>
        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Email notifications</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Receive important updates via email
            </p>
          </div>
          <SettingsToggle
            checked={!!local.email_notifications}
            onChange={() => toggle('email_notifications')}
          />
        </div>
      </div>
    </SettingsCard>
  )
}
