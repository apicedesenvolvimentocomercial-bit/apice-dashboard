# Exportações — Handoff detalhado (item a item)

> Especificação granular da tela **Exportações** (`Exportações.dc.html`).
> Objetivo: reconstruir **cada elemento visual, medida, threshold e animação** no stack real
> (Next 16 + Tailwind v3 + shadcn/ui) sem improviso. **Nada aqui é opcional.**
>
> **Como usar este doc**
>
> 1. Leia `design.md` primeiro (tokens, regras de cor, tipografia, chrome). Este arquivo **não repete** os tokens — assume que já estão no `globals.css`.
> 2. Toda cor é token semântico via `hsl(var(--token))`. Onde aparece `primary/0.16`, leia `hsl(var(--primary) / 0.16)`.
> 3. Todo número (px, %, peso, threshold) é **literal do protótipo** — reproduza exatamente. Onde houver `clamp(...)`, é responsivo; mantenha a fórmula.
> 4. Os `.dc.html` usam um runtime de protótipo próprio — **não copie a sintaxe de template**. Recrie em React/TSX com as libs do codebase. Ícones → `lucide-react`. Sem gráficos nesta tela.
>
> **⚠️ Nota de escopo (ler antes de tudo).** A tela **Exportações não tem** abas "Hoje/Semana/Atrasadas/Todas/Feitas", nem "banner de atrasada" — esses elementos pertencem à tela **Atividades**. Exportações é uma **superfície única** (sem sub-abas/sub-páginas): uma **barra de Período** no topo + uma **grade de 10 cards de exportação**. Este handoff documenta fielmente o que existe no protótipo. A granularidade "aba por aba" pedida foi atendida documentando **cada um dos 10 cards como um item individual** (§7).
>
> **Legenda de tokens usados abaixo (do `design.md`):**
> `--card` superfície · `--background` fundo app · `--foreground` texto · `--muted`/`--muted-foreground` neutro · `--border` bordas · `--input` borda de input · `--accent` hover · `--primary` dourado-superfície · `--primary-foreground` texto escuro sobre dourado · `--primary-text` dourado-texto · `--ring` foco · `--destructive` erro · `--ok`/`--ok-bg` sucesso · `--warn`/`--warn-bg` aviso · `--shadow`/`--shadow-a` sombra tingida.

---

## 0. Índice

1. Estrutura geral da página (esqueleto + medidas de layout)
2. Sidebar (236px) — item a item
3. Topbar (header) — título + busca + tema + sino + Novo lead
4. Barra de Período (card com date pickers + segmented de presets)
5. Grade de exportações (layout do grid)
6. Anatomia do card de exportação
7. Os 10 cards de exportação (um a um — valores exatos)
8. Botões de ação + estado "Gerando…" (lógica de download)
9. Presets de período (lógica `applyPreset`)
10. Estados por superfície (carregando presente · vazio/erro recomendados)
11. Catálogo de animações (keyframes + transições)
12. Thresholds & lógica condicional (tabela única)
13. Dados de exemplo (fonte da verdade)
14. Props do componente e integração com o App
15. Ordem de build sugerida + checklist específico da tela

---

## 1. Estrutura geral da página

### Container raiz

- Elemento `.senno` com `data-theme` (`light|dark`) e `data-font="inter"`.
- `background: hsl(var(--background))`, `color: hsl(var(--foreground))`, `height: 100vh`, `box-sizing: border-box`, `overflow: hidden`, `line-height: 1.45`, `font-family: Inter`.
- `-webkit-font-smoothing: antialiased`, `box-sizing: border-box` global, `body { margin: 0 }`.

### Moldura da app (shell full-bleed)

`data-screen-label="Exportações"` — `width:100%; height:100%; min-height:0; display:flex; overflow:hidden; background:hsl(var(--background))`.

Layout em duas colunas via flex (idêntico às demais telas):

```
[ SIDEBAR 236px fixa ] [ MAIN flex:1 -> (TOPBAR fixo) + (BODY rolável) ]
```

- **MAIN**: `flex:1; min-width:0; min-height:0; display:flex; flex-direction:column`.
- **BODY rolável**: `flex:1; min-height:0; overflow-y:auto; padding:18px 24px; display:flex; flex-direction:column; gap:16px`. **Só o body rola** — sidebar e topbar ficam fixos.

### Ordem vertical do body (gap 16px entre blocos)

1. **Barra de Período** (card único de largura total) — §4.
2. **Grade de exportações** (auto-fit) — §5–§7.

> Diferente do Dashboard, o `gap` do body aqui é **16px** (Dashboard usa 18px) e o padding é **18px 24px** (Dashboard 22px 24px). Reproduza esses valores exatos.

### Breakpoints responsivos (media queries globais)

Herdadas do chrome compartilhado (não afetam esta tela, que não usa `.senno-2col`/`.senno-3col`):

- `@media (max-width:1024px)`: `.senno-2col { grid-template-columns:1fr }`, `.senno-3col { grid-template-columns:1fr 1fr }`.
- `@media (max-width:660px)`: `.senno-3col { grid-template-columns:1fr }`.

A grade de exportações é **auto-responsiva** por `auto-fit` (§5) — não depende de media query.

---

## 2. Sidebar — 236px

Idêntica a todas as telas. `aside`: `width:236px; flex:none; background:hsl(var(--card)); border-right:1px solid hsl(var(--border)); display:flex; flex-direction:column; padding:18px 14px`.

