import type { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { currentClientId, runOutsideClientScope } from '@/server/tenant/client-scope'

/**
 * Transação interativa SEGURA sob escopo de clínica (footgun #2 de
 * `prompt/rls-gambiarra.md`).
 *
 * Sob escopo de clínica, a extensão de RLS (`src/lib/prisma.ts`) embrulha CADA op
 * de modelo no seu próprio `$transaction([set_config, query])`. Dentro de uma
 * `prisma.$transaction(async tx => …)` isso vira transação aninhada (em conexão
 * diferente) → a GUC cai numa conexão e a query roda noutra → RLS inerte, e a
 * atomicidade da transação externa quebra.
 *
 * Aqui limpamos o escopo (`runOutsideClientScope` → a extensão passa direto) e
 * setamos a GUC `app.current_client_id` manualmente como 1ª instrução da MESMA
 * transação. Resultado: uma única transação, uma conexão, RLS enforçando dentro.
 * Sem escopo de clínica (admin) `scoped` é null → roda sem GUC (policy libera tudo).
 *
 * REGRA: toda transação interativa que toca dado de clínica deve usar este helper,
 * nunca `prisma.$transaction` cru.
 */
export function scopedTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const scoped = currentClientId()
  return runOutsideClientScope(() =>
    prisma.$transaction(async (tx) => {
      if (scoped) {
        await tx.$executeRaw`SELECT set_config('app.current_client_id', ${scoped}, true)`
      }
      return fn(tx)
    })
  )
}
