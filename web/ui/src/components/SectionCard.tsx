import type { ReactNode } from 'react'
import clsx from 'clsx'

interface SectionCardProps {
  title:       string
  description?: string
  children:    ReactNode
  className?:  string
  accent?:     'gold' | 'violet' | 'none'
}

export default function SectionCard({
  title,
  description,
  children,
  className,
  accent = 'none',
}: SectionCardProps) {
  return (
    <div
      className={clsx(
        'wiz-card overflow-hidden',
        className,
      )}
    >
      {/* Section Header */}
      <div
        className={clsx(
          'px-6 py-4 border-b border-wiz-border/60',
          accent === 'gold'   && 'border-l-2 border-l-wiz-gold',
          accent === 'violet' && 'border-l-2 border-l-wiz-violet',
        )}
      >
        <h3 className="section-label tracking-widest">{title}</h3>
        {description && (
          <p className="mt-1 text-xs text-wiz-muted">{description}</p>
        )}
      </div>

      {/* Section Content */}
      <div className="px-6 py-5">{children}</div>
    </div>
  )
}