### 2.1 Bloco de marca (topo)

- Wrapper: `display:flex; align-items:center; gap:10px; padding:6px 8px 18px`.
- **Logo**: `34×34px`, `border-radius:9px`, `background:hsl(var(--primary))`, flex center. Glifo **"B"** — `color:hsl(var(--primary-foreground))`, `font-weight:700`, `font-size:17px`.
- **Textos** (min-width:0, truncam):
  - "Clínica Bellavie" — `14px / 600`, `color:foreground`, `white-space:nowrap; overflow:hidden; text-overflow:ellipsis`.
  - "Plano Premium" — `11px`, `color:muted-foreground`.

### 2.2 Navegação

`nav`: `display:flex; flex-direction:column; gap:2px`.

Cada item = `<a href="#">` (no real: `<Link>`):

- `display:flex; align-items:center; gap:11px; padding:8px 10px; border-radius:8px; font-size:13.5px; text-decoration:none`.
- Ícone: `18×18px`, `flex:none`.
- Label: `flex:1; white-space:nowrap`.
- **Hover** (qualquer item): `background:hsl(var(--accent))`.

Estados por item:
| Estado | `font-weight` | texto/ícone (`color`) | `background` |
|---|---|---|---|
| Inativo | 500 | `hsl(var(--muted-foreground))` | `transparent` |
| **Ativo** (Exportações) | 600 | `hsl(var(--primary-text))` | `hsl(var(--accent))` |

**Ordem fixa da nav (12 itens, menu plano, sem seções):**
`Dashboard` · `Atividades` · `Agenda` · `Funil` · `Pacientes` · `Financeiro` · `Metas` · `Insights` · `Procedimentos` · **`Exportações` (ativo aqui)** · `Notificações` · `Configurações`.

Ícones (set stroke-24, lucide no real): grid, activity, calendar, funnel, users, money (rect+circle), target, bulb, syringe, **download**, bell, settings. Clique chama `onNavigate(label)` — `e.preventDefault()` + `this.props.onNavigate(label)`.

> **Item ativo desta tela = "Exportações"** (ícone `download`), `color/iconColor = primary-text`, `bg = accent`, weight 600.

### 2.3 Rodapé (usuário)

- `margin-top:auto`. Card: `display:flex; align-items:center; gap:10px; padding:10px; border-radius:10px; background:hsl(var(--muted))`.
- Avatar "HC": `32×32px; border-radius:99px; background:hsl(var(--primary)/0.2); color:hsl(var(--primary-text)); font-size:12.5px; font-weight:600`.
- Nome "Dra. Helena Costa" `12.5px / 600` (trunca); cargo "Proprietária" `11px muted`.

---

## 3. Topbar (header)

`header`: `flex:none; display:flex; align-items:center; gap:16px; padding:14px 24px; border-bottom:1px solid hsl(var(--border)); background:hsl(var(--card))`.

- **Esquerda** (`flex:1; min-width:0`): `<h1>` **"Exportações"** — `font-size:clamp(22px, 0.5vw + 18px, 27px); font-weight:600; letter-spacing:-0.01em; margin:0`.
- **Direita**: `display:flex; align-items:center; gap:9px` — na ordem: **Busca → Tema → Sino → Novo lead**.

### 3.1 Busca "Buscar paciente…" (colapsável)

**Comportamento:** ícone de lupa 38px que **expande da direita para a esquerda** até 240px no hover/focus.

Marcação/CSS (classe `senno-search`):

- Wrapper `.senno-search`: `position:relative; width:38px; height:38px; flex:none`.
- Caixa `.senno-search-box`: `position:absolute; top:0; right:0; height:38px; width:38px` (colapsado) `; display:flex; align-items:center; gap:8px; padding:0 11px; border-radius:9px; border:1px solid hsl(var(--border)); background:hsl(var(--background)); color:hsl(var(--muted-foreground)); font-size:12.5px; overflow:hidden; white-space:nowrap; cursor:pointer`.
- **Transição:** `width .34s cubic-bezier(.4,0,.2,1), background .22s, border-color .22s, box-shadow .22s`; `transition-delay:0s`.
- **Expandido** (`:hover` no wrapper **ou** `:focus-within` na caixa): `width:240px; border-color:hsl(var(--input)); cursor:text`.
- **Foco** (`:focus-within`): `border-color:hsl(var(--ring)); box-shadow:0 0 0 3px hsl(var(--ring)/0.18)`.
- Ícone lupa `15×15px`, `flex:none`. Input: `border:none; outline:none; background:transparent; font-size:12.5px; color:foreground`, placeholder "Buscar paciente…".

> **⚠️ Diferença vs. Dashboard:** neste protótipo a busca é **apenas o campo colapsável** — **não há popover de resultados** (nem highlight, avatar, empty ou rodapé). No produto real, **ligue esta busca ao mesmo popover documentado no `dashboard-handoff.md` §3.1** (comportamento canônico da busca em todas as telas). Aqui o campo é decorativo.

### 3.2 Toggle de tema (sol/lua)

