// Tempo relativo FINO do redesign de Insights ("há 18 min", "há 1 h", "ontem",
// "há 3 dias", "há 1 sem") — o `formatDateRelative` de lib/utils é por dia e
// não cobre a granularidade de minutos/horas que o card e o selo "Última
// análise" pedem (Insights-handoff §5.2/§6.4).

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const WEEK = 7 * DAY

export function timeAgo(date: Date | string, now: Date = new Date()): string {
  const d = new Date(date)
  const diff = now.getTime() - d.getTime()
  if (diff < MIN) return 'agora'
  if (diff < HOUR) return `há ${Math.floor(diff / MIN)} min`
  if (diff < DAY) return `há ${Math.floor(diff / HOUR)} h`
  if (diff < 2 * DAY) return 'ontem'
  if (diff < WEEK) return `há ${Math.floor(diff / DAY)} dias`
  const weeks = Math.floor(diff / WEEK)
  return weeks === 1 ? 'há 1 sem' : `há ${weeks} sem`
}

const MONTHS_SHORT = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
]

/** "22/jun" no fuso da app — usado na nota "Resolvido em {data}" (handoff §10). */
export function shortDate(date: Date | string): string {
  const d = new Date(date)
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: 'numeric',
  }).formatToParts(d)
  const day = parts.find((p) => p.type === 'day')?.value ?? '01'
  const month = Number(parts.find((p) => p.type === 'month')?.value ?? '1')
  return `${day}/${MONTHS_SHORT[month - 1]}`
}
