import { useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import clsx from 'clsx'
import { useTheme } from '../context/ThemeContext'
import { useNotifications } from '../hooks/useNotifications'
import NotificationDropdown from '../components/NotificationDropdown'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

// ── Environment pill colours ──────────────────────────────────────
// Muted tints on white background — not electric, not glowy
const ENV_STYLE: Record<string, string> = {
  DEV:  'bg-sig-green-dim  text-sig-green  border border-sig-green/30',
  SIT:  'bg-sig-blue-dim   text-sig-blue   border border-sig-blue/30',
  UAT:  'bg-sig-yellow-dim text-sig-yellow border border-sig-yellow/30',
  PROD: 'bg-sig-purple-dim text-sig-purple border border-sig-purple/30',
}

export default function Header() {
  const { activeEnv } = useTheme()
  const envStyle = ENV_STYLE[activeEnv] ?? ENV_STYLE['SIT']
  const navigate = useNavigate()

  const queryClient = useQueryClient()

  const handleHomeClick = () => {
    navigate('/')
    void queryClient.invalidateQueries({ queryKey: ['jobs-summary'] })
    void queryClient.invalidateQueries({ queryKey: ['jobs-list'] })
    toast.success('Dashboard refreshed')
  }

  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } = useNotifications()
  const [showNotifs, setShowNotifs] = useState(false)
  const toggleNotifs = useCallback(() => setShowNotifs((p) => !p), [])
  const closeNotifs  = useCallback(() => setShowNotifs(false), [])

  return (
    <header
      className="h-[64px] flex-shrink-0 flex items-center justify-between
                 px-7 bg-wiz-surface border-b border-wiz-border"
      style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}
    >

      {/* Left: tagline — pure editorial typography, brand voice */}
      <button
        type="button"
        onClick={handleHomeClick}
        className="select-none cursor-pointer group"
        title="Go to Dashboard"
      >
        <span className="font-serif italic text-[15px] leading-none text-wiz-cream/75 group-hover:text-wiz-cream transition-colors duration-200 whitespace-nowrap">
          One Config
          <span className="inline-block w-1 h-1 rounded-full bg-wiz-gold mx-3 align-middle" aria-hidden />
          One Command
          <span className="inline-block w-1 h-1 rounded-full bg-wiz-gold mx-3 align-middle" aria-hidden />
          Continuous Magic
        </span>
      </button>

      {/* Right: env pill + notification bell */}
      <div className="flex items-center gap-2">

        {/* Environment badge — links to deploy wizard step 1 */}
        <Link
          to="/deploy"
          title={`${activeEnv} environment — go to deployment wizard`}
          className={clsx(
            'inline-flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-[0.08em] uppercase',
            'px-2.5 py-1 rounded transition-opacity duration-150 hover:opacity-80',
            envStyle,
          )}
        >
          <span className="w-[5px] h-[5px] rounded-full bg-current opacity-80" />
          {activeEnv}
        </Link>

        <div className="w-px h-4 bg-wiz-border mx-1" />

        {/* Notification bell */}
        <div className="relative">
          <button
            type="button"
            onClick={toggleNotifs}
            className={clsx(
              'btn-icon',
              showNotifs && 'bg-wiz-raised text-wiz-gold',
            )}
            title="Notifications"
          >
            <Bell size={14} />

            {/* Unread count badge */}
            {unreadCount > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1
                           flex items-center justify-center rounded-full
                           bg-sig-red text-white text-[8px] font-bold leading-none
                           border border-wiz-surface"
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

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
