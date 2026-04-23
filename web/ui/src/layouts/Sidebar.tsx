import { NavLink, Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, Wand2, Settings, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import { useTheme } from '../context/ThemeContext'

interface NavItemDef {
  to:     string
  label:  string
  icon:   React.ReactNode
  exact?: boolean
}

const PRIMARY_NAV: NavItemDef[] = [
  { to: '/',       label: 'Dashboard',  icon: <LayoutDashboard size={15} />, exact: true },
  { to: '/deploy', label: 'New Deploy', icon: <Wand2 size={15} /> },
]

function SidebarLink({ to, label, icon, exact }: NavItemDef) {
  const location = useLocation()
  const isActive = exact ? location.pathname === to : location.pathname.startsWith(to)

  return (
    <NavLink
      to={to}
      end={exact}
      className={clsx(
        'group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium',
        'transition-all duration-150',
        isActive
          ? 'bg-wiz-gold/10 text-wiz-gold border border-wiz-gold/25 shadow-gold-sm'
          : 'text-wiz-gray border border-transparent hover:bg-wiz-raised hover:text-wiz-cream hover:border-wiz-border',
      )}
    >
      <span className={clsx('flex-shrink-0', isActive ? 'text-wiz-gold' : 'text-wiz-muted group-hover:text-wiz-gray')}>
        {icon}
      </span>
      <span className="flex-1 font-medium">{label}</span>
      {isActive && <ChevronRight size={12} className="text-wiz-gold/70" />}
    </NavLink>
  )
}

function SettingsLink() {
  const location = useLocation()
  const isActive = location.pathname === '/settings'

  return (
    <NavLink
      to="/settings"
      className={clsx(
        'group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium',
        'transition-all duration-150',
        isActive
          ? 'bg-wiz-gold/10 text-wiz-gold border border-wiz-gold/25 shadow-gold-sm'
          : 'text-wiz-gray border border-transparent hover:bg-wiz-raised hover:text-wiz-cream hover:border-wiz-border',
      )}
    >
      <Settings
        size={15}
        className={clsx('flex-shrink-0', isActive ? 'text-wiz-gold' : 'text-wiz-muted group-hover:text-wiz-gray')}
      />
      <span className="flex-1 font-medium">Settings</span>
      {isActive && <ChevronRight size={12} className="text-wiz-gold/70" />}
    </NavLink>
  )
}

export default function Sidebar() {
  const { theme } = useTheme()
  const logoSrc = theme === 'light' ? '/wizardCD-logo-light.png' : '/wizardCD-logo.png'

  return (
    <aside className="w-64 flex-shrink-0 flex flex-col bg-wiz-surface border-r border-wiz-border">

      {/* ── Logo Banner ──────────────────────────────────────────── */}
      <Link
        to="/"
        className="h-28 flex-shrink-0 flex items-stretch overflow-hidden
                   border-b border-wiz-border bg-wiz-surface
                   transition-opacity duration-150 hover:opacity-90"
        title="Go to Dashboard"
      >
        <img
          src={logoSrc}
          alt="WizardCD — Deployment Control Plane"
          className="w-full h-full object-cover"
          style={{ objectPosition: 'center center' }}
        />
      </Link>

      {/* ── Primary Navigation ──────────────────────────────────── */}
      <nav className="flex-1 flex flex-col gap-1 px-3 py-4">
        <p className="section-label px-3 mb-2">Navigation</p>
        {PRIMARY_NAV.map((item) => (
          <SidebarLink key={item.to} {...item} />
        ))}
      </nav>

      {/* ── Bottom: Settings + Version ──────────────────────────── */}
      <div className="px-3 pb-4 border-t border-wiz-border/50 pt-3">
        <SettingsLink />
        <div className="mt-4 px-3">
          <p className="text-2xs text-wiz-dim font-mono">WizardCD v1.0.0</p>
          <p className="text-2xs text-wiz-dim font-mono mt-0.5 leading-[1.6]">
            One Config. One Command.<br />Continuous Magic.
          </p>
        </div>
      </div>

    </aside>
  )
}