- Botão `.senno-theme-btn`: `38×38px; border-radius:9px; border:1px solid border; background:background; color:foreground; position:relative; overflow:hidden`; hover `background:accent`. `title` = "Modo escuro"/"Modo claro" (via `themeTitle`).
- Dois ícones sobrepostos `.senno-theme-ico` (`position:absolute; top:50%; left:50%; width:17px; height:17px; margin:-8.5px 0 0 -8.5px`), transição `transform .5s cubic-bezier(.34,1.3,.5,1), opacity .35s`.
- **Estados:**
  | | Light | Dark |
  |---|---|---|
  | Sol (`.senno-theme-sun`) | `rotate(0) scale(1)`, `opacity:1` | `rotate(90deg) scale(.35)`, `opacity:0` |
  | Lua (`.senno-theme-moon`) | `rotate(-90deg) scale(.35)`, `opacity:0` | `rotate(0) scale(1)`, `opacity:1` |
- Clique → `toggleTheme`: usa `this.props.onToggleTheme()` se existir, senão alterna o `state.theme` local.

### 3.3 Sino de notificações (`senno-notif`)

Idêntico ao Dashboard.

- Wrapper `position:relative`. Botão `38×38px; border-radius:9px; border; background:background; color:foreground`; hover `accent`; `title="Notificações"`.
- Ícone sino `17×17px; transform-origin:top center`, classe `senno-bell-ico`.
- **Dot de não-lidas** (se `hasUnread`, i.e. `unreadCount > 0`): `position:absolute; top:7px; right:8px; width:7px; height:7px; border-radius:99px; background:hsl(var(--destructive)); border:1.5px solid hsl(var(--card))`.
- **Shake ao clicar:** `toggleNotif` seta `bellRing:true` → aplica classe `senno-bell-ring-a` → keyframes `senno-bell-ring .7s cubic-bezier(.36,.07,.19,.97)` (§11). Removida no `onAnimationEnd` (`bellAnimEnd` → `bellRing:false`).

**Popover de notificações** (quando `notifOpen`):

- Overlay de fechar: `position:fixed; inset:0; z-index:40` (`closeNotif`).
- Painel: `position:absolute; top:46px; right:0; width:362px; background:hsl(var(--popover)); border:1px solid hsl(var(--border)); border-radius:12px; box-shadow:0 16px 40px -12px hsl(var(--shadow)/calc(var(--shadow-a)*3.5)); z-index:50; overflow:hidden`.
- **Cabeçalho** (`padding:12px 14px 10px; display:flex; justify-content:space-between; align-items:center; gap:10px`): "Notificações" (`clamp(13px,0.14vw+11.2px,14.3px)/600`) + pill de não-lidas (`11px/600; padding:1px 7px; radius:99px; background:hsl(var(--primary)/0.16); color:primary-text; tabular-nums`) — pill só se `hasUnread`. À direita, botão-texto "Marcar todas como lidas" (`11.5px/600 primary-text`; hover `text-decoration:underline`) — só se `hasUnread` (`markAllRead`).
- **Lista:** `padding:0 6px 6px; max-height:344px; overflow-y:auto`.
- **Item** (`<button>`): `display:flex; align-items:flex-start; gap:11px; width:100%; text-align:left; padding:10px 8px; border:none; border-radius:8px`; `background` = `n.rowBg` (lida `transparent` / não-lida `hsl(var(--primary)/0.05)`); hover `accent`.
  - Ícone tile `32×32px; border-radius:99px`, `background:n.iconBg; color:n.iconColor` (tints na tabela abaixo). Ícone interno `15×15px`.
  - Título `12.5px`, `font-weight` = `n.titleWeight` (não-lida 600 / lida 500). Sub `11.5px muted` (trunca).
  - À direita (`flex-direction:column; align-items:flex-end; gap:5px`): hora `10.5px muted` (nowrap) + dot `7×7px; radius:99px; background:primary` se `n.unread`.
- **Rodapé:** `padding:9px 14px; border-top:1px solid border; background:hsl(var(--muted)/0.4)`, centralizado, link "Ver todas as notificações" (`12px/600 primary-text`).

**Tints por tipo** (`iconBg` / `iconColor`):
| tipo | ícone | fundo | cor |
|---|---|---|---|
| `lead` | users | `hsl(var(--primary)/0.16)` | `primary-text` |
| `money` | money | `hsl(var(--ok-bg))` | `ok` |
| `agenda` | calendar | `hsl(var(--accent))` | `muted-foreground` |
| `alert` | alert | `hsl(var(--destructive)/0.14)` | `destructive` |

Clique num item → marca aquele como lido (`n.onClick`). "Marcar todas" → todas lidas.

### 3.4 Botão "Novo lead"

- `height:38px; padding:0 15px; border-radius:9px; border:none; background:hsl(var(--primary)); color:hsl(var(--primary-foreground)); font-size:clamp(13px,0.14vw+11.2px,14.3px); font-weight:600; display:flex; align-items:center; gap:7px`; hover `filter:brightness(1.05)`.
- Ícone `+` `15×15px`. Clique → `onNewLead()`.

---

## 4. Barra de Período (card único)

Card de largura total (primeiro bloco do body). Padrão de card com padding próprio:
`background:hsl(var(--card)); border:1px solid hsl(var(--border)); border-radius:13px; box-shadow:0 1px 2px hsl(var(--shadow)/var(--shadow-a)); padding:18px 20px`.

Linha interna: `display:flex; align-items:center; gap:12px; flex-wrap:wrap`.

### 4.1 Rótulo (esquerda)

