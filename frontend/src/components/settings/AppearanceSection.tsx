import { useTheme } from '../../ThemeContext'
import SettingsCard from './SettingsCard'

const themes = [
  { value: 'light' as const, label: 'Light', desc: 'Clean and bright', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  )},
  { value: 'dark' as const, label: 'Dark', desc: 'Easy on the eyes', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )},
  { value: 'system' as const, label: 'System', desc: 'Match your device', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-7 h-7">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  )},
]

export default function AppearanceSection() {
  const { preference, setPreference } = useTheme()

  return (
    <SettingsCard
      id="appearance"
      title="Appearance"
      description="Choose how Spherespace looks to you"
    >
      <div className="grid grid-cols-3 gap-3">
        {themes.map(t => {
          const isActive = preference === t.value
          return (
            <button
              key={t.value}
              onClick={() => setPreference(t.value)}
              className="flex flex-col items-center gap-2.5 p-5 rounded-2xl transition-all duration-200 relative"
              style={{
                backgroundColor: isActive ? 'var(--accent-alpha)' : 'var(--bg-secondary)',
                border: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-primary)',
              }}
            >
              {isActive && (
                <div className="absolute top-2 right-2">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" style={{ color: 'var(--accent)' }}>
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                </div>
              )}
              {t.icon}
              <div className="text-center">
                <span className="text-sm font-semibold block">{t.label}</span>
                <span className="text-[11px] block mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  {t.desc}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </SettingsCard>
  )
}
