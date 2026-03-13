import { Plus, X } from 'lucide-react'
import { FieldWrapper } from './FormField'

interface DynamicListProps {
  label:       string
  name:        string
  values:      string[]
  onChange:    (values: string[]) => void
  placeholder?: string
  hint?:       string
  error?:      string
  addLabel?:   string
}

export default function DynamicList({
  label,
  name,
  values,
  onChange,
  placeholder = 'Enter value…',
  hint,
  error,
  addLabel = 'Add item',
}: DynamicListProps) {
  const handleChange = (index: number, value: string) => {
    const next = [...values]
    next[index] = value
    onChange(next)
  }

  const handleAdd = () => onChange([...values, ''])

  const handleRemove = (index: number) => {
    onChange(values.filter((_, i) => i !== index))
  }

  return (
    <FieldWrapper label={label} name={name} error={error} hint={hint}>
      <div className="flex flex-col gap-2">
        {values.map((val, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              id={i === 0 ? name : `${name}-${i}`}
              type="text"
              value={val}
              placeholder={placeholder}
              onChange={(e) => handleChange(i, e.target.value)}
              className="wiz-input flex-1"
            />
            <button
              type="button"
              onClick={() => handleRemove(i)}
              className="btn-icon flex-shrink-0 text-sig-red/70 hover:text-sig-red hover:bg-sig-red-dim"
              aria-label="Remove item"
            >
              <X size={14} />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-1.5 text-xs text-wiz-gold hover:text-wiz-gold-light
                     transition-colors duration-150 w-fit mt-1"
        >
          <Plus size={13} />
          {addLabel}
        </button>
      </div>
    </FieldWrapper>
  )
}
