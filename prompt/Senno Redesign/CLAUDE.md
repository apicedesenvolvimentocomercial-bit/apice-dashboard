# Senno — contexto de design (persistente)

Redesign de um SaaS multi-tenant para gestão de clínicas de estética (pt-BR).
Marca: **dourado sobre off-white/grafite** — sóbrio, premium, operacional. Stack-alvo real:
Next 16 + Tailwind v3 + shadcn/ui. Aqui prototipamos cada tela como **Design Component**
(`.dc.html`) fiel a esse design system.

## Telas já construídas (reutilize como referência/base)

- `Dashboard Clinica.dc.html` — KPIs com % comparativa (só faturamento, lucro líquido, ticket
  médio, custos), gráfico Receita×Custos (8 meses), metas, agenda, funil, atividades.
- `Funil.dc.html` — kanban (antes "Pipeline", agora **Funil**). Abas Comercial/Retenção em
  switch dourado; colunas em container fluido; card vazio tracejado; "+" só na 1ª etapa (Lead).
- `Atividades.dc.html` — chips de pastas/cargos + abas Hoje/Semana/Atrasadas/Todas/Feitas com
  contadores; banner de atrasada; ícone por tipo de tarefa (+ ícone padrão p/ tipo personalizado).
- `Agenda.dc.html` — sub-abas Agendamentos (grade semanal) e Calendário (mês). **Cor reservada
  só para HOJE (dourado suave) e dias FECHADOS (hachura cinza diagonal)**; eventos num único
  tratamento dourado calmo. Toolbar tem botão de filtros (sliders).

**Para uma tela nova: copie o arquivo mais parecido e edite** — assim o chrome e os tokens vêm prontos.

## Tokens (cole o bloco `<style>` exatamente assim em cada DC)

Light em `.senno`, dark em `.senno[data-theme="dark"]`. Cores em `hsl(var(--token))`.

Light: `--background:38 14% 97%` · `--foreground:220 9% 12%` · `--card:0 0% 100%` ·
`--primary:42 53% 42%` · `--primary-foreground:225 11% 7%` (escuro!) ·
`--primary-text:42 53% 33%` (dourado p/ TEXTO, mais escuro p/ AA) ·
`--muted:38 18% 90%` / `--muted-foreground:25 15% 38%` · `--accent:38 18% 90%` ·
`--border:38 20% 85%` · `--input:38 20% 85%` · `--ring:42 65% 52%` · `--destructive:0 72% 48%`.

Dark: `--background:225 11% 7%` · `--foreground:38 33% 96%` · `--card:220 9% 11%` ·
`--primary:42 65% 58%` · `--primary-foreground:225 11% 7%` · `--primary-text:42 65% 58%` ·
`--muted:220 9% 16%` / `--muted-foreground:38 15% 65%` · `--border:220 9% 18%` ·
`--ring:42 65% 58%` · `--destructive:0 63% 50%`.

Extras usados: sombra tingida `--shadow:220 28% 22%; --shadow-a:0.07` (dark `0 0% 0%`/`0.4`).

## Regras de cor (não quebrar — dark mode + WCAG AA dependem disso)

- **Sempre token semântico** para chrome. Nunca `white/black/gray-*` em texto/fundo/borda.
- **Dois tons de dourado:** botão/superfície = `bg primary` + `primary-foreground` (texto ESCURO);
  link/ícone-texto/nav ativo/logo = `primary-text` (dourado escuro).
- Texto secundário → `muted-foreground`. Bordas → `border`. Foco → `ring`.

## Fonte

**Inter** (decisão do usuário; descartamos Ranade). Pesos 500/600 p/ hierarquia.
`font-variant-numeric: tabular-nums` em KPIs, horários, contadores e tabelas.

## Chrome compartilhado (idêntico em todas as telas)

- **Sidebar 236px** `bg-card`, logo "B" dourado + "Clínica Bellavie / Plano Premium", rodapé
  com avatar "HC / Dra. Helena Costa / Proprietária".
- **Ordem da nav (fixa, menu plano, sem seções):** Dashboard · Atividades · Agenda · Funil ·
  Pacientes · Financeiro · Metas · Insights · Procedimentos · Exportações · Notificações ·
  Configurações. Item ativo: `primary-text` + `bg accent`.
- **Topbar** `bg-card`: título à esquerda; à direita **busca "Buscar paciente…"**, toggle de
  tema (sol/lua), sino com dot, e **botão dourado "Novo lead"**. Esse padrão (busca + Novo lead)
  vai em TODAS as abas, exceto o Funil que já tem busca própria.
- Botão de **ação da página fica dentro do conteúdo** (não no header), alinhado à barra de abas.
- Toggle de tema: ícone **sol no claro / lua no escuro**.

## Ícones (SVG stroke inline, viewBox 24, currentColor)

Helper `I(p)` gera o SVG. Conjunto já pronto nos arquivos: grid, activity, calendar, funnel,
users, money, target, bulb(ideia), syringe, download, bell, settings, search, plus, chevL/R,
phone, message, check, check-square, folder, alert, sun, moon, sliders(filtros, círculos
vazados), calPlus. **Lupa = busca; lâmpada = Insights/ideia.** Reaproveite — não invente novos.

