/**
 * Contratos de exibição do calendário — compartilhados entre camadas (server
 * query que produz + componente de render que consome) e entre domínios
 * (admin e clínica). São TIPOS PUROS: sem React, sem server, sem regra de
 * domínio. Vivem em `src/shared` (não em `components/`) para que o server possa
 * importá-los sem inverter o layering (Fase 7).
 */
export type CalendarEvent = {
  id: string
  kind: 'event' | 'holiday'
  title: string
  start: Date
  end: Date | null
  color: string
  link: string | null
  // Source data — para drawer/edit.
  notes: string | null
  category: string | null
  activityId: string | null
  // Série recorrente (item 7) — id compartilhado pelas ocorrências; null = avulso.
  recurrenceGroupId?: string | null
}

export type CalendarHoliday = {
  id: string
  date: string
  name: string
}