- **Tile do ícone:** `width:34px; height:34px; flex:none; border-radius:9px; background:hsl(var(--primary)/0.14); color:hsl(var(--primary-text)); display:flex; center`. Ícone `calendar` `18×18px`.
- **Título "Período":** `font-size:16px; font-weight:600` (bloco `flex:none`).

### 4.2 Grupo de controles (direita, `margin-left:auto`)

Wrapper: `display:flex; align-items:flex-end; gap:18px; flex-wrap:wrap`.

**a) Date pickers "De" / "Até"** (grupo `display:flex; gap:14px`):
Cada campo é um `<label>` `display:flex; flex-direction:column; gap:5px; font-size:11.5px; font-weight:600; color:hsl(var(--muted-foreground))` com o texto ("De" / "Até") acima do input.

- `input[type="date"]`: `height:38px; padding:0 12px; border-radius:9px; border:1px solid hsl(var(--input)); background:hsl(var(--background)); color:hsl(var(--foreground)); font-family:inherit; font-size:clamp(13px,0.14vw+11.2px,14.3px); font-variant-numeric:tabular-nums`.
- **Foco:** `outline:none; border-color:hsl(var(--ring)); box-shadow:0 0 0 3px hsl(var(--ring)/0.18)`.
- **`color-scheme`** casado ao tema: `.senno input[type="date"] { color-scheme:light }` e `.senno[data-theme="dark"] input[type="date"] { color-scheme:dark }` — garante que o date picker nativo abra na cor certa.
- **`onChange` "De"** → `dateFrom = e.target.value` **e limpa o preset** (`preset:''`). **"Até"** idem para `dateTo`.
- `value` vem de `state.dateFrom` / `state.dateTo` (vazio por padrão).

**b) Segmented de presets** (switch dourado — mesmo primitivo do §4 do Dashboard):
Trilho: `position:relative; display:grid; grid-auto-flow:column; grid-auto-columns:1fr; padding:3px; border-radius:9px; background:hsl(var(--muted)); border:1px solid hsl(var(--border))`.

- **Pílula deslizante** (`presetPill` = `segPill(idx, N)`): `position:absolute; top:3px; left:3px; bottom:3px; width:calc((100% - 6px)/N); transform:translateX(idx*100%); opacity:{idx<0?0:1}; background:hsl(var(--primary)); border-radius:7px; box-shadow:0 1px 2px hsl(var(--shadow)/var(--shadow-a)); pointer-events:none; z-index:0; transition:transform .34s cubic-bezier(.34,1.1,.5,1), opacity .2s ease`.
  - `N = 4`. Quando nenhum preset está ativo (`preset === ''`, `idx === -1`), a pílula fica **oculta** (`opacity:0`) — o estado padrão da tela **não** tem preset selecionado.
- **Botões** (`segBtn(on)`): `position:relative; z-index:1; border:none; cursor:pointer; font-family:inherit; font-size:12.5px; font-weight:600; padding:7px 14px; border-radius:7px; background:transparent; white-space:nowrap; transition:color .25s`; cor ativo `primary-foreground` / inativo `muted-foreground`. **Hover** (qualquer): `background:hsl(var(--primary)/0.22); color:hsl(var(--primary-text))`.
- **Abas (N=4), na ordem:** `Este mês` · `Mês passado` · `Últimos 90 dias` · `Tudo`. Padrão selecionado = **nenhum** (`preset:''`).

Lógica de cada preset em §9.

---

## 5. Grade de exportações (layout)

Container logo abaixo da barra de Período:
`display:grid; grid-template-columns:repeat(auto-fit, minmax(322px, 1fr)); gap:18px`.

- **Auto-responsivo:** cada card tem largura mínima **322px** e cresce para preencher (`1fr`). Em telas largas cabem 3–4 colunas; reflui sozinho até 1 coluna em viewports estreitas. **Sem media query** — é o `auto-fit`/`minmax` que faz o trabalho.
- 10 cards, na ordem dos `defs` (§7).

---

## 6. Anatomia do card de exportação

Cada card (`<div>` gerado por `sc-for` sobre `exports`):
`position:relative; display:flex; flex-direction:column; gap:16px; background:hsl(var(--card)); border:1px solid {e.cardBorder}; border-radius:15px; box-shadow:0 1px 2px hsl(var(--shadow)/var(--shadow-a)); padding:24px 24px 22px; min-height:196px`.

- **Hover:** `border-color:hsl(var(--primary)/0.5)`.
- **`cardBorder`:** card **primário** (`exec`) → `hsl(var(--primary)/0.45)`; demais → `hsl(var(--border))`.

> **Radius 15px** (maior que os 13px dos cards do Dashboard) e **min-height 196px** — reproduza exatamente.

### 6.1 Cabeçalho (`display:flex; align-items:center; gap:13px`)

- **Tile do ícone:** `width:44px; height:44px; flex:none; border-radius:12px; background:{e.iconBg}; color:{e.iconColor}; display:flex; center`. Ícone interno `23×23px`.
  - **Primário** (`exec`): `iconBg = hsl(var(--primary)/0.16)`, `iconColor = primary-text`.
  - **Demais:** `iconBg = hsl(var(--muted))`, `iconColor = muted-foreground`.
- **Título:** `font-size:18px; font-weight:600; line-height:1.25` (bloco `flex:1; min-width:0`).

