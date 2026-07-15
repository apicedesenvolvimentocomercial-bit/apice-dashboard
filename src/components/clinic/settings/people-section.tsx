'use client'

import { Users } from 'lucide-react'

import { InviteUserDialog } from '@/modules/clinic-roles/invite-user-dialog'

import { SettingsSectionCard } from './section-card'

/**
 * Seção Pessoas — redesign Senno (Configurações-handoff §13). CTA de convite:
 * banner de borda TRACEJADA com tile dourado, contagem real de membros ativos
 * e convites pendentes (derivada no servidor, não texto fixo) e o botão
 * "Convidar pessoa" (dialog existente — quem entra vem SEM cargo, deny-by-
 * default, até ganhar um em Usuários da clínica).
 */

type Props = {
  clientId: string
  activeMembers: number
  pendingInvites: number
}

function plural(n: number, singular: string, pluralWord: string) {
  return `${n} ${n === 1 ? singular : pluralWord}`
}

export function PeopleSection({ clientId, activeMembers, pendingInvites }: Props) {
  return (
    <SettingsSectionCard
      title="Pessoas"
      description="Convide membros da equipe para acessar o Senno. Cada pessoa recebe um e-mail com o link de acesso e assume um cargo depois."
    >
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-dashed border-border bg-background px-[22px] py-5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[11px] bg-primary/[0.14] text-primary-text">
            <Users className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="text-[13.5px] font-semibold">Convide sua equipe</div>
            <div className="mt-0.5 text-[12.5px] text-muted-foreground">
              Você tem {plural(activeMembers, 'membro ativo', 'membros ativos')} e{' '}
              {plural(pendingInvites, 'convite pendente', 'convites pendentes')}.
            </div>
          </div>
        </div>
        <InviteUserDialog clientId={clientId} />
      </div>
    </SettingsSectionCard>
  )
}
