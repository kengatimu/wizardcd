import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'

// ── Label + wrapper ──────────────────────────────────────────────

interface FieldWrapperProps {
  label:    string
  name:     string
  error?:   string
  hint?:    string
  required?: boolean
  children: ReactNode
}

export function FieldWrapper({ label, name, error, hint, required, children }: FieldWrapperProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="flex items-center gap-1 text-xs font-medium text-wiz-gray">
        {label}
        {required && <span className="text-wiz-gold ml-0.5">*</span>}
      </label>
      {children}
      {error && (
        <p className="text-xs text-sig-red">{error}</p>
      )}
      {hint && !error && (
        <p className="text-xs text-wiz-muted">{hint}</p>
      )}
    </div>
  )
}

// ── Text / number input ──────────────────────────────────────────

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label:    string
  name:     string
  error?:   string
  hint?:    string
}

export default function FormField({ label, name, error, hint, className, required, ...rest }: InputProps) {
  return (
    <FieldWrapper label={label} name={name} error={error} hint={hint} required={required}>
      <input
        id={name}
        name={name}
        required={required}
        className={clsx(
          'wiz-input',
          error && 'wiz-input-error',
          className,
        )}
        {...rest}
      />
    </FieldWrapper>
  )
}

// ── Select ────────────────────────────────────────────────────────

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label:    string
  name:     string
  error?:   string
  hint?:    string
  options:  { value: string; label: string }[]
}

export function SelectField({ label, name, error, hint, options, className, required, ...rest }: SelectProps) {
  return (
    <FieldWrapper label={label} name={name} error={error} hint={hint} required={required}>
      <select
        id={name}
        name={name}
        required={required}
        className={clsx(
          'wiz-select',
          error && 'wiz-input-error',
          className,
        )}
        {...rest}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </FieldWrapper>
  )
}

// ── Textarea ──────────────────────────────────────────────────────

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label:   string
  name:    string
  error?:  string
  hint?:   string
}

export function TextareaField({ label, name, error, hint, className, required, ...rest }: TextareaProps) {
  return (
    <FieldWrapper label={label} name={name} error={error} hint={hint} required={required}>
      <textarea
        id={name}
        name={name}
        required={required}
        className={clsx(
          'wiz-input resize-none',
          error && 'wiz-input-error',
          className,
        )}
        {...rest}
      />
    </FieldWrapper>
  )
}