### 6.2 Descrição

`<p>`: `margin:0; font-size:13.5px; color:hsl(var(--muted-foreground)); line-height:1.55; flex:1` — texto = `e.descMain`.

> **`descMain` / `descHint` — atenção.** A `desc` de origem é quebrada em `—`: `descMain` = parte antes do travessão (com `,`/`;` finais removidos); `descHint` = parte após o travessão, com a 1ª letra maiúscula. **Só `descMain` é renderizado** no protótipo; `descHint` é computado mas **não aparece**. No card `exec`, por exemplo, `descMain` = "KPIs, top procedimentos, custos e metas do período" e o hint "Pronto para apresentar." fica de fora. **Decisão de produto:** ou renderize `descHint` como linha secundária (`12px muted`), ou remova o travessão da fonte e use só `descMain`. Documente a escolha.

### 6.3 Linha de ações

`display:flex; align-items:center; gap:10px; flex-wrap:wrap`. Um ou dois botões, gerados por `mkActions` (§8).

---

## 7. Os 10 cards de exportação (um a um)

Ordem exata do array `defs`. Campos por card: **`id`** (chave), **título**, **ícone**, **`descMain`** (o que renderiza), **`scope`** (semântica — ver nota), **ações**.

> **`scope` (`period` vs `full`) — dado semântico não renderizado.** Indica se a exportação **respeita a faixa de datas** da barra de Período (`period`) ou **ignora e exporta a base inteira** (`full`). No protótipo esse campo **não vira UI**. No real, **surface-o** (ex.: chip "Período" / "Base completa" no rodapé do card, ou desabilitar visualmente a relação com a barra de Período quando `full`). Não deixe implícito.

| #   | id              | Título                        | Ícone (lucide)        | `descMain` (renderizado)                                    | scope                   | Ações                             |
| --- | --------------- | ----------------------------- | --------------------- | ----------------------------------------------------------- | ----------------------- | --------------------------------- |
| 1   | `exec`          | **Relatório executivo (PDF)** | `file-text`           | KPIs, top procedimentos, custos e metas do período          | `period` (**primário**) | **1 botão:** "Baixar PDF" (ghost) |
| 2   | `leads`         | **Leads**                     | `filter`/funnel       | Funil comercial: contato, origem, etapa e valor estimado.   | `period`                | CSV + Excel                       |
| 3   | `pacientes`     | **Pacientes**                 | `users`               | Cadastro completo com contato e histórico de visitas.       | `full`                  | CSV + Excel                       |
| 4   | `agenda`        | **Agendamentos**              | `calendar`            | Agenda com paciente, procedimento, status e desfecho.       | `period`                | CSV + Excel                       |
| 5   | `receitas`      | **Receitas**                  | `money` (rect+circle) | Faturamento por competência com paciente e procedimento.    | `period`                | CSV + Excel                       |
| 6   | `despesas`      | **Despesas**                  | `coins`               | Custos por tipo e categoria (buckets da DRE).               | `period`                | CSV + Excel                       |
| 7   | `receber`       | **Contas a receber**          | `receipt`             | Parcelas com vencimento, status e data de pagamento.        | `period`                | CSV + Excel                       |
| 8   | `procedimentos` | **Procedimentos**             | `syringe`             | Catálogo com preço, custo, duração e recorrência.           | `full`                  | CSV + Excel                       |
| 9   | `atividades`    | **Atividades**                | `activity`            | Tarefas internas com status, prioridade e responsável.      | `period`                | CSV + Excel                       |
| 10  | `metas`         | **Metas**                     | `target`              | Metas por métrica, período e escopo (clínica/cargo/pessoa). | `full`                  | CSV + Excel                       |

> Só o card **`exec`** difere visualmente: borda `primary/0.45`, tile de ícone dourado (`primary/0.16` + `primary-text`) e **uma única ação "Baixar PDF"**. Todos os outros 9 têm tile `muted` + duas ações **CSV** e **Excel**.

### 7.1 Ícones internos (viewBox 24, stroke, `currentColor`) — mapa lucide

- `file-text` (exec): `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6M9 9h1"/>`
- `funnel` (leads): `<path d="M3 4h18l-7 8v6l-4 2v-8z"/>`
- `users` (pacientes): `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>`
- `calendar` (agenda): `<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>`
- `money` (receitas): `<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>`
- `coins` (despesas): `<circle cx="8" cy="8" r="5.5"/><path d="M18.1 6.5a5.5 5.5 0 0 1 0 11M9.5 16.5a5.5 5.5 0 0 0 8.6 0"/>`
- `receipt` (receber): `<path d="M4 2v20l2-1.5L8 22l2-1.5L12 22l2-1.5L16 22l2-1.5L20 22V2l-2 1.5L16 2l-2 1.5L12 2l-2 1.5L8 2 6 3.5 4 2z"/><path d="M8 8h8M8 12h8"/>`
- `syringe` (procedimentos): `<rect x="3" y="3" width="7" height="7" rx="1.5"/><path d="M14 7h6M14 12h6M14 17h6M5 14v6M3 17h4"/>`
- `activity` (atividades): `<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>`
- `target` (metas): `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>`

Ícones de ação: `download` (`<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>`), `sheet` (Excel: `<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>`), `spinner` (`<path d="M12 3a9 9 0 1 0 9 9" opacity="0.9"/>` — ver §8/§11).

