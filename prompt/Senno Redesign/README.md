# Handoff: Senno — redesign do SaaS de gestão de clínicas de estética

> Pacote para implementação no codebase real com Claude Code (ou qualquer dev).
> **Leia este README inteiro antes de escrever qualquer linha.**

---

## 0. Regras para o agente (Claude Code) — leia primeiro

Estas regras existem para **impedir divergência/alucinação** em relação ao design já aprovado:

1. **A fonte de verdade é `design.md`.** Não invente cores, espaçamentos, componentes, ícones ou padrões que não estejam lá. Se algo não estiver documentado, **pergunte** — não improvise.
2. **Os arquivos `.dc.html` são REFERÊNCIA de design, não código para copiar.** Eles rodam num runtime de protótipo (sintaxe de template própria, não JSX de produção). **Não** copie a sintaxe deles. Use-os para conferir layout, medidas, comportamento e microinterações.
3. **Recrie no stack-alvo real:** Next 16 + Tailwind v3 + shadcn/ui. Use os componentes/patterns que já existirem no codebase antes de criar novos.
4. **Nunca use `white` / `black` / `gray-*` literais em chrome.** Só tokens semânticos (`bg-card`, `text-muted-foreground`, `border-border`…). Dark mode e contraste WCAG AA dependem disso.
5. **Dois dourados com papéis distintos:** `primary` (superfície: botões/fills, texto ESCURO em cima) vs. `primary-text` (dourado escuro para texto/links/ícone-texto/nav ativo). Nunca troque os papéis.
6. **Ícones:** use `lucide-react` (mapeia 1:1 o set do protótipo). Não desenhe SVG novo.
7. **Gráficos:** no real, use Recharts (ou similar) mapeando `stroke`/`fill` para os tokens — não recrie os hacks de CSS puro dos protótipos.
8. Cubra sempre os 4 estados por tela: carregado, skeleton, vazio (composto), erro (inline). **Nunca `alert()`.**
9. Copy em **português-BR, sentence case**, dados de exemplo brasileiros realistas. Sem emoji.

---

## Overview

Senno é um SaaS multi-tenant (pt-BR) para gestão de clínicas de estética. Marca: **dourado sobre off-white/grafite** — sóbrio, premium, operacional. Este pacote cobre o redesign completo do produto: chrome compartilhado (sidebar + topbar) e as telas de conteúdo.

## About the Design Files

Os arquivos `.dc.html` neste bundle são **referências de design criadas em HTML** — protótipos de alta fidelidade que mostram a aparência e o comportamento pretendidos, **não código de produção para copiar**. A tarefa é **recriar esses designs no ambiente do codebase-alvo** (Next 16 + Tailwind v3 + shadcn/ui), usando os padrões e bibliotecas já estabelecidos ali. Se algum padrão de infra ainda não existir no codebase, siga as convenções do próprio codebase para criá-lo.

## Fidelity

**Alta fidelidade (hifi).** Cores finais, tipografia, espaçamento e interações estão definidos. Recrie a UI de forma fiel usando as libs/patterns do codebase. Medidas e valores exatos estão em `design.md`.

## Documentos de referência (nesta pasta)

- **`design.md`** — **o documento principal.** Design system completo: tokens (light + dark), regras de cor, tipografia, chrome compartilhado, todos os componentes/padrões, ícones, movimento, conteúdo, e checklist de tela nova. Inclui bloco `:root` pronto para `globals.css` e orientação de `tailwind.config`.
- **`CLAUDE.md`** — regras persistentes resumidas do projeto (versão condensada do `design.md`).
- **Uma subpasta por tela** (ver abaixo) — cada uma traz o(s) protótipo(s) `.dc.html`, o handoff item-a-item da tela e uma cópia de `support.js` para preview local.

## Organização por tela (uma pasta por tela)

Os 3 docs acima (`README.md`, `design.md`, `CLAUDE.md`) são **contexto global** e ficam na raiz deste pacote. Cada tela mora numa **subpasta auto-contida**, para o Claude Code atacar uma rota de cada vez sem se perder:

```
design_handoff_senno/
  README.md · design.md · CLAUDE.md      ← contexto global (ler primeiro)
  Dashboard/
    Dashboard Clinica.dc.html            ← protótipo da tela
    Grafico Receita.dc.html              ← componente importado pela tela
    dashboard-handoff.md                 ← spec item-a-item da tela
    support.js                           ← runtime p/ preview local (cópia)
  <Próxima tela>/  (mesmo padrão, adicionada conforme os handoffs são produzidos)
```

