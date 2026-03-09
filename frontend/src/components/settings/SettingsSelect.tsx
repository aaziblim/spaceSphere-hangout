interface Option {
  value: string
  label: string
  description?: string
}

interface SettingsSelectProps {
  value: string
  options: Option[]
  onChange: (value: string) => void
  disabled?: boolean
}

export default function SettingsSelect({ value, options, onChange, disabled }: SettingsSelectProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map(opt => {
        const isActive = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
            style={{
              backgroundColor: isActive ? 'var(--accent-alpha)' : 'var(--bg-secondary)',
              border: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              color: isActive ? 'var(--accent)' : 'var(--text-primary)',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