---

## 8. Botões de ação + estado "Gerando…"

### 8.1 Estilos base (todos os botões de ação são **ghost**)

- `btnBase`: `display:inline-flex; align-items:center; gap:8px; height:40px; padding:0 16px; border-radius:10px; cursor:pointer; font-family:inherit; font-size:13.5px; font-weight:600; transition:background .12s, filter .12s`.
- `ghost` = `btnBase` + `border:1px solid hsl(var(--border)); background:hsl(var(--background)); color:hsl(var(--foreground))`. **Hover:** `background:hsl(var(--accent))`.
- **⚠️ Código morto a saber:** o protótipo também define `gold` (`bg-primary`/`primary-foreground`) e `goldHover`, **mas nenhuma ação os usa** — inclusive o card primário "Baixar PDF" é **ghost**. Ou seja, a distinção do card `exec` é só borda + tile de ícone, não o botão. Se o produto quiser o CTA primário em dourado, é uma **decisão nova** (não está no protótipo); documente antes de aplicar.
- Ícone interno do botão: `16×16px`.

### 8.2 Ações por card (`mkActions(id, primary)`)

- **Card primário (`exec`):** **1 ação** — `{ label: busy ? 'Gerando…' : 'Baixar PDF', icon: busy ? spinner : download }`. Quando ocupado, estilo ganha `opacity:0.7; cursor:default`. `onClick → download(id)`.
- **Demais cards:** **2 ações** —
  1. **CSV** — `{ label: busy ? 'Gerando…' : 'CSV', icon: busy ? spinner : download }`, ganha `opacity:0.7; cursor:default` quando `busy`. `onClick → download(id)`.
  2. **Excel** — `{ label: 'Excel', icon: sheet }`, **estático** (não reflete busy). `onClick → download(id + '-xls')`.

### 8.3 Lógica de `download`

```
download(id):
  if (state.busy[id]) return;          // reentrância bloqueada
  state.busy[id] = true;               // marca ocupado
  setTimeout(() => delete state.busy[id], 1300);  // libera após 1300ms
```

- `busy` é um mapa `{ [id]: true }` por chave.
- **⚠️ Inconsistência a corrigir no real:** o botão **Excel** dispara `download(id + '-xls')`, mas seu label/estilo leem `busy[id]` — na verdade nem leem, são **estáticos**. Resultado: **clicar em Excel não dá nenhum feedback visual** (nem spinner, nem label "Gerando…"). No produto real, faça o Excel refletir seu próprio estado ocupado (`busy[id+'-xls']`), igual ao CSV. No protótipo o `setTimeout` só simula a geração — no real, troque por `disabled` + spinner durante a requisição/streaming do arquivo e feedback de conclusão (toast/download iniciado).

### 8.4 Spinner

Ícone `spinner` = arco 3/4 (`<path d="M12 3a9 9 0 1 0 9 9" opacity="0.9"/>`). **Substitui o ícone `download`** enquanto `busy`. No protótipo o SVG **não gira** por si — no real, aplique `animate-spin` (ou keyframe de rotação contínua). Ver §11.

---

## 9. Presets de período (lógica `applyPreset`)

`applyPreset(k)` com `k ∈ { 'mes', 'passado', '90d', 'tudo' }`. Base de cálculo: `now = new Date()` (data atual do navegador). Formatação `fmt(d)` → `YYYY-MM-DD` (zero-padded), para casar com `input[type=date]`.

| Preset          | `k`       | `dateFrom`                                     | `dateTo`                                         |
| --------------- | --------- | ---------------------------------------------- | ------------------------------------------------ |
| Este mês        | `mes`     | 1º dia do mês atual — `new Date(y, m, 1)`      | hoje (`now`)                                     |
| Mês passado     | `passado` | 1º dia do mês anterior — `new Date(y, m-1, 1)` | último dia do mês anterior — `new Date(y, m, 0)` |
| Últimos 90 dias | `90d`     | hoje − 90 dias                                 | hoje (`now`)                                     |
| Tudo            | `tudo`    | `''` (vazio)                                   | `''` (vazio)                                     |

- **Toggle:** clicar no preset **já ativo** limpa tudo — `preset:''`, `dateFrom:''`, `dateTo:''` (pílula some).
- **"Tudo"** seleciona o preset (pílula na 4ª posição) mas **zera as datas** (`from=''`, `to=''`) — semanticamente "sem filtro de período".
- **Editar um date input manualmente** limpa o preset (`preset:''`) — os campos e o segmented são **mutuamente exclusivos** como fonte da faixa.
- **`presetPill`** = `segPill(idx, 4)` onde `idx = presetDefs.findIndex(preset)`. `idx === -1` (nenhum) → pílula oculta.

> **No real:** guarde `{ from, to, preset }` num único estado de filtro e derive a faixa efetiva. As exportações com `scope:'period'` usam essa faixa; as com `scope:'full'` a ignoram (§7).

---

## 10. Estados por superfície

O protótipo cobre explicitamente **o estado "gerando"** por ação (§8). Os demais estados obrigatórios do design system (`design.md` §5) **não estão desenhados nesta tela** e devem ser implementados no real seguindo o padrão canônico (ver `dashboard-handoff.md` §13 como referência de tratamento):