## Padrões visuais recorrentes

- Cartões: `bg-card` + `1px border` + `border-radius:11–13px` + sombra tingida sutil; hover sobe
  borda p/ `primary/0.5`.
- Switch/segmented dourado: trilho `bg-muted`+border, item ativo `bg-primary`+`primary-foreground`.
- Abas de conteúdo: underline 2px dourado; **a linha fina corta no fim da última aba** (não
  atravessa a linha toda).
- Estados: hover/active/focus em tudo; **empty state composto** (ícone+título+texto+ação);
  skeleton no lugar de spinner; erro inline (sem alert()).
- Dados de exemplo: brasileiros realistas (nomes, R$, telefones), sentence case, sem "Oops!".

## Falta fazer (próximas telas, mesmo padrão)

Procedimentos · Metas · Configurações.
Opcional na Agenda: ligar visões Dia/Lista e o filtro do topo.

`Notificações` já construída (2026-07-14): o SINO da topbar já estava redesenhado
(`topbar-notifications.tsx`, §3.3) — faltava o CORPO. Barra de abas de categoria com
indicador MEDIDO + "Marcar todas como lidas" (§4); lista agrupada Hoje/Esta semana/
Anteriores num card por grupo (§6/§7); linha com tile por categoria, título 500/600 + dot,
descrição, botão de ação (deep-link) e carimbo; botão de alternância marcar-lida (check
dourado) / dispensar (X, saída animada slide+colapso — classe CSS `senno-notif-*` +
setTimeout 850, padrão do Atividades); vazio composto por aba. Helper novo
`notification-category.tsx` (deriva categoria de `type`+`link`; tints §8).
Desvios: categoria NÃO é persistida no modelo `Notification` → derivada de `type`+`link`
(crm=`/crm…`, financial=`/financial`); abas = uma por categoria REAL (Todas · Não lidas ·
Leads · Atividades · Financeiro · Metas · Insights · Pacientes) — a "Agenda" do protótipo
saiu (sem tipo de aviso real), entraram Metas/Insights/Pacientes, `sistema` só em "Todas"
(decisão de produto 2026-07-14); barra de abas rola no X (não `flex-wrap`) p/ preservar o
indicador de linha única; colapso dedicado de grupo vazio não implementado (a linha já
colapsa e o grupo é omitido); botão de ação só faz deep-link (marcar lida é do toggle);
`now` vem do servidor via prop (SSR determinístico nos carimbos/grupos).

`Exportações` já construída (2026-07-13): barra de Período (De/Até + segmented de 4 presets
com pílula oculta quando nada selecionado; campos e presets mutuamente exclusivos) + grade
`auto-fit minmax(322px,1fr)` — card PDF (CTA ghost único) e 9 datasets com CSV/Excel ghost.
Desvios: card primário sem destaque estático (decisão 2026-07-14: o dourado borda+tile do
`exec` virou HOVER padrão de todos os cards — borda `primary/45` + tile `primary/0.16` +
`primary-text` via `group-hover`; /45 de propósito: o override `.dark .hover:border-primary/50`
do globals.css apagaria o dourado no dark, e aqui ele vale nos DOIS temas);
`descHint` fora; `scope` → chip "Período"/"Base completa";
Excel com busy próprio; download fetch+blob (toast sucesso, erro inline + retry);
`input[type=date]` ganhou `color-scheme` por tema no `globals.css` (global, vale p/ dialogs).

`Insights` já construída (2026-07-13): resumo por severidade (só ativos), 5 abas de status
(underline medido + contadores), cards expansíveis (grid-rows 0fr↔1fr) com métrica destacada
(`metadata.metric` das 10 regras do engine; fallback impacto estimado), recomendação, nota de
estado e ações por status; vazio composto por aba; deep-link do Dashboard por ID + anel de
destaque que persiste até o clique no card (decisão de produto; protótipo usava 2600ms).
Desvios: "Criar tarefa"/"Ver tarefa" → "Iniciar ação" (atividade exige alvo lead/paciente);
diagnóstico renderizado no corpo (títulos do engine são genéricos); Dispensar mantém dialog
de motivo (backend exige); nova action `reopenInsightAction` (Reabrir).

`Financeiro` já construída (2026-07-11): 6 abas (Visão Geral/DRE/Receitas/Contas a
Receber/Custos/Ativos) em underline medido; rankings novos (Top compradores por
`Revenue.patientId`, Top vendedores por `Revenue.createdById`); KPIs de caixa novos
(saldo projetado 30d, taxa de inadimplência = vencido ÷ pendente). Pendente: seção
"Ativos tangíveis (comprados)" do protótipo (precisa de modelo de manutenção).

`Pacientes` já construída (2026-07-10): abas Todos/Ativos/Inativos (underline medido +
contadores), tabela em card com tags/pill de agendamentos, paginação, vazio composto; status
ativo/inativo derivado de `lastVisitAt` vs. corte de 120d (espelha `Client.winbackDays`).
