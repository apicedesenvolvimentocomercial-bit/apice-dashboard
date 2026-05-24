import { CreateGoalDialog } from './create-goal-dialog'
import { GoalCard } from './goal-card'
import type { GoalAssignTarget, GoalView } from './types'

type Props = {
  clientId: string
  goals: GoalView[]
  // Etapa 2: alvos + permissão de atribuir (passados do server).
  users?: GoalAssignTarget[]
  roles?: GoalAssignTarget[]
  canAssign?: boolean
}

export function GoalsPage({ clientId, goals, users, roles, canAssign }: Props) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Metas</h1>
          <p className="text-muted-foreground">Acompanhe o progresso e a projeção no ritmo atual</p>
        </div>
        <CreateGoalDialog clientId={clientId} users={users} roles={roles} canAssign={canAssign} />
      </div>

      {goals.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          Nenhuma meta ativa. Crie uma para começar a acompanhar progresso.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((g) => (
            // Metas de cargo INDIVIDUAL expandem em 1 linha por membro com o
            // mesmo goal.id → key composta com o membro.
            <GoalCard key={`${g.id}:${g.memberUserId ?? 'base'}`} clientId={clientId} goal={g} />
          ))}
        </div>
      )}
    </div>
  )
}
