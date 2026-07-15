/**
 * Catálogo dos ITENS do dashboard da clínica para a matriz de visibilidade por
 * cargo (Etapa 3 / lacuna 2). Hierárquico: seção (master) → itens (filhos). As
 * `key`s são estáveis e usadas tanto no JSON de permissões do cargo
 * (`permissions.dashboard`) quanto no gate de renderização do dashboard.
 *
 * Derivado de `src/modules/dashboard/clinic-dashboard.tsx`. Ao adicionar um KPI
 * ou gráfico lá, espelhe aqui (e no gate) para que possa ser ocultado por cargo.
 *
 * Default OPT-IN: cargo sem entrada `dashboard` não vê nada (titular/admin
 * sempre veem tudo, fora deste catálogo).
 */

export type DashboardItemDef = { key: string; label: string }
export type DashboardSectionDef = {
  key: string
  label: string
  description: string
  items: DashboardItemDef[]
}

export const DASHBOARD_SECTIONS: DashboardSectionDef[] = [
  {
    key: 'commercialKpis',
    label: 'Indicadores comerciais',
    description: 'Cartões de leads, agendamentos e conversão',
    items: [
      { key: 'leads', label: 'Leads totais' },
      { key: 'appointments', label: 'Agendamentos' },
      // Linha secundária dentro do card de No-show (vira card próprio se o
      // cargo esconder o No-show).
      { key: 'attendance', label: 'Comparecimento (no card No-show)' },
      { key: 'noShow', label: 'No-show' },
      { key: 'conversion', label: 'Conversão' },
      { key: 'timeToFirstContact', label: 'Tempo até 1º contato' },
    ],
  },
  {
    key: 'financialKpis',
    label: 'Indicadores financeiros',
    description: 'Cartões de faturamento, custos e margens',
    items: [
      { key: 'revenue', label: 'Faturamento' },
      { key: 'costs', label: 'Custos' },
      { key: 'netProfit', label: 'Lucro líquido' },
      { key: 'averageTicket', label: 'Ticket médio' },
      // 'grossMargin' saiu do dashboard (2026-06-11): a margem bruta vive na
      // aba DRE. Chave antiga em JSONs de cargo fica inerte (sem efeito).
      { key: 'netMargin', label: 'Margem líquida' },
      { key: 'roi', label: 'ROI marketing' },
      { key: 'cac', label: 'CAC' },
      // Linha secundária dentro do card de No-show (card próprio se o cargo
      // esconder o No-show).
      { key: 'lostRevenue', label: 'Receita perdida (no card No-show)' },
      { key: 'healthScore', label: 'Health Score' },
    ],
  },
  {
    key: 'revenueCharts',
    label: 'Gráficos de receita',
    description: 'Séries de receita, custos e funil',
    items: [
      { key: 'revenueGenerated', label: 'Receita gerada x Custos' },
      { key: 'revenueReceived', label: 'Receita recebida x Custos' },
      { key: 'funnel', label: 'Funil de conversão' },
    ],
  },
  {
    key: 'distributions',
    label: 'Distribuições',
    description: 'Receita por procedimento e origem dos leads',
    items: [
      { key: 'revenueByProcedure', label: 'Receita por procedimento' },
      { key: 'leadsBySource', label: 'Origem dos leads' },
    ],
  },
  {
    key: 'tracking',
    label: 'Acompanhamento',
    description: 'Insights ativos, metas e próximos agendamentos',
    items: [
      { key: 'insights', label: 'Insights ativos' },
      { key: 'goals', label: 'Progresso de metas' },
      // Item novo (redesign): dentro de seção ligada, item ausente no JSON do
      // cargo é VISÍVEL por padrão — cargos existentes ganham o card sem edição.
      { key: 'upcomingAppointments', label: 'Próximos agendamentos' },
    ],
  },
]