**Convenção de cada subpasta:** `NomeTela.dc.html` + qualquer componente que ela importe + `nome-handoff.md` (spec granular) + `support.js`. Por causa dessa cópia local do `support.js`, cada pasta abre no navegador sozinha (o `.dc.html` procura `./support.js` na mesma pasta).

### Telas do produto (protótipos)

Cada `.dc.html` corresponde a uma rota/tela; todas compartilham o mesmo chrome (sidebar 236px + topbar). Detalhe de cada padrão está na seção 5 do `design.md`. Telas ainda sem subpasta/handoff próprio permanecem como referência de layout:

- **`Dashboard/`** — ✅ handoff completo. KPIs com % comparativa, gráfico Receita×Custos, metas, donut de origem, receita por procedimento, agenda, funil, insights.
- `App.dc.html` — shell/composição do app (moldura + roteamento entre telas).
- **`Atividades/`** — ✅ CONCLUÍDO (handoff + implementado no produto). Chips de pastas/cargos + abas Hoje/Semana/Atrasadas/Todas/Feitas com contadores; banner de atrasada; ícone por tipo de tarefa.
- **`Agenda/`** — ✅ CONCLUÍDO (handoff + implementado no produto). Sub-abas Agendamentos (grade semanal) e Calendário (mês); cor reservada só p/ HOJE e dias FECHADOS; toolbar com filtros.
- **`Funil/`** — ✅ CONCLUÍDO (handoff + implementado no produto, 2026-07-10). Kanban; abas Comercial/Retenção em switch dourado; card vazio tracejado; busca ampla no corpo (a do topbar some nesta tela); drawer lateral 460px do lead com abas Info/Atividades/Anotações/Documentos.
- **`Pacientes/`** — ✅ CONCLUÍDO (handoff + implementado no produto, 2026-07-10). Abas de segmento Todos/Ativos/Inativos com underline dourado medido + contadores; tabela num card (avatar, pill de agendamentos, tags nos 5 tipos); paginação client-side; vazio composto tracejado; row → drawer unificado. "Novo paciente" no conteúdo (o "Novo lead" global fica no topbar). Botão "Filtros" decorativo OMITIDO (mesma decisão da Agenda).
- **`Financeiro/`** — ✅ CONCLUÍDO (handoff + implementado no produto, 2026-07-11). 6 abas em underline dourado medido: Visão Geral (8 KPIs c/ delta + gráfico Receita×Custos janela-12 + 4 rankings com popover "Ver todos"), DRE (segmented dourado + cascata), Receitas (filtros REAIS em popover), Contas a Receber (4 cards de resumo agregados no servidor + parcelas expansíveis), Custos e Ativos (seções com tooltip + rodapés de total + vazio por seção). Seção "Ativos tangíveis (comprados)" do protótipo NÃO implementada (exige modelo novo de manutenção — decisão de produto pendente); gráfico termina no mês atual (projeção ±12m saiu; o KPI "Saldo projetado 30d" cobre o curto prazo).
- `Metas.dc.html` — metas e progresso.
- **`Insights/`** — ✅ CONCLUÍDO (handoff + implementado no produto, 2026-07-13). Resumo por
  severidade (3 cards) contando SÓ ativos; 5 abas de status em underline dourado medido com
  contadores; cards expansíveis (grid-rows 0fr↔1fr + chevron) com métrica destacada no cabeçalho
  (`metadata.metric {value,label}` emitido pelas 10 regras do engine; fallback = impacto estimado),
  recomendação com lâmpada, nota de estado (Resolvido em dd/mmm · Dispensado) e ações por status;
  resolvido/dispensado esmaecidos (opacity .72); estado vazio composto por aba; Recalcular com selo
  "Última análise"; deep-link do Dashboard por **ID** com anel de destaque que **persiste até o
  usuário clicar no card destacado e recolhê-lo** (decisão de produto 2026-07-13 — o protótipo
  apagava sozinho em 2600ms). Desvios documentados:
  "Criar tarefa"/"Ver tarefa" viraram **"Iniciar ação"** (atividade de clínica EXIGE alvo
  lead/paciente — criar tarefa a partir de insight pede decisão de produto); o **diagnóstico É
  renderizado** no corpo expandido (títulos reais do engine são genéricos, o contexto vive no
  diagnóstico); **Dispensar mantém o dialog de motivo** (o backend exige `dismissReason`); ganhou
  ação **Reabrir** (`reopenInsightAction`).
