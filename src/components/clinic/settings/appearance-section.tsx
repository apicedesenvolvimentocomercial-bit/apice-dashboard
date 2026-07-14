'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'

import { SettingsSectionCard } from './section-card'

/**
 * Seção Aparência — redesign Senno (Configurações-handoff §8). Segmented
 * dourado SEM pílula deslizante (troca instantânea de fundo, .15s — o handoff
 * proíbe o translateX aqui). Controla o MESMO tema do toggle sol/lua da
 * topbar: os dois falam com o next-themes, então ficam em sincronia de graça.
 * "Sistema" segue `prefers-color-scheme` (next-themes `enableSystem`).
 *
 * `mounted` evita mismatch de hidratação — o tema só é conhecido no cliente.
 */

const OPTIONS = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
] as const

export function AppearanceSection() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  return (
    <SettingsSectionCard
      title="Aparência"
      description={
        <>
          Escolha o tema da interface. &ldquo;Sistema&rdquo; acompanha as preferências do seu
          dispositivo.
        </>
      }
    >
      <div
        role="radiogroup"
        aria-label="Tema da interface"
        className="inline-flex gap-1.5 rounded-xl border border-border bg-muted p-[5px]"
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
                'inline-flex h-9 items-center gap-[7px] rounded-[9px] px-[15px] text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected
                  ? 'bg-primary text-primary-foreground transition-[filter] hover:brightness-105'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-[15px] w-[15px]" aria-hidden="true" />
              {label}
            </button>
          )
        })}
      </div>
    </SettingsSectionCard>
  )
}
