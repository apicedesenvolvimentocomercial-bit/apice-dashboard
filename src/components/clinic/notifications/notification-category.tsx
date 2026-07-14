import {
  AlertTriangle,
  Bell,
  CalendarClock,
  Filter,
  Gift,
  Lightbulb,
  Target,
  Wallet,
} from 'lucide-react'
import type { NotificationType } from '@prisma/client'

/**
 * Categorias do CORPO da página de Notificações (redesign — handoff §8).
 *
 * A `Notification` real NÃO persiste categoria: o override (`crm`/`financial`)
 * vive só no dispatch (notification-service). Por isso derivamos a categoria
 * do par `type` + `link` — confiável para todas as fontes atuais:
 * crm usa `link:/crm…`, financial usa `link:/financial`; os demais tipos
 * mapeiam 1:1. Desvio do protótipo: a aba "Agenda" (sem tipo de aviso real)
 * saiu; entraram Metas/Insights/Pacientes (decisão de produto 2026-07-14 —
 * uma aba por categoria real).
 *
 * ⚠️ As tints aqui são a paleta ampla do CORPO (§8), diferente da paleta menor
 * do sino da topbar (§3.3, em `topbar-notifications.tsx`). Não unifique.
 */
export type NotificationCategory =
  | 'leads'
  | 'financeiro'
  | 'tarefas'
  | 'metas'
  | 'insights'
  | 'pacientes'
  | 'sistema'

/** Deriva a categoria de uma notificação real a partir do tipo + link. */
export function notificationCategory(
  type: NotificationType,
  link: string | null
): NotificationCategory {
  switch (type) {
    case 'INSIGHT_GENERATED':
      return 'insights'
    case 'GOAL_AT_RISK':
    case 'GOAL_ACHIEVED':
      return 'metas'
    case 'ACTIVITY_DUE':
    case 'ACTIVITY_OVERDUE':
      return 'tarefas'
    case 'CLIENT_INACTIVE':
      return 'pacientes'
    case 'SYSTEM':
    default:
      // SYSTEM cobre crm (lead parado) e financial (parcela vencida), ambos
      // distinguíveis só pelo link — mais avisos genéricos caem em 'sistema'.
      if (link?.startsWith('/crm')) return 'leads'
      if (link?.startsWith('/financial')) return 'financeiro'
      return 'sistema'
  }
}

type CategoryMeta = {
  /** Rótulo pt-BR (usado na aba e como referência). */
  label: string
  icon: React.ElementType
  /** Tint do tile: fundo + cor. Strings CSS aplicadas via `style` (não classe)
   *  — os HSL fixos de série têm `/` e espaços que o Tailwind não parseia, e os
   *  tokens `hsl(var(--x))` resolvem por cascata no `style` (theme-reactive).
   *  Mesma técnica do `clinic-activity-row.tsx`. */
  bg: string
  color: string
}

/**
 * Tints por categoria (§8). Dourado (leads/metas/insights) e destructive
 * (tarefas) seguem tokens; financeiro/pacientes usam HSL fixos de série de
 * dados (não têm token) — mantidos constantes nos dois temas, como o donut do
 * Dashboard. Aqui: financeiro verde 142, pacientes roxo 262.
 */
const META: Record<NotificationCategory, CategoryMeta> = {
  leads: {
    label: 'Leads',
    icon: Filter,
    bg: 'hsl(var(--primary) / 0.14)',
    color: 'hsl(var(--primary-text))',
  },
  financeiro: {
    label: 'Financeiro',
    icon: Wallet,
    bg: 'hsl(142 58% 44% / 0.16)',
    color: 'hsl(142 52% 36%)',
  },
  tarefas: {
    label: 'Atividades',
    icon: AlertTriangle,
    bg: 'hsl(var(--destructive) / 0.13)',
    color: 'hsl(var(--destructive))',
  },
  metas: {
    label: 'Metas',
    icon: Target,
    bg: 'hsl(var(--primary) / 0.14)',
    color: 'hsl(var(--primary-text))',
  },
  insights: {
    label: 'Insights',
    icon: Lightbulb,
    bg: 'hsl(var(--primary) / 0.14)',
    color: 'hsl(var(--primary-text))',
  },
  pacientes: {
    label: 'Pacientes',
    icon: Gift,
    bg: 'hsl(262 52% 58% / 0.16)',
    color: 'hsl(262 48% 56%)',
  },
  sistema: {
    label: 'Sistema',
    icon: Bell,
    bg: 'hsl(var(--accent))',
    color: 'hsl(var(--muted-foreground))',
  },
}

export function categoryMeta(cat: NotificationCategory): CategoryMeta {
  return META[cat]
}

/** Ícone do tile de uma linha (respeita o tipo p/ nuances dentro da categoria). */
export function NotificationTileIcon({
  type,
  link,
  className,
}: {
  type: NotificationType
  link: string | null
  className?: string
}) {
  // ACTIVITY_DUE mostra relógio (prazo), ACTIVITY_OVERDUE mostra alerta.
  const Icon =
    type === 'ACTIVITY_DUE' ? CalendarClock : categoryMeta(notificationCategory(type, link)).icon
  return <Icon className={className} aria-hidden="true" />
}
