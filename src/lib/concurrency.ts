/**
 * Roda `worker` para cada item com paralelismo limitado a `concurrency`.
 * Sem dependências externas — evita adicionar `p-limit` ao bundle do servidor.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0

  async function next(): Promise<void> {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      results[i] = await worker(items[i], i)
    }
  }

  const lanes = Array.from({ length: Math.min(concurrency, items.length) }, () => next())
  await Promise.all(lanes)
  return results
}
