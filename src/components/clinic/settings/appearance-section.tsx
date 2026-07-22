'use client'

import { Monitor, Moon, PanelLeftClose, PanelLeftOpen, Sun, type LucideIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

import {
  readSidebarCollapsed,
  subscribeSidebarCollapsed,
  writeSidebarCollapsed,
} from '@/lib/sidebar-preference'
import { cn } from '@/lib/utils'

import { SETTINGS_LABEL, SettingsSectionCard } from './section-card'

/**
 * Seção Aparência — redesign Senno (Configurações-handoff §8). Segmented
 * dourado SEM pílula deslizante (troca instantânea de fundo, .15s — o handoff
 * proíbe o translateX aqui). Dois controles, ambos preferências do DISPOSITIVO
 * (localStorage, sem action/coluna no banco):
 *
 * - Tema: o MESMO do toggle sol/lua da topbar — os dois falam com o next-themes,
 *   então ficam em sincronia de graça. "Sistema" segue `prefers-color-scheme`.
 * - Menu lateral: estado padrão da sidebar da clínica, a MESMA preferência do
 *   botão da borda do menu (`lib/sidebar-preference`) — mudar aqui recolhe/
 *   expande na hora, sem recarregar.
 *
 * `mounted` evita mismatch de hidratação — tema e preferência do menu só são
 * conhecidos no cliente.
 */

const THEME_OPTIONS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
]

const SIDEBAR_OPTIONS: { value: 'expanded' | 'collapsed'; label: string; icon: LucideIcon }[] = [
  { value: 'expanded', label: 'Expandido', icon: PanelLeftOpen },
  { value: 'collapsed', label: 'Recolhido', icon: PanelLeftClose },
]

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  /** `null` enquanto não montou — nenhuma opção marcada (evita flash errado). */
  value: T | null
  options: { value: T; label: string; icon: LucideIcon }[]
  onChange: (value: T) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex gap-1.5 rounded-xl border border-border bg-muted p-[5px]"
    >
      {options.map(({ value: option, label: optionLabel, icon: Icon }) => {
        const selected = value === option
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option)}
            className={cn(
              'inline-flex h-9 items-center gap-[7px] rounded-[9px] px-[15px] text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'bg-primary text-primary-foreground transition-[filter] hover:brightness-105'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-[15px] w-[15px]" aria-hidden="true" />
            {optionLabel}
          </button>
        )
      })}
    </div>
  )
}

export function AppearanceSection() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    setMounted(true)
    setSidebarCollapsed(readSidebarCollapsed())
    // O botão da borda da sidebar escreve na mesma chave — reflete na hora.
    return subscribeSidebarCollapsed(setSidebarCollapsed)
  }, [])

  return (
    <SettingsSectionCard
      title="Aparência"
      description={
        <>
          Tema da interface e estado padrão do menu lateral. &ldquo;Sistema&rdquo; acompanha as
          preferências do seu dispositivo. Valem apenas neste navegador.
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <div>
          <p className={SETTINGS_LABEL}>Tema da interface</p>
          <Segmented
            label="Tema da interface"
            value={mounted ? (theme ?? null) : null}
            options={THEME_OPTIONS}
            onChange={setTheme}
          />
        </div>

        <div className="border-t border-border pt-[22px]">
          <p className={SETTINGS_LABEL}>Menu lateral</p>
          <Segmented
            label="Estado padrão do menu lateral"
            value={mounted ? (sidebarCollapsed ? 'collapsed' : 'expanded') : null}
            options={SIDEBAR_OPTIONS}
            onChange={(value) => {
              const collapsed = value === 'collapsed'
              setSidebarCollapsed(collapsed)
              writeSidebarCollapsed(collapsed)
            }}
          />
          <p className="m-0 mt-2.5 text-xs text-muted-foreground">
            Como o menu abre ao entrar no sistema. A troca vale na hora — você também pode usar o
            botão na borda do menu.
          </p>
        </div>
      </div>
    </SettingsSectionCard>
  )
}
