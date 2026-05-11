import clsx from 'clsx'

interface ToggleSwitchProps {
  checked:   boolean
  onChange:  (checked: boolean) => void
  label:     string
  hint?:     string
  disabled?: boolean
}

export default function ToggleSwitch({ checked, onChange, label, hint, disabled }: ToggleSwitchProps) {
  return (
    <label className={clsx('flex items-start gap-3 cursor-pointer', disabled && 'opacity-40 cursor-not-allowed')}>
      {/* Track */}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative flex-shrink-0 mt-0.5',
          'w-10 h-5 rounded-full',
          'transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-wiz-gold/30',
          checked
            ? 'bg-wiz-gold shadow-gold-sm'
            : 'bg-wiz-border border border-wiz-border-mid',
        )}
      >
        {/* Thumb */}
        <span
          className={clsx(
            'absolute top-0.5 left-0.5',
            'w-4 h-4 rounded-full',
            'transition-transform duration-200',
            'shadow-md',
            checked
              ? 'translate-x-5 bg-white'
              : 'translate-x-0 bg-wiz-surface',
          )}
        />
      </button>

      {/* Text */}
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-wiz-cream">{label}</span>
        {hint && <span className="text-xs text-wiz-muted">{hint}</span>}
      </div>
    </label>
  )
}
