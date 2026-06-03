export const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Agendado',
  CONFIRMED: 'Confirmado',
  ATTENDED: 'Compareceu',
  NO_SHOW: 'Faltou',
  CANCELED: 'Cancelado',
  RESCHEDULED: 'Reagendado',
}

export const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: '#3b82f6',
  CONFIRMED: '#10b981',
  ATTENDED: '#059669',
  NO_SHOW: '#ef4444',
  CANCELED: '#6b7280',
  RESCHEDULED: '#f59e0b',
}

export type ClinicSchedule = {
  workdayStart: string // "HH:MM"
  workdayEnd: string // "HH:MM"
  workdays: number[] // 0=Dom … 6=Sáb
  holidays: { id: string; date: string; name: string }[]
  // Janela de cancelamento → no-show. null = regra do mesmo dia (default);
  // N = horas antes do horário dentro das quais o cancelamento conta como no-show.
  noShowWindowHours: number | null
}

export const DEFAULT_SCHEDULE: ClinicSchedule = {
  workdayStart: '07:00',
  workdayEnd: '20:00',
  workdays: [1, 2, 3, 4, 5, 6],
  holidays: [],
  noShowWindowHours: null,
}

export type AppointmentEvent = {
  id: string
  scheduledAt: Date
  durationMinutes: number
  status: string
  patient: { id: string; name: string; phone: string | null }
  procedure: { id: string; name: string; durationMinutes: number | null }
  notes: string | null
  patientId: string
  procedureId: string
  // Todos os procedimentos do agendamento (combos). procedureIds[0] == procedureId.
  // Opcional p/ compat com chamadores antigos; vazio = só o principal.
  procedureIds?: string[]
  // Card do CRM que gerou o agendamento (Fase 2). null = agendamento manual sem
  // card. `deletedAt != null` = Lead excluído (feat4: pisca na agenda).
  lead?: { id: string; deletedAt: Date | null } | null
}
