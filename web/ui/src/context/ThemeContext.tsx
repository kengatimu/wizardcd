import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type Theme = 'dark' | 'light'
export type ActiveEnv = 'DEV' | 'SIT' | 'UAT' | 'PROD'

const VALID_ENVS: ActiveEnv[] = ['DEV', 'SIT', 'UAT', 'PROD']

const FALLBACK_ENV: ActiveEnv =
  (VALID_ENVS.includes(import.meta.env.VITE_APP_ENV as ActiveEnv)
    ? (import.meta.env.VITE_APP_ENV as ActiveEnv)
    : 'SIT')

function readEnv(): ActiveEnv {
  const stored = localStorage.getItem('wiz-active-env') as ActiveEnv | null
  return stored && VALID_ENVS.includes(stored) ? stored : FALLBACK_ENV
}

const THEME_MIGRATION_KEY = 'wiz-theme-v2-migrated'

function readTheme(): Theme {
  // One-time migration: clear old dark preference from pre-light-theme era.
  // After migration, the toggle works normally and choice is persisted.
  if (!localStorage.getItem(THEME_MIGRATION_KEY)) {
    localStorage.setItem(THEME_MIGRATION_KEY, '1')
    localStorage.setItem('wiz-theme', 'light')
    return 'light'
  }
  const stored = localStorage.getItem('wiz-theme') as Theme | null
  if (!stored) return 'light'
  return stored === 'dark' ? 'dark' : 'light'
}

interface ThemeContextValue {
  theme:        Theme
  toggleTheme:  () => void
  activeEnv:    ActiveEnv
  setActiveEnv: (env: ActiveEnv) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme:        'light',
  toggleTheme:  () => {},
  activeEnv:    'SIT',
  setActiveEnv: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme,     setTheme]         = useState<Theme>(readTheme)
  const [activeEnv, setActiveEnvState] = useState<ActiveEnv>(readEnv)

  // Persist theme and toggle the .light class on <html>.
  // We use a CSS CLASS (not a data-theme attribute) as the primary hook
  // because class selectors are applied synchronously and never have the
  // specificity / cascade ordering surprises that attribute selectors can.
  // The data-theme attribute is kept for third-party tooling / DevTools.
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('light', theme === 'light')
    root.setAttribute('data-theme', theme)
    localStorage.setItem('wiz-theme', theme)
  }, [theme])

  const toggleTheme = useCallback(
    () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    [],
  )

  // setActiveEnv is stable across renders — safe to pass as a dep
  const setActiveEnv = useCallback((env: ActiveEnv) => {
    setActiveEnvState(env)
    localStorage.setItem('wiz-active-env', env)
  }, [])

  // Memoise the context value so object identity only changes when
  // theme or activeEnv actually change — prevents spurious re-renders
  const value = useMemo<ThemeContextValue>(
    () => ({ theme, toggleTheme, activeEnv, setActiveEnv }),
    [theme, toggleTheme, activeEnv, setActiveEnv],
  )

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
