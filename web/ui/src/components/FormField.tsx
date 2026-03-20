import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'

// ── Row-style field (calm horizontal layout) ─────────────────────
// Two-column: left = label + sublabel (fixed w-36), right = input + hint
// Designed to sit inside a `divide-y divide-wiz-border/30` container.

interface RowFieldProps {
  label:       string
  labelBadge?: ReactNode   // renders inline after the label text on the same line
  sublabel?:   ReactNode
  name:        string
  error?:      string
  hint?:       ReactNode
  required?:   boolean
  children:    ReactNode
}

export function RowField({ label, labelBadge, sublabel, name, error, hint, required, children }: RowFieldProps) {
  return (
    <div className="flex items-start gap-4 px-5 py-4">
      <div className="flex flex-col gap-0.5 w-36 flex-shrink-0 pt-0.5">
        <label htmlFor={name} className="font-mono text-xs font-semibold uppercase tracking-widest text-wiz-muted cursor-pointer flex items-center gap-1.5 flex-nowrap">
          <span className="flex-shrink-0">{label}{required && <span className="text-wiz-gold ml-0.5">*</span>}</span>
          {labelBadge && <span className="flex-shrink-0">{labelBadge}</span>}
        </label>
        {sublabel && <span className="text-xs text-wiz-muted/50">{sublabel}</span>}
      </div>
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        {children}
        {error
          ? <p className="text-xs text-sig-red">{error}</p>
          : hint
            ? <p className="text-xs text-wiz-muted/50 leading-relaxed">{hint}</p>
            : null
        }
      </div>
    </div>
  )
}

type RowInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label:     string
  sublabel?: ReactNode
  name:      string
  error?:    string
  hint?:     ReactNode
}

export function RowInput({ label, sublabel, name, error, hint, required, className, ...rest }: RowInputProps) {
  return (
    <RowField label={label} sublabel={sublabel} name={name} error={error} hint={hint} required={required}>
      <input
        id={name}
        name={name}
        required={required}
        className={clsx('wiz-input', error && 'wiz-input-error', className)}
        {...rest}
      />
    </RowField>
  )
}

type RowSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label:     string
  sublabel?: ReactNode
  name:      string
  error?:    string
  hint?:     ReactNode
  options:   { value: string; label: string }[]
}

export function RowSelect({ label, sublabel, name, error, hint, required, options, className, ...rest }: RowSelectProps) {
  return (
    <RowField label={label} sublabel={sublabel} name={name} error={error} hint={hint} required={required}>
      <select
        id={name}
        name={name}
        required={required}
        className={clsx('wiz-select', error && 'wiz-input-error', className)}
        {...rest}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </RowField>
  )
}

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
      {label && (
        <label htmlFor={name} className="flex items-center gap-1 text-sm font-medium text-wiz-gray">
          {label}
          {required && <span className="text-wiz-gold ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error && (
        <p className="text-xs text-sig-red">{error}</p>
      )}
      {hint && !error && (
        <p className="text-xs text-wiz-muted/70">{hint}</p>
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
