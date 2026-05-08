import { prisma } from '@/lib/prisma'

export async function createDefaultPipelineStages(clientId: string) {
  const stages = [
    { name: 'Lead', order: 1, color: '#6366f1', isWon: false, isLost: false },
    { name: 'Agendado', order: 2, color: '#f59e0b', isWon: false, isLost: false },
    { name: 'Compareceu', order: 3, color: '#3b82f6', isWon: false, isLost: false },
    { name: 'Fechado', order: 4, color: '#10b981', isWon: true, isLost: false },
    { name: 'Perdido', order: 5, color: '#ef4444', isWon: false, isLost: true },
  ]

  return prisma.pipelineStage.createMany({
    data: stages.map((s) => ({ ...s, clientId })),
  })
}
