import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Escopo de clínica por request (espinha da RLS — ver `prompt/rls-gambiarra.md`).
 *
 * Guarda o `clientId` da clínica logada no contexto assíncrono do request. A
 * extensão do Prisma (em `src/lib/prisma.ts`) lê este valor e injeta
 * `SET app.current_client_id` antes de cada query — as policies de RLS no banco
 * então recusam linha de outra clínica, mesmo que o código de app esqueça o
 * filtro (defesa em profundidade real, no banco).
 *
 * REGRA: só o contexto de CLÍNICA seta isto (`getClinicContext`). Admin/STAFF
 * NÃO setam → GUC fica nulo → a policy `GUC IS NULL` libera tudo (admin vê todas
 * as clínicas da org, por design).
 */
const store = new AsyncLocalStorage<{ clientId: string }>()

/**
 * Fixa o `clientId` no contexto assíncrono atual (o request). Usa `enterWith`
 * porque server actions/queries do Next não nos dão um ponto único para
 * envolver com `run()`; chamamos no topo de `getClinicContext`, e todo await
 * subsequente do mesmo request herda o valor.
 */
export function enterClientScope(clientId: string): void {
  store.enterWith({ clientId })
}

/** `clientId` do escopo atual, ou `null` se não há escopo de clínica (admin). */
export function currentClientId(): string | null {
  return store.getStore()?.clientId ?? null
}

/**
 * Roda `fn` SEM escopo de clínica no contexto async (`currentClientId()` → null
 * dentro de `fn`). Uso: dentro de uma transação interativa sob clínica, a
 * extensão do Prisma embrulharia cada op de modelo num `$transaction` próprio →
 * transação dentro de transação (footgun #2 de `rls-gambiarra.md`). Limpamos o
 * escopo para a extensão passar direto e setamos a GUC manualmente na transação.
 * O escopo do request (via `enterWith`) volta a valer após `fn`.
 */
export function runOutsideClientScope<T>(fn: () => Promise<T>): Promise<T> {
  return store.run(undefined as unknown as { clientId: string }, fn)
}
