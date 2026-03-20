import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Sun, Moon } from 'lucide-react'
import clsx from 'clsx'
import { useTheme } from '../context/ThemeContext'
import { useNotifications } from '../hooks/useNotifications'
import NotificationDropdown from '../components/NotificationDropdown'

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

  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearAll,
  } = useNotifications()

  const [showNotifs, setShowNotifs] = useState(false)

  const toggleNotifs = useCallback(() => {
    setShowNotifs((prev) => !prev)
  }, [])

  const closeNotifs = useCallback(() => {
    setShowNotifs(false)
  }, [])

  return (
    <header className="h-28 flex-shrink-0 flex items-center justify-between
                        px-6 bg-wiz-surface border-b border-wiz-border">

      {/* Left: permanent slogan */}
      <p className="font-mono text-xs tracking-[0.18em] uppercase text-wiz-gold/90 select-none">
        One Config. One Command. Continuous Magic.
      </p>

      {/* Right: controls */}
      <div className="flex items-center gap-2">

        {/* Environment badge */}
        <Link
          to="/deploy"
          className={`inline-flex items-center gap-1.5 font-mono text-xs
                      font-semibold tracking-wider px-2.5 py-1 rounded-md
                      transition-opacity duration-150 hover:opacity-80 ${envStyle}`}
          title="Go to deployment — change environment in Step 1"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
          {activeEnv}
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

        {/* Notification bell */}
        <div className="relative">
          <button
            type="button"
            onClick={toggleNotifs}
            className={clsx(
              'btn-icon h-8 w-8 relative',
              showNotifs && 'bg-wiz-raised',
            )}
            title="Notifications"
          >
            <Bell size={14} className={clsx(
              showNotifs ? 'text-wiz-gold' : 'text-wiz-muted',
            )} />

            {/* Unread badge */}
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1
                               flex items-center justify-center rounded-full
                               bg-sig-red text-white text-[9px] font-bold leading-none
                               border-2 border-wiz-surface">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Dropdown */}
          {showNotifs && (
            <NotificationDropdown
              notifications={notifications}
              onMarkAsRead={markAsRead}
              onMarkAllAsRead={markAllAsRead}
              onClearAll={clearAll}
              onClose={closeNotifs}
            />
          )}
        </div>

      </div>

    </header>
  )
}
