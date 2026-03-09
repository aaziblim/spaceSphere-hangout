import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type ThemePreference = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

interface ThemeContextType {
  theme: ResolvedTheme
  preference: ThemePreference
  setPreference: (pref: ThemePreference) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | null>(null)

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return pref === 'system' ? getSystemTheme() : pref
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('theme-preference') as ThemePreference
      if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
      // Migrate from old 'theme' key
      const legacy = localStorage.getItem('theme') as ResolvedTheme
      if (legacy === 'light' || legacy === 'dark') return legacy
    }
    return 'system'
  })

  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(preference))

  useEffect(() => {
    const root = document.documentElement
    const theme = resolveTheme(preference)
    setResolved(theme)
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem('theme-preference', preference)
  }, [preference])

  // Listen for OS theme changes when preference is 'system'
  useEffect(() => {
    if (preference !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      const theme: ResolvedTheme = e.matches ? 'dark' : 'light'
      setResolved(theme)
      const root = document.documentElement
      if (theme === 'dark') {
        root.classList.add('dark')
      } else {
        root.classList.remove('dark')
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [preference])

  const setPreference = (pref: ThemePreference) => {
    setPreferenceState(pref)
  }

  const toggleTheme = () => {
    setPreferenceState(prev => {
      if (prev === 'light') return 'dark'
      if (prev === 'dark') return 'system'
      return 'light'
    })
  }

  return (
    <ThemeContext.Provider value={{ theme: resolved, preference, setPreference, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