| Estado                             | No protótipo? | Como implementar no real                                                                                                                                                                                                                           |
| ---------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ação em andamento** ("Gerando…") | ✅ presente   | Botão com spinner + label "Gerando…" + `opacity:0.7`/`disabled` durante a geração (§8).                                                                                                                                                            |
| **Carregando a página** (skeleton) | ❌ ausente    | Skeleton dos cards da grade: tile 44×44, título 18×60%, 2 linhas de desc, 1–2 pílulas de botão — shimmer `linear-gradient(90deg, muted 25%, accent 37%, muted 63%)`, `background-size:220%`, `1.5s ease-in-out infinite`. Nunca spinner de página. |
| **Sucesso da exportação**          | ❌ ausente    | Feedback pós-download: toast discreto ("Arquivo gerado") ou micro-estado no botão. Não usar `alert()`.                                                                                                                                             |
| **Erro na geração**                | ❌ ausente    | Erro inline no card: caixa `destructive/0.1` + borda `destructive/0.3`, ícone `alert`, texto "Não foi possível gerar o arquivo" + botão "Tentar novamente" (ghost com borda `destructive/0.4`, texto `destructive`). Nunca `alert()`.              |
| **Vazio** (sem dados no período)   | ❌ ausente    | Se uma exportação de escopo `period` não tem registros na faixa, desabilitar a ação e mostrar micro-hint "Sem dados no período selecionado" (`11.5px muted`).                                                                                      |

---

## 11. Catálogo de animações

### Keyframes (no `<style>`)

| Nome              | Definição                                            | Uso                     |
| ----------------- | ---------------------------------------------------- | ----------------------- |
| `senno-bell-ring` | rotação amortecida `0 → 11deg → -9 → 6 → -4 → 2 → 0` | shake do sino ao clicar |

> Esta tela **não** define `sennoShimmer` nem rotação de spinner no protótipo. Ao implementar skeleton (§10) e girar o spinner (§8.4), traga `sennoShimmer` (`0% { background-position:-180% 0 } 100% { background-position:180% 0 }`) e uma rotação contínua (`@keyframes spin { to { transform:rotate(360deg) } }`, ou `animate-spin` do Tailwind).

### Transições

| Elemento                       | Propriedade / timing                                                             |
| ------------------------------ | -------------------------------------------------------------------------------- |
| Pílula do segmented de presets | `transform .34s cubic-bezier(.34,1.1,.5,1)`, `opacity .2s ease`                  |
| Texto do botão segmentado      | `color .25s`                                                                     |
| Busca (expand/collapse)        | `width .34s cubic-bezier(.4,0,.2,1)`; bg/border/shadow `.22s`                    |
| Toggle de tema (sol↔lua)       | `transform .5s cubic-bezier(.34,1.3,.5,1)`, `opacity .35s`                       |
| Sino (shake)                   | `senno-bell-ring .7s cubic-bezier(.36,.07,.19,.97)` (removida no `animationend`) |
| Botões de ação (hover)         | `background .12s, filter .12s`                                                   |
| Card de exportação (hover)     | `border-color` → `hsl(var(--primary)/0.5)` (herda do card padrão)                |
| Input de data (foco)           | anel `0 0 0 3px hsl(var(--ring)/0.18)` + `border-color:ring`                     |

> Tom **operacional/premium**: transições curtas, leve overshoot na pílula. Nada longo ou chamativo.

---

## 12. Thresholds & lógica condicional (resumo)

| Onde                              | Regra                                                                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Card primário                     | só `id === 'exec'` (`primary:true`) → borda `primary/0.45`, tile `primary/0.16`+`primary-text`, **1 ação** "Baixar PDF"       |
| Card não-primário                 | tile `muted`+`muted-foreground`, borda `border`, **2 ações** (CSV + Excel)                                                    |
| `cardBorder`                      | primário `hsl(var(--primary)/0.45)` · demais `hsl(var(--border))`                                                             |
| `descMain` / `descHint`           | `desc.split('—')`: `descMain` (renderizado, trailing `,`/`;` removido) · `descHint` (1ª letra maiúscula, **não renderizado**) |
| `scope`                           | `period` usa a faixa da barra de Período · `full` exporta base inteira — **não renderizado** hoje                             |
| Ação ocupada                      | `busy[id]` → CSV/"Baixar PDF" trocam ícone p/ spinner, label p/ "Gerando…", `opacity:0.7; cursor:default`                     |
| Excel                             | `onClick → download(id+'-xls')`; label/estilo **estáticos** (sem feedback) — corrigir no real                                 |
| `download(id)`                    | ignora se `busy[id]`; seta busy; libera após **1300ms**                                                                       |
| Preset toggle                     | clicar no preset ativo limpa `preset`+datas                                                                                   |
| Preset "Tudo"                     | seleciona pílula mas zera `dateFrom`/`dateTo`                                                                                 |
| Editar date input                 | limpa `preset` (`''`)                                                                                                         |
| Pílula de preset                  | `idx = findIndex(preset)`; `idx<0` → `opacity:0` (oculta)                                                                     |
| Dot do sino                       | aparece se `unreadCount > 0`                                                                                                  |
| Notificação — linha               | lida `bg:transparent` / não-lida `bg:primary/0.05`; título 500/600; dot se não-lida                                           |
| "Marcar todas / pill de contagem" | só aparecem se `hasUnread`                                                                                                    |
| Grade                             | `auto-fit, minmax(322px, 1fr)` — reflui sem media query                                                                       |

