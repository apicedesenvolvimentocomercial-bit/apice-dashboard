import { prisma } from '@/lib/prisma'
import { can } from '@/server/auth/permissions'
import { getCurrentGoalValue, listGoals, type GoalRow } from '@/server/repositories/goal-repository'
import { assertClientAccess, getTenantContext } from '@/server/tenant/context'
import { assertCan } from '@/server/auth/assert-can'

export type GoalWithProgress = GoalRow & {
  currentValue: number
  progressPct: number
  daysLeft: number
  projectedAtPace: number | null
  // Etapa 2: rótulo do "dono" da linha (usuário/cargo/clínica) p/ a UI.
  scopeLabel: string
  // Para metas de cargo expandidas: id sintético por membro (a meta-base é a
  // mesma no DB). null = linha 1:1 com a meta.
  memberUserId: string | null
}

type GoalProgressOptions = {
  includePast?: boolean
  // Quando true, NÃO filtra por visibilidade (admin vendo a clínica). Default
  // false: aplica a regra de viewAll/atribuição do viewer.
  unscoped?: boolean
}

function computeProgress(
  g: GoalRow,
  current: number,
  now: Date
): Omit<GoalWithProgress, keyof GoalRow | 'scopeLabel' | 'memberUserId'> {
  const target = Number(g.targetValue)
  const progressPct = target > 0 ? (current / target) * 100 : 0
  const totalDays = Math.max(
    1,
    Math.ceil((g.endDate.getTime() - g.startDate.getTime()) / (1000 * 60 * 60 * 24))
  )
  const daysElapsed = Math.max(
    0,
    Math.min(totalDays, Math.ceil((now.getTime() - g.startDate.getTime()) / (1000 * 60 * 60 * 24)))
  )
  const daysLeft = Math.max(0, totalDays - daysElapsed)
  const projectedAtPace = daysElapsed > 0 ? Math.round((current / daysElapsed) * totalDays) : null
  return { currentValue: current, progressPct, daysLeft, projectedAtPace }
}

export async function getGoalsWithProgress(
  clientId: string,
  options?: GoalProgressOptions
): Promise<GoalWithProgress[]> {
  const ctx = await getTenantContext()
  await assertClientAccess(ctx, clientId)
  await assertCan(ctx, 'goals', 'read')

  const goals = await listGoals(ctx, clientId, options?.includePast ?? false)
  const now = new Date()

  // Visibilidade (decisão D3): admin/unscoped vê tudo; senão titular OU quem tem
  // goals.viewAll vê tudo; demais veem só CLINIC + atribuídas a si + ao seu cargo.
  const isClinic = ctx.role === 'CLIENT_OWNER' || ctx.role === 'CLIENT_STAFF'
  let seeAll = true
  if (!options?.unscoped && isClinic) {
    seeAll = await can(ctx.userId, ctx.role, 'goals', 'viewAll')
  }

  // Mapa de membros por cargo (p/ expandir metas ROLE e p/ progresso por membro).
  const roleIds = [...new Set(goals.map((g) => g.assigneeRoleId).filter(Boolean) as string[])]
  const membersByRole = new Map<string, { id: string; name: string }[]>()
  if (roleIds.length > 0) {
    const members = await prisma.user.findMany({
      where: { clientId, clinicRoleId: { in: roleIds }, deletedAt: null },
      select: { id: true, name: true, clinicRoleId: true },
      orderBy: { name: 'asc' },
    })
    for (const id of roleIds) membersByRole.set(id, [])
    for (const m of members) {
      if (m.clinicRoleId) membersByRole.get(m.clinicRoleId)?.push({ id: m.id, name: m.name })
    }
  }

  // Nomes p/ rótulos (usuários atribuídos + cargos).
  const userIds = [...new Set(goals.map((g) => g.assigneeUserId).filter(Boolean) as string[])]
  const [userMap, roleMap] = await Promise.all([
    userIds.length
      ? prisma.user
          .findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
          .then((us) => new Map(us.map((u) => [u.id, u.name])))
      : new Map<string, string>(),
    roleIds.length
      ? prisma.clinicRole
          .findMany({ where: { id: { in: roleIds } }, select: { id: true, name: true } })
          .then((rs) => new Map(rs.map((r) => [r.id, r.name])))
      : new Map<string, string>(),
  ])

  const out: GoalWithProgress[] = []

  for (const g of goals) {
    // Filtro de visibilidade.
    if (!seeAll) {
      const mineUser = g.scopeType === 'USER' && g.assigneeUserId === ctx.userId
      const mineRole =
        g.scopeType === 'ROLE' && g.assigneeRoleId && ctx.clinicRoleId === g.assigneeRoleId
      const clinic = g.scopeType === 'CLINIC'
      if (!clinic && !mineUser && !mineRole) continue
    }

    if (g.scopeType === 'ROLE' && g.assigneeRoleId) {
      const members = membersByRole.get(g.assigneeRoleId) ?? []
      const roleName = roleMap.get(g.assigneeRoleId) ?? 'Cargo'

      if (g.mode === 'INDIVIDUAL') {
        // Uma linha por membro, mesma cota, progresso pelo autor (decisão).
        // Se o viewer não vê tudo, mostra só a própria linha.
        const visibleMembers = seeAll ? members : members.filter((m) => m.id === ctx.userId)
        for (const m of visibleMembers) {
          const current = await getCurrentGoalValue(ctx, clientId, g, m.id)
          out.push({
            ...g,
            ...computeProgress(g, current, now),
            scopeLabel: `${roleName} · ${m.name}`,
            memberUserId: m.id,
          })
        }
      } else {
        // SHARED: uma linha agregada do grupo (total da clínica no período).
        const current = await getCurrentGoalValue(ctx, clientId, g)
        out.push({
          ...g,
          ...computeProgress(g, current, now),
          scopeLabel: `${roleName} (equipe)`,
          memberUserId: null,
        })
      }
      continue
    }

    if (g.scopeType === 'USER' && g.assigneeUserId) {
      const measureBy = g.mode === 'INDIVIDUAL' ? g.assigneeUserId : null
      const current = await getCurrentGoalValue(ctx, clientId, g, measureBy)
      out.push({
        ...g,
        ...computeProgress(g, current, now),
        scopeLabel: userMap.get(g.assigneeUserId) ?? 'Usuário',
        memberUserId: g.assigneeUserId,
      })
      continue
    }

    // CLINIC (coletiva).
    const current = await getCurrentGoalValue(ctx, clientId, g)
    out.push({
      ...g,
      ...computeProgress(g, current, now),
      scopeLabel: 'Clínica',
      memberUserId: null,
    })
  }

  return out
}