- `Procedimentos.dc.html` — catálogo de procedimentos.
- **`Exportações/`** — ✅ CONCLUÍDO (handoff + implementado no produto, 2026-07-13). Barra de
  Período (tile dourado + De/Até com `color-scheme` por tema + segmented de presets com pílula
  deslizante, oculta sem seleção; editar data limpa preset; toggle no ativo limpa tudo) + grade
  `auto-fit minmax(322px,1fr)` com card PDF (CTA ghost único) e 9 datasets CSV/Excel. Desvios
  documentados: card primário SEM destaque estático (decisão de produto 2026-07-14 — o dourado
  borda+tile que era só do `exec` virou o estado de HOVER de todos os cards); `descHint` não
  renderizado; `scope` virou chip "Período"/"Base completa" no rodapé do card; Excel ganhou
  feedback "Gerando…" próprio (corrige inconsistência do protótipo §8.3); download real
  fetch+blob com toast de sucesso e erro inline + "Tentar novamente"; micro-hint "Sem dados no
  período" ficou de fora (exigiria contagem por dataset). Cards filtrados por cargo (módulo de
  origem) + vazio composto.
- **`Notificações/`** — ✅ CONCLUÍDO (handoff + implementado no produto, 2026-07-14). O sino
  da topbar (§3.3) já estava pronto (`topbar-notifications.tsx`); esta entrega fez o CORPO:
  abas de categoria em underline medido + "Marcar todas como lidas" (§4); lista agrupada
  Hoje/Esta semana/Anteriores num card por grupo com meta "N não lidas"/"Tudo lido" (§6/§7);
  linha com tile por categoria (§8), título 500/600 + dot, descrição, botão de ação (deep-link)
  e carimbo relativo; botão de alternância marcar-lida (check dourado) / dispensar (X, saída
  animada slide+colapso) (§9); vazio composto por aba (§10). Desvios documentados: a categoria
  NÃO é persistida no modelo — é derivada de `type`+`link` (crm=`/crm…`, financial=`/financial`);
  as abas viraram **uma por categoria REAL** (Todas · Não lidas · Leads · Atividades · Financeiro
  · Metas · Insights · Pacientes) — a "Agenda" do protótipo saiu (não há tipo de aviso de agenda),
  entraram Metas/Insights/Pacientes e `sistema` aparece só em "Todas" (decisão de produto
  2026-07-14); barra de abas rola no eixo X em vez de `flex-wrap` (preserva o indicador medido de
  linha única); dismiss por classe CSS + `setTimeout` (mesma técnica do Atividades) em vez da Web
  Animations API do §11 (mesmo resultado visual); botão de ação só faz deep-link (marcar como lida
  é função do toggle); `now` vem do servidor via prop (carimbos/grupos determinísticos no SSR).
- `Configuracoes.dc.html` — configurações.

> Abra qualquer `.dc.html` num navegador para ver a tela renderizada e interagir com ela.
> As telas sem subpasta ainda vivem na raiz do pacote; conforme cada handoff for produzido, ela ganha sua própria pasta no padrão acima.

## Design Tokens

Todos os tokens (cores light/dark em canais HSL, sombra tingida, status semânticos, escala tipográfica, radius, movimento) estão em **`design.md` seções 1, 3 e 7**, com bloco `:root`/`.dark` pronto para colar em `globals.css` e instrução de `tailwind.config`. **Não duplique valores aqui — use o `design.md` como fonte única.**

## Assets

- **Fonte:** Inter (Google Fonts, pesos 400/500/600/700). `font-variant-numeric: tabular-nums` obrigatório em números.
- **Ícones:** set stroke-24 documentado em `design.md` seção 6 → usar `lucide-react` no real (cobre 1:1).
- Sem imagens/logos externos: a logo é o glifo "B" em `bg-primary`.

## Como implementar (ordem sugerida)

1. Configurar tokens: colar o bloco `:root`/`.dark` do `design.md` em `globals.css` e estender o `tailwind.config`.
2. Adicionar Inter e `tabular-nums`.
3. Construir o **chrome** primeiro (sidebar + topbar, seção 4) — é idêntico em todas as telas.
4. Implementar os **componentes base** (seção 5: card, botões, switch/segmented, abas underline, chips, KPI, popovers, estados).
5. Implementar as telas uma a uma, conferindo contra o `.dc.html` correspondente.
6. Rodar o **checklist da seção 9** em cada tela antes de considerar pronta.
