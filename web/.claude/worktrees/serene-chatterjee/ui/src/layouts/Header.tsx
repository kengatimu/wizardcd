import { Link } from 'react-router-dom'
import { Bell, Settings2, Sun, Moon } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

const ENV_STYLE: Record<string, string> = {
  SIT:  'bg-sig-blue-dim   text-sig-blue   border border-sig-blue/20',
  UAT:  'bg-sig-yellow-dim text-sig-yellow border border-sig-yellow/20',
  PROD: 'bg-sig-purple-dim text-sig-purple border border-sig-purple/20',
}

const ENV_TOOLTIP: Record<string, string> = {
  SIT:  'System Integration Testing — click to manage in Settings',
  UAT:  'User Acceptance Testing — click to manage in Settings',
  PROD: 'Production — click to manage in Settings',
}

export default function Header() {
  const { theme, toggleTheme, activeEnv } = useTheme()
  const envStyle   = ENV_STYLE[activeEnv]   ?? ENV_STYLE['SIT']
  const envTooltip = ENV_TOOLTIP[activeEnv] ?? ENV_TOOLTIP['SIT']

  return (
    /*
     * h-28 matches the Sidebar logo area exactly so both border-b lines
     * appear as a single continuous horizontal rule across the full width.
     */
    <header className="h-28 flex-shrink-0 flex items-center justify-between
                        px-6 bg-wiz-surface border-b border-wiz-border">

      {/* Left: permanent slogan only — page context comes from each page's own H1 */}
      <p className="font-mono text-xs tracking-[0.18em] uppercase text-wiz-gold/90 select-none">
        One Config. One Command. Continuous Magic.
      </p>

      {/* Right: controls */}
      <div className="flex items-center gap-2">

        {/* Environment badge — clicking goes to Settings where the API URL is configured.
            Change the active environment by setting VITE_APP_ENV=UAT or VITE_APP_ENV=PROD
            in your .env file and restarting the dev server. */}
        <Link
          to="/settings"
          className={`inline-flex items-center gap-1.5 font-mono text-xs
                      font-semibold tracking-wider px-2.5 py-1 rounded-md
                      transition-opacity duration-150 hover:opacity-80 ${envStyle}`}
          title={envTooltip}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
          {activeEnv}
          <Settings2 size={10} className="opacity-70" />
        </Link>

        <div className="w-px h-4 bg-wiz-border mx-1" />

        {/* Dark / Light toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          className="btn-icon h-8 w-8"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark'
            ? <Sun  size={14} className="text-wiz-gold" />
            : <Moon size={14} className="text-wiz-muted" />
          }
        </button>

        <button type="button" className="btn-icon h-8 w-8" title="Notifications">
          <Bell size={14} className="text-wiz-muted" />
        </button>

      </div>

    </header>
  )
}
