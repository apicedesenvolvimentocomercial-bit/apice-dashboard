'use client'

import {
  Building2,
  CreditCard,
  LayoutGrid,
  MessageCircle,
  Palette,
  Plug,
  Search,
  Shield,
  User,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

/**
 * Shell da tela Configurações — redesign Senno (Configurações-handoff §1/§4/§6).
 * Coluna centralizada de 940px com a "toolbar/nav" da tela: busca de
 * configuração + chips de categoria (a busca filtra os CHIPS em tempo real,
 * não o conteúdo). Categoria padrão "Todas" empilha as seções visíveis na
 * ordem dos chips; escolher um chip mostra só aquela seção.
 *
 * As seções chegam prontas do server component (page.tsx) como ReactNode —
 * o gate por cargo/coroa acontece lá; aqui só entra chip p/ seção presente.
 * Seções inativas ficam `hidden` (não desmontam) p/ preservar estado de form
 * ao alternar chips.
 */

export type SettingsSectionKey =
  | 'perfil'
  | 'aparencia'
  | 'clinica'
  | 'pagamento'
  | 'webhooks'
  | 'retencao'
  | 'pessoas'
  | 'cargos'
  | 'usuarios'

// 10 chips na ordem exata do handoff §4.2 ("todas" + 9 categorias).
const CATEGORIES: { key: SettingsSectionKey; label: string; icon: LucideIcon }[] = [
  { key: 'perfil', label: 'Perfil', icon: User },
  { key: 'aparencia', label: 'Aparência', icon: Palette },
  { key: 'clinica', label: 'Clínica', icon: Building2 },
  { key: 'pagamento', label: 'Pagamento no crédito', icon: CreditCard },
  { key: 'webhooks', label: 'Webhooks', icon: Plug },
  { key: 'retencao', label: 'Régua de retenção', icon: MessageCircle },
  { key: 'pessoas', label: 'Pessoas', icon: Users },
  { key: 'cargos', label: 'Cargos e permissões', icon: Shield },
  { key: 'usuarios', label: 'Usuários da clínica', icon: UserCheck },
]

type Props = {
  sections: Partial<Record<SettingsSectionKey, React.ReactNode>>
}

export function ClinicSettingsShell({ sections }: Props) {
  const [section, setSection] = useState<'todas' | SettingsSectionKey>('todas')
  const [query, setQuery] = useState('')

  const available = CATEGORIES.filter((c) => sections[c.key] != null)
  const q = query.trim().toLowerCase()
  const chips: { key: 'todas' | SettingsSectionKey; label: string; icon: LucideIcon }[] = [
    { key: 'todas' as const, label: 'Todas', icon: LayoutGrid },
    ...available,
  ].filter((c) => !q || c.label.toLowerCase().includes(q))

  return (
    <div className="mx-auto w-full max-w-[1180px]">
      {/* ---- Busca de configuração + chips (handoff §4) ---- */}
      <div className="mb-[22px]">
        <div className="relative w-[340px] max-w-full">
          <Search
            className="pointer-events-none absolute left-[13px] top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar configuração…"
            aria-label="Buscar configuração"
            className="h-[42px] w-full rounded-[10px] border border-input bg-card pl-[37px] pr-3 text-[13.5px] text-foreground transition-shadow placeholder:text-muted-foreground/70 focus:border-ring focus:outline-none focus:[box-shadow:0_0_0_3px_hsl(var(--ring)/0.18)]"
          />
        </div>

        {chips.length > 0 ? (
          <div className="mt-3.5 flex flex-wrap gap-2">
            {chips.map((c) => {
              const Icon = c.icon
              const active = section === c.key
              return (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSection(c.key)}
                  className={cn(
                    'inline-flex h-[38px] items-center gap-2 whitespace-nowrap rounded-[10px] border px-[15px] text-[13.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active
                      ? 'border-primary bg-primary font-semibold text-primary-foreground transition-[filter] hover:brightness-105'
                      : 'border-border bg-card font-medium text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <Icon className="h-[15px] w-[15px] flex-none" aria-hidden="true" />
                  {c.label}
                </button>
              )
            })}
          </div>
        ) : (
          // Empty state da busca (§4.3) — aspas curvas de propósito.
          <p className="m-0 mt-4 text-[13.5px] text-muted-foreground">
            Nenhuma configuração encontrada para &ldquo;{query.trim()}&rdquo;.
          </p>
        )}
      </div>

      {/* ---- Seções (§5/§6): "Todas" empilha; chip mostra só a sua ----
          Em "Todas" cada grupo é separado por um filete + respiro maior (o
          título mora fora do card, então o divisor é o que fecha o grupo).
          Com um chip escolhido só há uma seção — nada a separar. */}
      <div className="flex flex-col pb-2.5">
        {available.map((c, i) => (
          <div key={c.key} className={cn(section !== 'todas' && section !== c.key && 'hidden')}>
            {i > 0 && section === 'todas' && (
              <div className="my-8 h-px w-full bg-border" role="presentation" />
            )}
            {sections[c.key]}
          </div>
        ))}
      </div>
    </div>
  )
}
