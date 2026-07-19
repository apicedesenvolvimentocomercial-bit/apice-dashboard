'use client'

import { HelpCircle, Sparkles, Leaf, BellRing, Crown, LifeBuoy } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

type StageHelp = {
  icon: LucideIcon
  color: string
  name: string
  when: string
  goal: string
  desc: string
}

// Espelha as 5 etapas nativas de RETENÇÃO (retencao-reforma-progresso.md). Cores
// batem com RETENTION_NATIVE_STAGES no pipeline-repository.
const STAGES: StageHelp[] = [
  {
    icon: Sparkles,
    color: '#a855f7',
    name: 'Pós-procedimento',
    when: '0–24h',
    goal: 'Encantamento',
    desc: 'Logo após o atendimento. Hora de agradecer, enviar cuidados pós-procedimento e a pesquisa de satisfação — o cliente está engajado e receptivo.',
  },
  {
    icon: Leaf,
    color: '#22c55e',
    name: 'Nutrição',
    when: '2–15 dias',
    goal: 'Cuidado real',
    desc: 'Mantém o vínculo ativo: conteúdo educativo, dicas em casa e lembrete de manutenção. Cria o hábito de voltar.',
  },
  {
    icon: BellRing,
    color: '#f59e0b',
    name: 'Reativação',
    when: 'janela de retorno venceu',
    goal: 'Autoridade',
    desc: 'O paciente passou da janela de recorrência do procedimento e não remarcou. Régua de reativação com oferta de continuidade.',
  },
  {
    icon: Crown,
    color: '#3b82f6',
    name: 'Fidelização',
    when: 'recorrente + retorno marcado',
    goal: 'Recorrência',
    desc: 'Cliente recorrente e comprometido (já tem retorno agendado). Foco em programa de fidelidade e indicação.',
  },
  {
    icon: LifeBuoy,
    color: '#ef4444',
    name: 'Salvamento',
    when: 'inativo há muito tempo',
    goal: 'Comunidade',
    desc: 'Sumiu por um longo período. Campanha "sentimos sua falta" com oferta de reativação — reconquistar custa menos que adquirir.',
  },
]

/** Ícone "?" com popover explicando as 5 etapas do funil de retenção. */
export function RetentionHelp() {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Como funciona o funil de retenção"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <HelpCircle className="h-4 w-4" />
      </PopoverTrigger>
      {/* Em telas baixas o conteúdo não cabe: limita pela altura disponível que o
          Radix expõe e rola a lista (o cabeçalho fica fixo). */}
      <PopoverContent
        align="start"
        collisionPadding={12}
        className="flex max-h-[min(var(--radix-popover-content-available-height),34rem)] w-96 max-w-[calc(100vw-1.5rem)] flex-col p-0"
      >
        <div className="shrink-0 border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Funil de retenção</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            As etapas são automáticas: o sistema move cada paciente conforme o tempo desde a última
            visita e a recorrência do procedimento.
          </p>
        </div>
        <ol className="min-h-0 flex-1 divide-y divide-border overflow-y-auto [scrollbar-gutter:stable]">
          {STAGES.map((s, i) => {
            const Icon = s.icon
            return (
              <li key={s.name} className="flex gap-3 px-4 py-3">
                <div className="flex flex-col items-center gap-1">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${s.color}1a`, color: s.color }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  {i < STAGES.length - 1 && <span className="w-px flex-1 bg-border" />}
                </div>
                <div className="min-w-0 flex-1 pb-0.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium">{s.name}</span>
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {s.when}
                    </span>
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wide"
                      style={{ color: s.color }}
                    >
                      {s.goal}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.desc}</p>
                </div>
              </li>
            )
          })}
        </ol>
      </PopoverContent>
    </Popover>
  )
}
