import { prisma } from '@/lib/prisma'
import { getClinicContext } from '@/server/auth/clinic-context'

/**
 * Dados do CHROME da clínica (sidebar + topbar do redesign): identidade da
 * clínica no topo da sidebar e rótulo do usuário no rodapé. `clientId` vem do
 * contexto (não-nulo por tipo) — impossível pedir o chrome de outra clínica.
 */
export async function getClinicChrome() {
  const ctx = await getClinicContext()
  const [client, role] = await Promise.all([
    prisma.client.findUnique({
      where: { id: ctx.clientId },
      select: { name: true, city: true, state: true },
    }),
    ctx.clinicRoleId
      ? prisma.clinicRole.findUnique({
          where: { id: ctx.clinicRoleId },
          select: { name: true },
        })
      : Promise.resolve(null),
  ])

  const location = [client?.city, client?.state].filter(Boolean).join(' · ')
  return {
    clinicName: client?.name ?? 'Sua clínica',
    /** Linha secundária sob o nome (cidade · UF); null quando não cadastrada. */
    clinicSub: location || null,
    /** Rótulo do usuário no rodapé: coroa = Titular; senão o nome do cargo. */
    roleLabel: ctx.isOwner ? 'Titular' : (role?.name ?? null),
  }
}
