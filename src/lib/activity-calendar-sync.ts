export type ActivityCalendarSyncMode = 'AUTO' | 'ASK' | 'NEVER'

/**
 * Regra pura: dado o modo do usuário e o flag opcional vindo do checkbox da
 * UI, retorna se a atividade deve gerar um evento no calendário pessoal do
 * responsável.
 *
 * - AUTO: sempre cria, ignora o flag (não há checkbox visível na UI).
 * - NEVER: nunca cria, ignora o flag.
 * - ASK: decide pelo flag (checkbox marcado / desmarcado).
 *
 * Extraído da action por dois motivos: (1) `'use server'` só exporta async,
 * (2) regra de decisão sem efeito colateral é mais fácil de testar.
 */
export function decideCalendarSync(
  pref: ActivityCalendarSyncMode,
  uiFlag: boolean | undefined
): boolean {
  if (pref === 'AUTO') return true
  if (pref === 'NEVER') return false
  return uiFlag === true
}
