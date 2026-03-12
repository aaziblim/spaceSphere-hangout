import { type ReactNode } from 'react'

interface SettingsCardProps {
  id: string
  title: string
  description?: string
  children: ReactNode
  onSave?: () => void
  isSaving?: boolean
  isDirty?: boolean
  saveLabel?: string
  danger?: boolean
}

export default function SettingsCard({
  id,
  title,
  description,
  children,
  onSave,
  isSaving,
  isDirty,
  saveLabel = 'Save changes',
  danger,
}: SettingsCardProps) {
  return (
    <section
      id={id}
      className="rounded-2xl overflow-hidden scroll-mt-24"
      style={{
        backgroundColor: 'var(--bg-primary)',
        boxShadow: 'var(--card-shadow)',
        border: danger ? '1px solid var(--danger-alpha)' : '1px solid var(--border-light)',
      }}
    >
      <div className="px-5 pt-5 pb-1 sm:px-6 sm:pt-6">
        <div className="flex items-center gap-2.5 mb-1">
          <h2
            className="text-[15px] font-semibold tracking-tight"
            style={{ color: danger ? 'var(--danger)' : 'var(--text-primary)' }}
          >
            {title}
          </h2>
        </div>
        {description && (
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {description}
          </p>
        )}
      </div>
      <div className="px-5 py-4 sm:px-6">{children}</div>
      {onSave && (
        <div
          className="px-5 py-3.5 sm:px-6 flex items-center justify-between gap-3"
          style={{
            borderTop: '1px solid var(--border-light)',
            backgroundColor: isDirty ? (danger ? 'var(--danger-alpha)' : 'var(--accent-alpha)') : undefined,
          }}
        >
          {isDirty ? (
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              You have unsaved changes
            </p>
          ) : (
            <div />
          )}
          <button
            onClick={onSave}
            disabled={isSaving || !isDirty}
            className="px-5 py-2 rounded-xl text-[13px] font-semibold text-white transition-all duration-200 active:scale-95 disabled:opacity-30 disabled:active:scale-100"
            style={{ backgroundColor: danger ? 'var(--danger)' : 'var(--accent)' }}
          >
            {isSaving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
            ) : (
              saveLabel
            )}
          </button>
        </div>
      )}
    </section>
  )
}
