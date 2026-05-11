import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

interface BackButtonProps {
  to:    string
  label: string
}

/**
 * Floating back-navigation button used at the top of secondary pages
 * (Activity, Platform Health, etc).
 *
 * Design notes:
 * - White card with crimson left accent — matches the page-card language
 * - Arrow slides on hover, button lifts and gets a crimson glow
 * - Big enough to be unmissable at the top of the page
 */
export default function BackButton({ to, label }: BackButtonProps) {
  return (
    <Link
      to={to}
      className="
        group inline-flex items-center gap-2.5
        px-3.5 py-2 rounded-md
        bg-wiz-surface text-wiz-cream
        border border-wiz-border
        border-l-[3px] border-l-wiz-gold
        text-[13px] font-medium
        transition-all duration-200
        hover:-translate-x-1 hover:border-wiz-gold/40
        active:scale-95
      "
      style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.04)' }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.boxShadow =
          '0 6px 18px rgba(139,26,26,0.18), 0 2px 4px rgba(139,26,26,0.10), inset 0 1px 0 rgba(255,255,255,0.6)'
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.boxShadow =
          '0 2px 6px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.04)'
      }}
    >
      <span
        className="flex items-center justify-center w-5 h-5 rounded-md bg-wiz-gold/10 text-wiz-gold transition-all duration-200 group-hover:bg-wiz-gold group-hover:text-white"
      >
        <ArrowLeft
          size={12}
          strokeWidth={2.5}
          className="transition-transform duration-200 group-hover:-translate-x-0.5"
        />
      </span>
      <span className="text-wiz-cream/85 group-hover:text-wiz-cream transition-colors">
        Back to {label}
      </span>
    </Link>
  )
}
