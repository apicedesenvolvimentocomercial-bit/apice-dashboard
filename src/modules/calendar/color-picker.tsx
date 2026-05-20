'use client'

import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

// Paleta amigável: o usuário escolhe clicando numa bolinha em vez de mexer no
// seletor nativo de cor. value '' = cor padrão (azul do calendário).
export const EVENT_COLOR_OPTIONS: { value: string; label: string; hex: string }[] = [
  { value: '', label: 'Padrão', hex: '#3b82f6' },
  { value: '#6366f1', label: 'Índigo', hex: '#6366f1' },
  { value: '#8b5cf6', label: 'Roxo', hex: '#8b5cf6' },
  { value: '#ec4899', label: 'Rosa', hex: '#ec4899' },
  { value: '#ef4444', label: 'Vermelho', hex: '#ef4444' },
  { value: '#f59e0b', label: 'Âmbar', hex: '#f59e0b' },
  { value: '#10b981', label: 'Verde', hex: '#10b981' },
  { value: '#14b8a6', label: 'Turquesa', hex: '#14b8a6' },
  { value: '#6b7280', label: 'Cinza', hex: '#6b7280' },
]

type Props = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function ColorPicker({ value, onChange, disabled }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {EVENT_COLOR_OPTIONS.map((opt) => {
        const isSelected = value === opt.value
        return (
          <button
            key={opt.value || 'default'}
            type="button"
            title={opt.label}
            aria-label={opt.label}
            aria-pressed={isSelected}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative flex h-7 w-7 items-center justify-center rounded-full transition-transform',
              'ring-offset-2 ring-offset-background hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50',
              isSelected && 'ring-2 ring-foreground'
            )}
            style={{ backgroundColor: opt.hex }}
          >
            {isSelected && <Check className="h-4 w-4 text-white drop-shadow" strokeWidth={3} />}
          </button>
        )
      })}
    </div>
  )
}
