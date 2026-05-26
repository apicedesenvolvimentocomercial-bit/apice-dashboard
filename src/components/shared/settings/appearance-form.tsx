'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'

/**
 * Seletor de tema padrão (Aparência) das configurações — claro / escuro /
 * sistema. Compartilhado por admin e clínica (`components/shared`, sem regra de
 * domínio). Persiste no localStorage via next-themes; não há coluna no banco.
 *
 * `mounted` evita mismatch de hidratação: o tema escolhido só é conhecido no
 * cliente, então o estado de seleção só aparece após montar.
 */
const OPTIONS = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
] as const

export function AppearanceForm() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  return (
    <div
      role="radiogroup"
      aria-label="Tema da interface"
      className="grid grid-cols-3 gap-2 sm:max-w-md"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const selected = mounted && theme === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(value)}
            className={cn(
              'flex flex-col items-center gap-2 rounded-lg border-2 px-3 py-4 text-sm font-medium transition-colors',
              selected
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            {label}
          </button>
        )
      })}
    </div>
  )
}
