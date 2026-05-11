import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

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

interface ThemeContextValue {
  activeEnv:    ActiveEnv
  setActiveEnv: (env: ActiveEnv) => void
  // Kept for backward-compat with any page that still imports `theme`
  theme:        'light'
  toggleTheme:  () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  activeEnv:    'SIT',
  setActiveEnv: () => {},
  theme:        'light',
  toggleTheme:  () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [activeEnv, setActiveEnvState] = useState<ActiveEnv>(readEnv)

  const setActiveEnv = useCallback((env: ActiveEnv) => {
    setActiveEnvState(env)
    localStorage.setItem('wiz-active-env', env)
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({
      activeEnv,
      setActiveEnv,
      theme:       'light',
      toggleTheme: () => {},
    }),
    [activeEnv, setActiveEnv],
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