---

## 13. Dados de exemplo (fonte da verdade)

### Exportações (10 `defs`, na ordem)

`{ id, title, icon, desc, scope, primary? }` — ver tabela completa em §7. Resumo dos `id`:
`exec` (primário) · `leads` · `pacientes` · `agenda` · `receitas` · `despesas` · `receber` · `procedimentos` · `atividades` · `metas`.

### Presets de período (4)

`Este mês` (`mes`) · `Mês passado` (`passado`) · `Últimos 90 dias` (`90d`) · `Tudo` (`tudo`). Estado inicial: **nenhum selecionado**, `dateFrom=''`, `dateTo=''`.

### Notificações (5) — idênticas ao Dashboard

```
1 lead    "Novo lead"                — Mariana Alves · Instagram        — agora  — não-lida
2 money   "Pagamento confirmado"     — R$ 1.200 · Botox · Camila Souza  — 8 min  — não-lida
3 agenda  "Agendamento confirmado"   — Patrícia Lima · amanhã às 14h    — 40 min — não-lida
4 alert   "Tarefa atrasada"          — Retornar ligação · Rafael Dias   — 1 h    — lida
5 agenda  "Novo agendamento online"  — Beatriz Ramos · Limpeza de pele  — 3 h    — lida
```

`unreadCount` inicial = **3**.

---

## 14. Props do componente & integração com o App

**Props (`data-props`, `$preview` 1440×920):**

- `defaultTheme`: enum `light | dark` (default `light`).

**Estado interno (`state`):**

- `theme` (fallback quando não controlado), `preset` (`''` inicial), `dateFrom`/`dateTo` (`''`), `busy` (`{}` — mapa por id), `notifOpen` (`false`), `bellRing`, `notifs` (5 itens).

**Props/callbacks que o App injeta** (integração real):

- `theme` (controlado externamente) + `onToggleTheme()` — a topbar usa `onToggleTheme` se presente, senão alterna `state.theme`.
- `onNavigate(labelDaRota)` — nav da sidebar.
- `onNewLead()` — botão "Novo lead".

**Callbacks a criar no real** (não existem no protótipo, que só simula com `setTimeout`):

- `onExport({ id, format, range })` — dispara a geração real do arquivo (`format ∈ 'pdf'|'csv'|'xlsx'`; `range = { from, to }` quando `scope:'period'`). Retorna estado ocupado + sucesso/erro por ação.

**Não usados / mortos no protótipo (limpar ao portar):** `descHint` (computado, não renderizado), `scope` (não vira UI), estilos `gold`/`goldHover` (definidos, não aplicados).

---

## 15. Ordem de build sugerida + checklist específico

**Ordem:**

1. Tokens no `globals.css` + Inter + `tabular-nums` (ver `design.md`).
2. **Chrome** (sidebar 236px + topbar) — reutilizar o compartilhado; item ativo = "Exportações". Ligar a **busca ao popover canônico** do dashboard.
3. Primitivos: card, botão ghost, **segmented dourado com pílula deslizante**, input de data com anel de foco + `color-scheme`, popover de notificações, skeleton shimmer, erro inline.
4. Barra de Período (rótulo + De/Até + presets) → grade `auto-fit` → card de exportação → ações CSV/Excel/PDF.
5. Ligar `onNavigate`, `onToggleTheme`, `onNewLead` e o `onExport` real (substituindo o `setTimeout`).
6. Rodar o checklist do `design.md` §9 na tela.

**Checklist específico de Exportações:**

- [ ] Só tokens semânticos; conferir dark mode em todas as superfícies (inclusive `color-scheme` dos inputs de data).
- [ ] Dois dourados nos papéis certos (`primary` superfície / `primary-text` texto/nav-ativo/tile do card primário/tile do Período/contadores).
- [ ] `tabular-nums` em inputs de data e no contador do sino.
- [ ] Card **primário** só se distingue por borda `primary/0.45` + tile dourado + ação única "Baixar PDF" — **decidir** se o CTA vai a dourado (não está no protótipo).
- [ ] Grade `auto-fit minmax(322px,1fr)` reflui de 1 a 3–4 colunas sem media query.
- [ ] Segmented de presets: pílula oculta quando nenhum selecionado; "Tudo" zera datas; editar data limpa preset; toggle no preset ativo limpa tudo.
- [ ] Preset "Mês passado" usa `new Date(y, m, 0)` para o último dia; "90 dias" = hoje−90; "Este mês" = dia 1 → hoje.
- [ ] Ação: spinner + "Gerando…" + `opacity:0.7`/`disabled` durante a geração; **Excel também** com feedback próprio (corrigir a inconsistência do protótipo).
- [ ] `spinner` gira no real (`animate-spin`), diferente do protótipo estático.
- [ ] Surfacar `scope` (Período vs Base completa) na UI; decidir sobre `descHint`.
- [ ] Estados: skeleton da grade, sucesso e **erro inline** por card — nunca `alert()`.
- [ ] Sino: dot se não-lidas, shake no clique, "Marcar todas como lidas", linhas tintadas por tipo.
- [ ] Toggle de tema: sol no claro / lua no escuro, swap com rotação+fade.
- [ ] hover/active/focus em tudo interativo; anel de foco `ring` nos inputs de data.
