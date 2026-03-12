import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchBlockedUsers, fetchMutedUsers, unblockUser, unmuteUser } from '../../api'
import SettingsCard from './SettingsCard'

function UserRow({ username, profileImage, date, actionLabel, onAction, loading }: {
  username: string
  profileImage: string | null
  date: string
  actionLabel: string
  onAction: () => void
  loading: boolean
}) {
  return (
    <div className="flex items-center gap-3 py-3 px-1" style={{ borderBottom: '1px solid var(--border-light)' }}>
      <div className="w-9 h-9 rounded-full overflow-hidden shrink-0" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
        {profileImage ? (
          <img src={profileImage} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: 'var(--accent)' }}>
            {username.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>@{username}</div>
        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
      </div>
      <button
        onClick={onAction}
        disabled={loading}
        className="px-3 py-1.5 text-xs font-medium rounded-full border transition-colors hover:bg-[var(--bg-tertiary)] disabled:opacity-50"
        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
      >
        {loading ? '...' : actionLabel}
      </button>
    </div>
  )
}

export default function BlockedMutedSection() {
  const queryClient = useQueryClient()

  const { data: blocked = [], isLoading: blockedLoading } = useQuery({
    queryKey: ['blockedUsers'],
    queryFn: fetchBlockedUsers,
  })

  const { data: muted = [], isLoading: mutedLoading } = useQuery({
    queryKey: ['mutedUsers'],
    queryFn: fetchMutedUsers,
  })

  const unblockMutation = useMutation({
    mutationFn: unblockUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blockedUsers'] })
      queryClient.invalidateQueries({ queryKey: ['posts'] })
    },
  })

  const unmuteMutation = useMutation({
    mutationFn: unmuteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mutedUsers'] })
    },
  })

  return (
    <>
      <SettingsCard
        id="blocked"
        title="Blocked Users"
        description="Blocked users can't see your profile, posts, or message you"
      >
        {blockedLoading ? (
          <div className="py-6 text-center">
            <div className="w-6 h-6 mx-auto border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'transparent' }} />
          </div>
        ) : blocked.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No blocked users</p>
          </div>
        ) : (
          <div>
            {blocked.map(u => (
              <UserRow
                key={u.id}
                username={u.username}
                profileImage={u.profile_image}
                date={u.blocked_at}
                actionLabel="Unblock"
                onAction={() => unblockMutation.mutate(u.username)}
                loading={unblockMutation.isPending && unblockMutation.variables === u.username}
              />
            ))}
          </div>
        )}
      </SettingsCard>

      <SettingsCard
        id="muted"
        title="Muted Users"
        description="Muted users won't know they're muted. Their content is hidden from your feeds"
      >
        {mutedLoading ? (
          <div className="py-6 text-center">
            <div className="w-6 h-6 mx-auto border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'transparent' }} />
          </div>
        ) : muted.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No muted users</p>
          </div>
        ) : (
          <div>
            {muted.map(u => (
              <UserRow
                key={u.id}
                username={u.username}
                profileImage={u.profile_image}
                date={u.muted_at}
                actionLabel="Unmute"
                onAction={() => unmuteMutation.mutate(u.username)}
                loading={unmuteMutation.isPending && unmuteMutation.variables === u.username}
              />
            ))}
          </div>
        )}
      </SettingsCard>
    </>
  )
}
