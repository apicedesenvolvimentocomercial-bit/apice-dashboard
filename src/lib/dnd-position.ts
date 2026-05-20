/**
 * Calcula uma posição fracionária entre dois vizinhos para inserir um item
 * em uma lista ordenada por `position: Float` sem renumerar.
 *
 * - Sem vizinhos: 1000 (ponto de partida convencional).
 * - Início da lista: `next - 1000`.
 * - Fim da lista: `prev + 1000`.
 * - Entre dois vizinhos: média aritmética (1.0 → 1.5 → 2.0...).
 *
 * Usado por dnd-kit em PipelineDeal e Lead — ambos guardam Float fracionário
 * exatamente para permitir essa inserção sem rebalancear.
 */
export function positionBetween(prev: number | null, next: number | null): number {
  if (prev == null && next == null) return 1000
  if (prev == null) return (next as number) - 1000
  if (next == null) return (prev as number) + 1000
  return (prev + next) / 2
}
