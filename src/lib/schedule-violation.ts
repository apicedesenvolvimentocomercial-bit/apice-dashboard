import type { ClinicSchedule } from '@/modules/appointments/types'

/**
 * Regras de expediente da clínica para agendamento. Extraído do dialog da agenda
 * para ser reusado pelo dialog de Agendado do pipeline (CRM) — as duas telas
 * aplicam exatamente as mesmas validações de horário/feriado.
 *
 * Recebe o valor de um input `datetime-local` ("YYYY-MM-DDTHH:mm", wall-clock do
 * browser) e a configuração de expediente; retorna a mensagem do aviso ou null.
 */
function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function getScheduleViolation(dateStr: string, schedule: ClinicSchedule): string | null {
  if (!dateStr) return null
  const dt = new Date(dateStr)
  const dayOfWeek = dt.getDay()
  if (!schedule.workdays.includes(dayOfWeek)) {
    const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
    return `A clínica não atende às ${dayNames[dayOfWeek]}s.`
  }
  const minutes = dt.getHours() * 60 + dt.getMinutes()
  if (minutes < timeToMinutes(schedule.workdayStart)) {
    return `Horário antes da abertura (${schedule.workdayStart}).`
  }
  if (minutes >= timeToMinutes(schedule.workdayEnd)) {
    return `Horário após o fechamento (${schedule.workdayEnd}).`
  }
  const dateOnly = dateStr.slice(0, 10)
  const holiday = schedule.holidays.find((h) => h.date === dateOnly)
  if (holiday) {
    return `Esta data é feriado: ${holiday.name}.`
  }
  return null
}
