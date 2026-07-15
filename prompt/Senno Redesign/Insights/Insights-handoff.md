# Insights — Handoff detalhado (item a item)

> Especificação granular da tela **Insights** (`Insights.dc.html`) — a central de alertas
> automáticos que a Senno gera sobre a operação da clínica (agenda, retenção, funil, estoque,
> financeiro, reputação…).
> Objetivo: reconstruir **cada elemento visual, medida, threshold e animação** no stack real
> (Next 16 + Tailwind v3 + shadcn/ui) sem improviso. **Nada aqui é opcional.**
>
> **Como usar este doc**
>
> 1. Leia `design.md` primeiro (tokens, regras de cor, tipografia, chrome). Este arquivo **não repete** os tokens — assume que já estão no `globals.css`.
> 2. Toda cor é token semântico via `hsl(var(--token))`. Onde aparece `primary/0.16`, leia `hsl(var(--primary) / 0.16)`.
> 3. Todo número (px, %, peso, threshold) é **literal do protótipo** — reproduza exatamente. Onde houver `clamp(...)`, é responsivo; mantenha a fórmula.
> 4. Os `.dc.html` usam um runtime de protótipo próprio — **não copie a sintaxe de template**. Recrie em React/TSX com as libs do codebase. Ícones → `lucide-react`.
> 5. Esta é, junto com Financeiro, **a tela mais complexa** do pacote: as **5 abas de status são páginas individuais** com dataset, ações, notas e estados próprios. Cada aba está documentada como se fosse uma tela (§7–§11).
>
> **Legenda de tokens usados abaixo (do `design.md`):**
> `--card` superfície · `--background` fundo app · `--foreground` texto · `--muted`/`--muted-foreground` neutro · `--border` bordas · `--accent` hover · `--primary` dourado-superfície · `--primary-foreground` texto escuro sobre dourado · `--primary-text` dourado-texto · `--ring` foco · `--destructive` erro · `--ok`/`--ok-bg` sucesso · `--warn`/`--warn-bg` aviso · `--shadow`/`--shadow-a` sombra tingida.

---

## 0. Índice

1. Estrutura geral da página (esqueleto + medidas de layout)
2. Sidebar (236px) — item a item
3. Topbar (header) — título + busca + tema + sino + Novo lead
4. Resumo por severidade (3 cards)
5. Barra de abas de status + "Recalcular" (indicador medido)
6. Anatomia do card de insight (colapsado ↔ expandido)
7. Aba **Aberto** (página individual)
8. Aba **Reconhecido** (página individual)
9. Aba **Em progresso** (página individual)
10. Aba **Resolvido** (página individual)
11. Aba **Dispensado** (página individual)
12. Estado vazio (por aba)
13. Deep-link vindo do Dashboard (foco + flash)
14. Catálogo de animações (keyframes + transições)
15. Thresholds & lógica condicional (tabela única)
16. Dados de exemplo (fonte da verdade — 13 insights + notificações)
17. Props do componente e integração com o App
18. Ordem de build sugerida + checklist

---

## 1. Estrutura geral da página

### Container raiz

- Elemento `.senno` com `data-theme` (`light|dark`) e `data-font="inter"`.
- `background: hsl(var(--background))`, `color: hsl(var(--foreground))`, `height: 100vh`, `overflow: hidden`, `line-height: 1.45`, `font-family: Inter`.
- `-webkit-font-smoothing: antialiased`, `box-sizing: border-box` global, `body { margin: 0 }`.

### Moldura da app (shell full-bleed)

`data-screen-label="Insights"` — `width:100%; height:100%; min-height:0; display:flex; overflow:hidden; background:hsl(var(--background))`.

Layout em duas colunas via flex (idêntico a todas as telas):

```
[ SIDEBAR 236px fixa ] [ MAIN flex:1 -> (TOPBAR fixo) + (BODY rolável) ]
```

- **MAIN**: `flex:1; min-width:0; min-height:0; display:flex; flex-direction:column`.
- **BODY rolável**: `flex:1; min-height:0; overflow-y:auto; padding:20px 24px; display:flex; flex-direction:column; gap:16px`. **Só o body rola** — sidebar e topbar ficam fixos.

> Note as diferenças de espaçamento do body em relação ao Dashboard: aqui `padding:20px 24px` e `gap:16px` (no Dashboard era `22px 24px` / `gap:18px`).

### Ordem vertical do body (gap 16px entre blocos)

1. **Resumo por severidade** — grid `auto-fit minmax(240px, 1fr)`, 3 cards (§4).
2. **Barra de abas de status + "Recalcular"** — linha `space-between` (§5).
3. **Lista de insights** (quando a aba tem itens) **OU** **estado vazio** (quando não tem) — mutuamente exclusivos (§6–§12).

> Não há "botão de ação da página" próprio nesta tela: a ação da barra de abas é o **Recalcular** (à direita das abas). O botão dourado global "Novo lead" vive no topbar, como em todas as telas.

### Breakpoints responsivos (media queries globais)

As classes utilitárias `.senno-2col` / `.senno-3col` existem no `<style>` (herdadas do chrome), mas **esta tela não as usa** — os grids de Insights são `auto-fit`/coluna única e refluem sozinhos. Mantenha as media queries no CSS global mesmo assim (`1024px` e `660px`).

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
| **Ativo** (Insights) | 600 | `hsl(var(--primary-text))` | `hsl(var(--accent))` |

**Ordem fixa da nav (12 itens, menu plano, sem seções):**
`Dashboard` · `Atividades` · `Agenda` · `Funil` · `Pacientes` · `Financeiro` · `Metas` · **`Insights` (ativo)** · `Procedimentos` · `Exportações` · `Notificações` · `Configurações`.

> **O item ativo nesta tela é `Insights`** (ícone lâmpada / `bulb` → `lucide-react` `Lightbulb`). Convenção da marca: **lâmpada = Insights/ideia**, lupa = busca.

Ícones (set stroke-24, lucide no real): grid, activity, calendar, funnel, users, money(rect+circle), target, **bulb**, syringe, download, bell, settings. Clique chama `onNavigate(label)`.

### 2.3 Rodapé (usuário)

- `margin-top:auto`. Card: `display:flex; align-items:center; gap:10px; padding:10px; border-radius:10px; background:hsl(var(--muted))`.
- Avatar "HC": `32×32px; border-radius:99px; background:hsl(var(--primary)/0.2); color:hsl(var(--primary-text)); font-size:12.5px; font-weight:600`.
- Nome "Dra. Helena Costa" `12.5px / 600` (trunca); cargo "Proprietária" `11px muted`.

---

## 3. Topbar (header)

`header`: `flex:none; display:flex; align-items:center; gap:16px; padding:14px 24px; border-bottom:1px solid hsl(var(--border)); background:hsl(var(--card))`.

- **Esquerda** (`flex:1; min-width:0`): `<h1>` **"Insights"** — `font-size:clamp(22px, 0.5vw + 18px, 27px); font-weight:600; letter-spacing:-0.01em; margin:0`.
- **Direita**: `display:flex; align-items:center; gap:9px` — na ordem: **Busca → Tema → Sino → Novo lead**.

### 3.1 Busca "Buscar paciente…" (colapsável) — **decorativa nesta tela**

O componente visual é **idêntico** ao do Dashboard (colapsa para ícone 38px e expande da direita para a esquerda até 240px no hover/focus), **mas aqui não há popover de resultados nem lógica de busca** — é só a caixa com `<input>` (comportamento decorativo). No produto real, ligue-a ao mesmo componente de busca global do Dashboard (com popover); no protótipo desta tela ela não abre resultados.

Marcação/CSS (classe `senno-search`):

- Wrapper `.senno-search`: `position:relative; width:38px; height:38px; flex:none`.
- Caixa `.senno-search-box`: `position:absolute; top:0; right:0; height:38px; width:38px` (colapsada) `; display:flex; align-items:center; gap:8px; padding:0 11px; border-radius:9px; border:1px solid hsl(var(--border)); background:hsl(var(--background)); color:hsl(var(--muted-foreground)); font-size:12.5px; overflow:hidden; white-space:nowrap; cursor:pointer`.
- **Transição:** `width .34s cubic-bezier(.4,0,.2,1), background .22s, border-color .22s, box-shadow .22s`; `transition-delay:0s`.
- **Expandido** (`:hover` no wrapper **ou** `:focus-within` na caixa): `width:240px; border-color:hsl(var(--input)); cursor:text`.
- **Foco** (`:focus-within`): `border-color:hsl(var(--ring)); box-shadow:0 0 0 3px hsl(var(--ring)/0.18)`.
- Ícone lupa `15×15px`, `flex:none`. Input: `border:none; outline:none; background:transparent; font-size:12.5px; color:foreground`, placeholder "Buscar paciente…".

### 3.2 Toggle de tema (sol/lua)

- Botão `.senno-theme-btn`: `38×38px; border-radius:9px; border:1px solid border; background:background; color:foreground; position:relative; overflow:hidden`; hover `background:accent`. `title` = "Modo escuro"/"Modo claro".
- Dois ícones sobrepostos `.senno-theme-ico` (`position:absolute; top:50%; left:50%; width:17px; height:17px; margin:-8.5px 0 0 -8.5px`), com `transition: transform .5s cubic-bezier(.34,1.3,.5,1), opacity .35s`.
- **Estados:**
  | | Light | Dark |
  |---|---|---|
  | Sol (`.senno-theme-sun`) | `rotate(0) scale(1)`, `opacity:1` | `rotate(90deg) scale(.35)`, `opacity:0` |
  | Lua (`.senno-theme-moon`) | `rotate(-90deg) scale(.35)`, `opacity:0` | `rotate(0) scale(1)`, `opacity:1` |
- Clique → alterna tema (`onToggleTheme` do App, ou local).

### 3.3 Sino de notificações (`senno-notif`)

Idêntico ao Dashboard.

- Wrapper `position:relative`. Botão `38×38px; border-radius:9px; border; background:background; color:foreground`; hover `accent`; `title="Notificações"`.
- Ícone sino `17×17px; transform-origin:top center`.
- **Dot de não-lidas** (se `unreadCount > 0`): `position:absolute; top:7px; right:8px; width:7px; height:7px; border-radius:99px; background:hsl(var(--destructive)); border:1.5px solid hsl(var(--card))`.
- **Animação de shake ao clicar:** aplica classe `senno-bell-ring-a` → keyframes `senno-bell-ring .7s cubic-bezier(.36,.07,.19,.97)` (§14). A classe é removida no `animationend`.

**Popover de notificações** (quando `notifOpen`):

- Overlay `fixed inset:0 z:40`. Painel: `position:absolute; top:46px; right:0; width:362px; background:popover; border:1px solid border; border-radius:12px; box-shadow:0 16px 40px -12px hsl(var(--shadow)/calc(var(--shadow-a)*3.5)); z:50; overflow:hidden`.
- **Cabeçalho:** "Notificações" (`clamp(13…14.3)/600`) + pill de contador de não-lidas (`11px/600; padding:1px 7px; radius:99px; background:hsl(var(--primary)/0.16); color:primary-text; tabular-nums`). À direita, botão-texto "Marcar todas como lidas" (`11.5px/600 primary-text`, hover underline) — só aparece se há não-lidas.
- **Lista:** `flex-direction:column; padding:0 6px 6px; max-height:344px; overflow-y:auto`.
- **Item** (`<button>`): `display:flex; align-items:flex-start; gap:11px; padding:10px 8px; border-radius:8px`; `background` = lida `transparent` / não-lida `hsl(var(--primary)/0.05)`; hover `accent`.
  - Ícone tile `32×32px; border-radius:99px`, cor por tipo (tabela abaixo). Ícone interno `15×15px`.
  - Título `12.5px`, `font-weight` = não-lida 600 / lida 500. Sub `11.5px muted` (trunca).
  - À direita: hora `10.5px muted` (nowrap) + dot `7×7px; radius:99px; background:primary` se não-lida.
- **Rodapé:** centralizado, "Ver todas as notificações" (`12px/600 primary-text`).

**Tints por tipo de notificação** (`iconBg` / `iconColor`):
| tipo | ícone | fundo | cor |
|---|---|---|---|
| `lead` | users | `primary/0.16` | `primary-text` |
| `money` | money | `ok-bg` | `ok` |
| `agenda` | calendar | `accent` | `muted-foreground` |
| `alert` | alert | `destructive/0.14` | `destructive` |

Clique num item → marca aquele como lido. "Marcar todas" → todas lidas.

### 3.4 Botão "Novo lead"

- `height:38px; padding:0 15px; border-radius:9px; border:none; background:hsl(var(--primary)); color:hsl(var(--primary-foreground)); font-size:clamp(13px, 0.14vw + 11.2px, 14.3px); font-weight:600; display:flex; align-items:center; gap:7px`; hover `filter:brightness(1.05)`.
- Ícone `+` `15×15px`. Clique → `onNewLead`.

---

## 4. Resumo por severidade (3 cards)

Primeiro bloco do body. Container: `display:grid; grid-template-columns:repeat(auto-fit, minmax(240px,1fr)); gap:14px`. São **3 cards** (Críticos / Avisos / Informativos abertos).

### 4.1 Anatomia do card-resumo

- `background:card; border:1px solid border; border-radius:13px; padding:16px 18px; box-shadow:0 1px 2px hsl(var(--shadow)/var(--shadow-a)); display:flex; align-items:center; gap:14px`. **Hover:** `border-color:hsl(var(--primary)/0.5)`.
- **Tile de ícone** (esquerda): `42×42px; border-radius:11px; flex:none`, `background = sev.tintBg`, `color = sev.tint`. Ícone interno `21×21px`.
- **Bloco de texto** (`flex:1; min-width:0`):
  - Label: `12.5px / 500; color:muted-foreground`.
  - Valor: `26px / 700; letter-spacing:-0.02em; font-variant-numeric:tabular-nums; line-height:1.1` (contagem inteira).

### 4.2 Os 3 cards (valores exatos)

A contagem considera **apenas insights ativos** — status ∈ `{aberto, reconhecido, progresso}` (resolvidos e dispensados **não** entram).

| Card (label)             | Severidade | Ícone              | Valor | Tile/cor                                          |
| ------------------------ | ---------- | ------------------ | ----- | ------------------------------------------------- |
| **Críticos abertos**     | `critico`  | alert (triângulo)  | **2** | `tint = destructive`, `tintBg = destructive/0.12` |
| **Avisos abertos**       | `aviso`    | alert (triângulo)  | **4** | `tint = warn`, `tintBg = warn-bg`                 |
| **Informativos abertos** | `info`     | info (círculo + i) | **3** | `tint = ok`, `tintBg = ok-bg`                     |

> **Regra de contagem (não mudar):** `sevCount(sev) = raw.filter(r => r.sev===sev && ['aberto','reconhecido','progresso'].includes(r.status)).length`. Com o dataset da §16: Críticos = 2 (2 abertos), Avisos = 4 (3 abertos + 1 reconhecido), Informativos = 3 (1 aberto + 1 reconhecido + 1 em progresso).
>
> Os campos `sub` de cada card ("exigem ação imediata" / "vale revisar esta semana" / "tendências e boas notícias") existem no dado mas **não são renderizados** no card atual — reserve-os caso queira exibir uma linha de apoio, mas o protótipo mostra só label + valor.

**Severidade → ícone:** `critico` e `aviso` usam o **triângulo de alerta** (`icoAlert` → lucide `AlertTriangle`); `info` usa o **círculo-info** (`icoInfo` → lucide `Info`). Não troque: é o que distingue "boa notícia/tendência" de "problema".

---

## 5. Barra de abas de status + "Recalcular"

Segundo bloco do body. Wrapper: `display:flex; align-items:flex-end; justify-content:space-between; gap:16px`.

### 5.1 Abas de status (esquerda) — underline medido

Barra: `ref` medido, `position:relative; display:flex; align-items:center; gap:4px; border-bottom:1px solid border; flex-wrap:wrap`.

- **Indicador deslizante** (2px dourado): `position:absolute; left:0; bottom:-1px; height:2px; border-radius:2px; background:hsl(var(--primary)); width:{indWidth}px; transform:translateX({indLeft}px); opacity:{indOpacity}; transition:transform .32s cubic-bezier(.34,1.1,.5,1), width .32s cubic-bezier(.34,1.1,.5,1), opacity .2s; pointer-events:none`.
  - `indLeft`/`indWidth` = `offsetLeft`/`offsetWidth` da aba ativa, **medidos após montar** (e re-medidos em `document.fonts.ready` e a cada update). `opacity` = 1 quando há largura medida, senão 0.
  - **A linha corta no fim da última aba** — o `border-bottom` da barra tem a largura do conteúdo das abas (não atravessa o body todo), porque a barra é `flex` sem `width:100%`.
- **Botão de aba** (`<button>`): `display:inline-flex; align-items:center; gap:7px; border:none; background:transparent; cursor:pointer; font-size:13.5px; font-weight:600; padding:9px 12px; margin-bottom:-1px; border-bottom:2px solid transparent`.
  - `color` = ativo `foreground` / inativo `muted-foreground`.
  - **Badge-contador** (pill, só se `count > 0`): `font-size:10.5px; font-weight:600; font-variant-numeric:tabular-nums; min-width:18px; text-align:center; padding:1px 6px; border-radius:99px`.
    - ativo → `background:hsl(var(--primary)/0.16)`, `color:primary-text`.
    - inativo → `background:hsl(var(--muted))`, `color:muted-foreground`.

**As 5 abas (ordem fixa) e seus contadores:**
| chave (`tab`) | rótulo | contador |
|---|---|---|
| `aberto` | **Aberto** | 6 |
| `reconhecido` | **Reconhecido** | 2 |
| `progresso` | **Em progresso** | 1 |
| `resolvido` | **Resolvido** | 3 |
| `dispensado` | **Dispensado** | 1 |

Aba padrão ao abrir a tela: **`aberto`**. Clique numa aba → `setState({tab})`. Cada aba é uma "página" com dataset/ações/notas próprios — ver §7–§11.

### 5.2 Lado direito (ação da página): "Recalcular"

`display:flex; align-items:center; gap:12px; flex:none; padding-bottom:6px` (alinhado ao rodapé das abas):

- **Selo de tempo:** "Última análise há 12 min" — `font-size:11.5px; color:muted-foreground; white-space:nowrap` (texto estático no protótipo).
- **Botão "Recalcular"** (secundário): `height:36px; padding:0 14px; border-radius:9px; border:1px solid input; background:card; color:foreground; font-size:clamp(13px, 0.14vw + 11.2px, 14.3px); font-weight:600; display:inline-flex; align-items:center; gap:7px`; hover `background:accent`.
  - Ícone refresh `15×15px`, `transition:transform 0.6s ease`. Ao clicar → `spin=true` (ícone gira `rotate(360deg)`), volta a `rotate(0)` após **650ms** (`setState({spin:false})`). No real: durante o recálculo, gire continuamente e reidrate a lista; aqui é só o gesto de 1 volta.

---

## 6. Anatomia do card de insight (colapsado ↔ expandido)

Terceiro bloco do body (quando a aba tem itens): `display:flex; flex-direction:column; gap:12px`, um card por insight. **O card inteiro é clicável** (`onClick` no wrapper) e alterna colapsado/expandido (estado por `title` em `state.expanded`).

### 6.1 Card (wrapper)

- `background:card; border:1px solid border; border-radius:13px; padding:15px 18px; box-shadow:0 1px 2px hsl(var(--shadow)/var(--shadow-a)); display:flex; gap:15px; cursor:pointer`.
- `opacity` = **0.72** se status ∈ `{resolvido, dispensado}` (esmaece o histórico); senão `1`.
- `outline` = anel de **flash** do deep-link: `2px solid hsl(var(--primary))` quando `flash===title`, senão `2px solid transparent`; `outline-offset:2px`.
- `transition: border-color .2s, box-shadow .2s, transform .2s, outline-color .4s`.
- **Hover:** `border-color:hsl(var(--primary)/0.5); box-shadow:0 5px 16px hsl(var(--shadow)/calc(var(--shadow-a)*1.7)); transform:translateY(-1px)`.

### 6.2 Tile de severidade (coluna esquerda)

`40×40px; border-radius:11px; flex:none; display:flex; center`, `background = sev.tintBg`, `color = sev.tint`. Ícone interno `20×20px` = **ícone da categoria do insight** (não o da severidade!) — ex.: calendar, heart, funnel, box, receipt, activity, syringe, star, money, target. Ver mapeamento na §16.

### 6.3 Cabeçalho do insight (sempre visível)

Linha `display:flex; align-items:center; gap:13px`:

- **Bloco título + métrica** (`flex:1; min-width:0; display:flex; align-items:baseline; gap:11px; flex-wrap:wrap`):
  - Título: `font-size:14.5px; font-weight:600`.
  - Métrica (inline, nowrap): valor `14px / 700; letter-spacing:-0.01em; tabular-nums; color = sev.tint` + rótulo `11.5px muted` (ex.: **"41%"** + "horários vagos").
- **Pill de severidade** (`flex:none`): `10.5px / 600; padding:3px 9px; border-radius:99px; white-space:nowrap`, `background = sev.pillBg`, `color = sev.pillColor`. Rótulos: "Crítico" / "Aviso" / "Informativo".
- **Chevron** (`18×18px; flex:none; color:muted-foreground`): `transform` = `rotate(180deg)` quando aberto / `rotate(0deg)` fechado; `transition:transform .34s cubic-bezier(.34,1.1,.5,1)`.

### 6.4 Região expansível (altura animada)

Wrapper: `display:grid; grid-template-rows:{open ? '1fr' : '0fr'}; transition:grid-template-rows .34s cubic-bezier(.4,0,.2,1)`. Filho: `overflow:hidden; min-height:0`. Conteúdo (`onClick` para com `stopPropagation`, para não recolher ao interagir): `display:flex; flex-direction:column; gap:12px; padding-top:13px`.

**a) Caixa de recomendação:**
`display:flex; align-items:flex-start; gap:8px; padding:11px 13px; border-radius:10px; background:hsl(var(--muted)/0.6); border:1px solid border`.

- Ícone lâmpada `15×15px; flex:none; margin-top:1px; color:primary-text`.
- Texto `12.5px; line-height:1.4`: **"Recomendação:"** (`<strong>` weight 600) + o texto de recomendação do insight.

**b) Linha de meta + ações:** `display:flex; align-items:center; gap:10px; flex-wrap:wrap`.

- **Chip de categoria:** `11px / 600; padding:3px 9px; border-radius:7px; background:accent; color:muted-foreground` (ex.: "Agenda", "Retenção", "Funil"…).
- **Tempo:** `11.5px muted` (ex.: "há 18 min", "ontem", "há 3 dias").
- Espaçador `flex:1`.
- **Nota de estado** (só resolvido/dispensado — ver por-aba): `display:inline-flex; align-items:center; gap:6px; font-size:11.5px; font-weight:500; color:{noteColor}`, ícone `14×14px` + texto.
- **Botões de ação** (variam por status — §6.5): renderizados após a nota, alinhados à direita.

> **Campo `desc`** (descrição longa de cada insight, presente no dataset da §16) **não é renderizado** no card atual — o card mostra título + métrica no cabeçalho e recomendação + meta no corpo. Mantenha `desc` no modelo de dados (útil para tooltip/detalhe futuro), mas saiba que hoje ele não aparece.

### 6.5 Botões de ação por status

Três estilos-base (todos `height:33px; border-radius:8px; font-size:12.5px; font-weight:600; cursor:pointer`; hover em todos: `filter:brightness(1.05)`):

- **ghost:** `padding:0 12px; border:none; background:transparent; color:muted-foreground`.
- **outline:** `padding:0 13px; border:1px solid input; background:card; color:foreground`.
- **solid:** `padding:0 14px; border:none; background:primary; color:primary-foreground`.

Conjunto de ações por status (da esquerda p/ direita):
| Status | Ações |
|---|---|
| `aberto` | ghost **Dispensar** · outline **Reconhecer** · solid **Criar tarefa** |
| `reconhecido` | ghost **Dispensar** · solid **Iniciar ação** |
| `progresso` | outline **Ver tarefa** · solid **Marcar resolvido** |
| `resolvido` | ghost **Reabrir** |
| `dispensado` | ghost **Reabrir** |

> No protótipo os botões são visuais (sem handler); no real, cada um transiciona o status do insight (Dispensar → `dispensado`, Reconhecer → `reconhecido`, Criar tarefa → cria tarefa em Atividades + `progresso`, Iniciar ação → `progresso`, Marcar resolvido → `resolvido`, Reabrir → `aberto`). Otimista + toast; sem `alert()`.

---

## 7. Aba **Aberto** (página individual)

Aba padrão. **6 insights**, todos acionáveis. `opacity:1` (não esmaecidos). Ações: **Dispensar · Reconhecer · Criar tarefa**. Sem nota de estado.

Ordem e conteúdo exatos (cabeçalho = título · métrica · pill · categoria · tempo · recomendação):

| #   | Sev / pill      | Ícone (cat.) | Título                                          | Métrica                     | Categoria  | Tempo     | Recomendação                                                 |
| --- | --------------- | ------------ | ----------------------------------------------- | --------------------------- | ---------- | --------- | ------------------------------------------------------------ |
| 1   | **Crítico**     | calendar     | Queda de 28% nos agendamentos da próxima semana | **41%** horários vagos      | Agenda     | há 18 min | disparar campanha de retorno e abrir encaixes para revisões. |
| 2   | **Crítico**     | heart        | 14 pacientes sem retorno há mais de 90 dias     | **R$ 21k** receita em risco | Retenção   | há 1 h    | criar tarefa de retenção para a equipe de atendimento.       |
| 3   | **Aviso**       | funnel       | Conversão do funil caiu para 31%                | **31%** conversão           | Funil      | há 3 h    | priorizar as propostas vencendo e revisar os follow-ups.     |
| 4   | **Aviso**       | box          | Estoque de toxina botulínica baixo              | **6** frascos               | Estoque    | há 5 h    | programar reposição com o fornecedor habitual.               |
| 5   | **Aviso**       | receipt      | Ticket médio 7% abaixo da meta                  | **R$ 1.298** ticket médio   | Financeiro | ontem     | oferecer protocolos combinados nas próximas consultas.       |
| 6   | **Informativo** | activity     | Quinta é o dia de maior movimento               | **32%** dos atendimentos    | Operação   | há 2 h    | reforçar a equipe e abrir mais horários às quintas.          |

- Cor da métrica e do tile seguem a severidade: Crítico → `destructive`; Aviso → `warn`; Informativo → `ok`.
- `desc` (não renderizado) de cada um está na §16.

---

## 8. Aba **Reconhecido** (página individual)

**2 insights.** `opacity:1`. Ações: **Dispensar · Iniciar ação**. Sem nota de estado.

| #   | Sev / pill      | Ícone (cat.) | Título                               | Métrica            | Categoria     | Tempo | Recomendação                                          |
| --- | --------------- | ------------ | ------------------------------------ | ------------------ | ------------- | ----- | ----------------------------------------------------- |
| 1   | **Aviso**       | calendar     | No-show acima da média às segundas   | **12%** de faltas  | Agenda        | ontem | reforçar a confirmação por mensagem na véspera.       |
| 2   | **Informativo** | syringe      | Botox lidera os procedimentos do mês | **138** aplicações | Procedimentos | ontem | destacar a linha em campanhas e pacotes promocionais. |

---

## 9. Aba **Em progresso** (página individual)

**1 insight.** `opacity:1`. Ações: **Ver tarefa · Marcar resolvido**. Sem nota de estado.

| #   | Sev / pill      | Ícone (cat.) | Título                                 | Métrica           | Categoria | Tempo     | Recomendação                                      |
| --- | --------------- | ------------ | -------------------------------------- | ----------------- | --------- | --------- | ------------------------------------------------- |
| 1   | **Informativo** | star         | Avaliações 5★ no Google bateram a meta | **42** avaliações | Reputação | há 2 dias | compartilhar os depoimentos nas redes da clínica. |

---

## 10. Aba **Resolvido** (página individual)

**3 insights.** `opacity:0.72` (esmaecidos — histórico). Ação: **Reabrir** (ghost). **Nota de estado** presente: "Resolvido {resolvedAt}" com ícone **check-circle** e cor `ok`.

| #   | Sev / pill      | Ícone (cat.) | Título                                   | Métrica                 | Categoria  | Tempo     | Nota                    | Recomendação                                               |
| --- | --------------- | ------------ | ---------------------------------------- | ----------------------- | ---------- | --------- | ----------------------- | ---------------------------------------------------------- |
| 1   | **Crítico**     | money        | Inadimplência de boletos regularizada    | **R$ 8,4k** recuperados | Financeiro | há 3 dias | Resolvido **em 22/jun** | manter a régua automática de lembretes ativa.              |
| 2   | **Aviso**       | box          | Reposição de ácido hialurônico concluída | **24** unidades         | Estoque    | há 4 dias | Resolvido **em 21/jun** | revisar o ponto de pedido para evitar nova ruptura.        |
| 3   | **Informativo** | target       | Campanha de Dia das Mães superou a meta  | **+24%** vs. meta       | Comercial  | há 6 dias | Resolvido **em 19/jun** | documentar o que funcionou para repetir em datas sazonais. |

- **Nota:** `noteIcon = check-circle` (`icoCheckCircle` → lucide `CheckCircle2`), `noteColor = ok`, texto `"Resolvido " + resolvedAt`.
- A pill de severidade continua mostrando a severidade original (Crítico/Aviso/Informativo), mesmo esmaecida.

---

## 11. Aba **Dispensado** (página individual)

**1 insight.** `opacity:0.72`. Ação: **Reabrir** (ghost). **Nota de estado:** "Dispensado" com ícone **slash** (círculo cortado) e cor `muted-foreground`.

| #   | Sev / pill      | Ícone (cat.) | Título                              | Métrica            | Categoria | Tempo    | Nota       | Recomendação                                          |
| --- | --------------- | ------------ | ----------------------------------- | ------------------ | --------- | -------- | ---------- | ----------------------------------------------------- |
| 1   | **Informativo** | calendar     | Baixa procura no feriado prolongado | **-15%** na semana | Agenda    | há 1 sem | Dispensado | sem ação necessária — comportamento sazonal previsto. |

- **Nota:** `noteIcon = slash` (`icoSlash` → lucide `Ban`/`CircleSlash`), `noteColor = muted-foreground`, texto `"Dispensado"`.

---

## 12. Estado vazio (por aba)

Renderiza **no lugar da lista** quando a aba selecionada não tem nenhum insight (`items.length === 0`). Com o dataset atual **todas as 5 abas têm itens**, então este estado não aparece por padrão — mas é obrigatório no real (ex.: uma clínica sem nada em "Dispensado").

- Container: `background:card; border:1px dashed border; border-radius:13px; padding:46px 24px; display:flex; flex-direction:column; align-items:center; text-align:center; gap:11px`.
- **Tile:** `40×40px; border-radius:11px; center; background:ok-bg; color:ok`, ícone check `20×20px` (`icoCheck` → lucide `Check`).
- **Título:** `14px / 600` = `Nenhum insight em "{rótulo da aba}"` (rótulo = "Aberto"/"Reconhecido"/…).
- **Texto de apoio:** `12.5px muted; margin-top:-4px; max-width:360px` = "Quando a Senno identificar algo que merece sua atenção neste status, ele aparece aqui com a recomendação sugerida."

> É um empty state **composto** (ícone + título + texto), no tom positivo (verde/`ok`) — "nada aqui" é boa notícia num contexto de alertas. Não use spinner nem `alert()`.

---

## 13. Deep-link vindo do Dashboard (foco + flash)

O card "Insights ativos" do Dashboard faz deep-link para esta tela. Fluxo (em `componentDidMount`):

1. Lê `localStorage['senno-insight-focus']` (o **título** do insight). Se existir, **remove a chave** (consumo único).
2. Se havia um foco: `setState({ tab:'aberto', expanded:{ [título]:true }, flash:título })` — abre a aba **Aberto**, **expande** o insight correspondente e liga o **anel de flash**.
3. Após **2600ms**, `setState({flash:null})` desliga o anel (timer limpo em `componentWillUnmount`).

- **Anel de flash:** `outline:2px solid hsl(var(--primary)); outline-offset:2px` no card cujo `title===flash`; transição `outline-color .4s` (o anel "acende" e "apaga" suave).
- Casamento é por **título exato** do insight (mesma string usada como chave em `state.expanded`). No real, prefira casar por **id** do insight em vez do título.

---

## 14. Catálogo de animações

### Keyframes (no `<style>`)

| Nome              | Definição                                 | Uso                     |
| ----------------- | ----------------------------------------- | ----------------------- |
| `senno-bell-ring` | rotação amortecida: `0→11deg→-9→6→-4→2→0` | shake do sino ao clicar |

> Esta tela **não** usa `sennoShimmer`/`sennoGrow` (não há skeleton nem barras que crescem). Se for exibir skeleton no real (recomendado durante o "Recalcular"), reutilize `sennoShimmer` do Dashboard.

### Transições

| Elemento                          | Propriedade / timing                                                             |
| --------------------------------- | -------------------------------------------------------------------------------- |
| Indicador de aba (underline)      | `transform .32s cubic-bezier(.34,1.1,.5,1)`, `width .32s` idem, `opacity .2s`    |
| Expandir/recolher card de insight | `grid-template-rows .34s cubic-bezier(.4,0,.2,1)` (0fr↔1fr)                      |
| Chevron do card                   | `transform .34s cubic-bezier(.34,1.1,.5,1)` (0↔180deg)                           |
| Card de insight (hover-lift)      | `border-color/box-shadow/transform .2s`; `translateY(-1px)`                      |
| Anel de flash (deep-link)         | `outline-color .4s`                                                              |
| Ícone "Recalcular" (1 volta)      | `transform 0.6s ease` (rotate 0→360, reset após 650ms)                           |
| Busca (expand/collapse)           | `width .34s cubic-bezier(.4,0,.2,1)`, bg/border/shadow `.22s`                    |
| Toggle de tema (sol↔lua)          | `transform .5s cubic-bezier(.34,1.3,.5,1)`, `opacity .35s`                       |
| Sino (shake)                      | `senno-bell-ring .7s cubic-bezier(.36,.07,.19,.97)` (removida no `animationend`) |
| Card-resumo / card (hover)        | `border-color` → `hsl(var(--primary)/0.5)`                                       |

> Tom **operacional/premium**: transições curtas, leve overshoot. A expansão do card usa o truque `grid-template-rows: 0fr → 1fr` (anima altura sem `max-height` mágico).

---

## 15. Thresholds & lógica condicional (resumo)

| Onde                               | Regra                                                                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Filtro da lista**                | `items = raw.filter(r => r.status === tab)`; a aba ativa define o que aparece                                                                                |
| **Contador da aba**                | `countBy(status) = raw.filter(r => r.status===status).length`; badge só se `> 0`                                                                             |
| **Resumo por severidade**          | `sevCount(sev) = raw.filter(r => r.sev===sev && status ∈ {aberto,reconhecido,progresso})` — resolvidos/dispensados **não** contam                            |
| **Esmaecer card** (`opacity:0.72`) | status ∈ `{resolvido, dispensado}`; senão `1`                                                                                                                |
| **Ações por status**               | aberto → Dispensar/Reconhecer/Criar tarefa · reconhecido → Dispensar/Iniciar ação · progresso → Ver tarefa/Marcar resolvido · resolvido/dispensado → Reabrir |
| **Nota de estado**                 | resolvido → "Resolvido {resolvedAt}", `ok`, check-circle · dispensado → "Dispensado", `muted`, slash · demais → sem nota                                     |
| **Cor do tile / da métrica**       | por severidade: crítico `destructive`/`destructive/0.12` · aviso `warn`/`warn-bg` · info `ok`/`ok-bg`                                                        |
| **Ícone da severidade**            | crítico e aviso → alert (triângulo) · info → info (círculo)                                                                                                  |
| **Ícone do tile do card**          | é o **ícone da categoria** do insight (calendar, heart, funnel, box, receipt, activity, syringe, star, money, target), não o da severidade                   |
| **Badge da aba**                   | ativo `primary/0.16`+`primary-text` · inativo `muted`+`muted-foreground`                                                                                     |
| **Indicador de aba**               | `translateX(offsetLeft)` + `width:offsetWidth` da aba ativa, medido em mount/update/`fonts.ready`; `opacity` 0 até medir                                     |
| **Expandir card**                  | por `title` em `state.expanded`; `grid-template-rows` 0fr↔1fr; chevron 0↔180deg                                                                              |
| **Recalcular**                     | `spin=true` → ícone gira 1 volta → `spin=false` após 650ms                                                                                                   |
| **Deep-link**                      | `localStorage['senno-insight-focus']` (título) → aba `aberto` + expande + flash 2600ms; chave consumida (removida)                                           |
| **Estado vazio**                   | `items.length===0` → empty composto com o rótulo da aba                                                                                                      |
| Dot do sino                        | aparece se `unreadCount > 0`                                                                                                                                 |
| Notificação — linha                | lida `bg:transparent` / não-lida `bg:primary/0.05`, título 500/600, dot se não-lida                                                                          |

---

## 16. Dados de exemplo (fonte da verdade)

### Dataset de insights (`raw` — 13 itens, ordem exata)

Campos: `sev` (`critico|aviso|info`), `status` (`aberto|reconhecido|progresso|resolvido|dispensado`), `icon` (categoria), `cat` (rótulo da categoria), `time`, `title`, `desc`, `metricValue`, `metricLabel`, `recommendation` e — só em resolvidos — `resolvedAt`.

```
# ABERTO (6)
1  critico | aberto      | calendar | Agenda        | há 18 min
   title: Queda de 28% nos agendamentos da próxima semana
   metric: 41% · horários vagos
   desc:  A semana de 29/jun a 05/jul está com 41% dos horários vagos, abaixo da média das últimas 4 semanas.
   rec:   disparar campanha de retorno e abrir encaixes para revisões.
2  critico | aberto      | heart    | Retenção      | há 1 h
   title: 14 pacientes sem retorno há mais de 90 dias
   metric: R$ 21k · receita em risco
   desc:  Pacientes de alto valor sem reagendamento — evasão estimada em receita relevante.
   rec:   criar tarefa de retenção para a equipe de atendimento.
3  aviso   | aberto      | funnel   | Funil         | há 3 h
   title: Conversão do funil caiu para 31%
   metric: 31% · conversão
   desc:  9 leads parados na etapa Proposta há mais de 7 dias sem follow-up.
   rec:   priorizar as propostas vencendo e revisar os follow-ups.
4  aviso   | aberto      | box      | Estoque       | há 5 h
   title: Estoque de toxina botulínica baixo
   metric: 6 · frascos
   desc:  Restam 6 frascos — abaixo do mínimo para a demanda projetada do mês.
   rec:   programar reposição com o fornecedor habitual.
5  aviso   | aberto      | receipt  | Financeiro    | ontem
   title: Ticket médio 7% abaixo da meta
   metric: R$ 1.298 · ticket médio
   desc:  Junho está em R$ 1.298 contra a meta de R$ 1.400 para o período.
   rec:   oferecer protocolos combinados nas próximas consultas.
6  info    | aberto      | activity | Operação      | há 2 h
   title: Quinta é o dia de maior movimento
   metric: 32% · dos atendimentos
   desc:  32% dos atendimentos do mês concentram-se às quintas-feiras.
   rec:   reforçar a equipe e abrir mais horários às quintas.

# RECONHECIDO (2)
7  aviso   | reconhecido | calendar | Agenda        | ontem
   title: No-show acima da média às segundas
   metric: 12% · de faltas
   desc:  Taxa de faltas chegou a 12% nas segundas-feiras no último mês.
   rec:   reforçar a confirmação por mensagem na véspera.
8  info    | reconhecido | syringe  | Procedimentos | ontem
   title: Botox lidera os procedimentos do mês
   metric: 138 · aplicações
   desc:  138 aplicações em junho, 18% acima de maio.
   rec:   destacar a linha em campanhas e pacotes promocionais.

# EM PROGRESSO (1)
9  info    | progresso   | star     | Reputação     | há 2 dias
   title: Avaliações 5★ no Google bateram a meta
   metric: 42 · avaliações
   desc:  42 avaliações neste trimestre, a meta era 40.
   rec:   compartilhar os depoimentos nas redes da clínica.

# RESOLVIDO (3) — opacity 0.72, nota "Resolvido {resolvedAt}"
10 critico | resolvido   | money    | Financeiro    | há 3 dias  | resolvedAt: em 22/jun
   title: Inadimplência de boletos regularizada
   metric: R$ 8,4k · recuperados
   desc:  Cobranças em atraso foram quitadas após a régua de cobrança.
   rec:   manter a régua automática de lembretes ativa.
11 aviso   | resolvido   | box      | Estoque       | há 4 dias  | resolvedAt: em 21/jun
   title: Reposição de ácido hialurônico concluída
   metric: 24 · unidades
   desc:  Pedido recebido e conferido; estoque normalizado.
   rec:   revisar o ponto de pedido para evitar nova ruptura.
12 info    | resolvido   | target   | Comercial     | há 6 dias  | resolvedAt: em 19/jun
   title: Campanha de Dia das Mães superou a meta
   metric: +24% · vs. meta
   desc:  Geração de leads 24% acima do previsto para a ação.
   rec:   documentar o que funcionou para repetir em datas sazonais.

# DISPENSADO (1) — opacity 0.72, nota "Dispensado"
13 info    | dispensado  | calendar | Agenda        | há 1 sem
   title: Baixa procura no feriado prolongado
   metric: -15% · na semana
   desc:  Queda já esperada pela sazonalidade do calendário.
   rec:   sem ação necessária — comportamento sazonal previsto.
```

**Contagens derivadas:** Aberto 6 · Reconhecido 2 · Em progresso 1 · Resolvido 3 · Dispensado 1 (total **13**). Resumo por severidade (só ativos): Críticos **2** · Avisos **4** · Informativos **3**.

### Tokens de severidade (`SEV`)

| chave     | rótulo (pill) | `tint` (métrica/tile) | `tintBg` (tile)    | `pillBg`           | `pillColor`   | ícone |
| --------- | ------------- | --------------------- | ------------------ | ------------------ | ------------- | ----- |
| `critico` | Crítico       | `destructive`         | `destructive/0.12` | `destructive/0.12` | `destructive` | alert |
| `aviso`   | Aviso         | `warn`                | `warn-bg`          | `warn-bg`          | `warn`        | alert |
| `info`    | Informativo   | `ok`                  | `ok-bg`            | `ok-bg`            | `ok`          | info  |

### Notificações (5 — mesmas do Dashboard)

```
1 lead    "Novo lead"                — Mariana Alves · Instagram            — agora  — não-lida
2 money   "Pagamento confirmado"     — R$ 1.200 · Botox · Camila Souza      — 8 min  — não-lida
3 agenda  "Agendamento confirmado"   — Patrícia Lima · amanhã às 14h        — 40 min — não-lida
4 alert   "Tarefa atrasada"          — Retornar ligação · Rafael Dias       — 1 h    — lida
5 agenda  "Novo agendamento online"  — Beatriz Ramos · Limpeza de pele      — 3 h    — lida
```

(`unreadCount = 3` → dot no sino ligado.)

### Selo de tempo

"Última análise há 12 min" — estático no protótipo; no real, derive do timestamp do último recálculo.

---

## 17. Props do componente & integração com o App

**Props do Insights** (`data-props`, `$preview` 1440×900):

- `defaultTheme`: enum `light | dark` (default `light`).

**Callbacks/props que o App injeta** (integração real):

- `theme` (controlado externamente), `onToggleTheme()`, `onSetTheme('light'|'dark')`.
- `onNavigate(labelDaRota)` — nav da sidebar.
- `onNewLead()` — botão "Novo lead" do topbar.

**Deep-link (via `localStorage`, não é prop):**

- O Dashboard grava `localStorage['senno-insight-focus'] = títuloDoInsight` antes de chamar `onNavigate('Insights')`.
- Ao montar, Insights lê e **remove** a chave, abre a aba `aberto`, expande o insight e aplica o flash por 2600ms (§13). No real, prefira casar por **id** do insight em vez do título.

**Estado interno relevante (para replicar):**

- `tab` (aba ativa, default `'aberto'`), `expanded` (mapa título→bool), `spin` (Recalcular), `flash` (deep-link), `notifs`/`notifOpen`/`bellRing` (sino), `indLeft`/`indWidth` (indicador de aba medido).

---

## 18. Ordem de build sugerida + checklist

**Ordem:**

1. Tokens no `globals.css` + Inter + `tabular-nums` (ver `design.md`) — já feito no chrome.
2. **Chrome** (sidebar 236px + topbar) — reaproveite o de qualquer tela; só muda o título ("Insights") e o item ativo da nav.
3. Primitivos: card, botões (ghost/outline/solid), **pill de severidade**, **abas underline com indicador medido**, **card expansível** (grid-rows 0fr↔1fr + chevron), popover do sino, empty state composto.
4. Resumo por severidade (3 cards) → barra de abas + Recalcular → lista de insights → estado vazio.
5. Ligar callbacks (`onNavigate`, `onToggleTheme`, `onNewLead`), as transições de status das ações, e o **deep-link** (localStorage) vindo do Dashboard.
6. Rodar o checklist do `design.md` §9 na tela.

**Checklist específico de Insights:**

- [ ] Só tokens semânticos; conferir dark mode em **todas** as superfícies (cards-resumo, cards de insight, pills, notas).
- [ ] Dois dourados nos papéis certos (`primary` superfície: pill de aba ativa/0.16, botão solid; `primary-text` texto: nav ativo, contadores, lâmpada da recomendação, links).
- [ ] `tabular-nums` em: valores dos cards-resumo, métrica de cada insight, contadores de aba.
- [ ] Severidade correta: crítico `destructive` · aviso `warn` · info `ok`; ícone alert (crítico/aviso) vs info (info).
- [ ] Tile do card usa o **ícone da categoria**, não o da severidade.
- [ ] Resumo conta **só ativos** (aberto+reconhecido+progresso): Críticos 2 · Avisos 4 · Informativos 3.
- [ ] Contadores das abas: 6 · 2 · 1 · 3 · 1; badge só quando `> 0`; ativo dourado / inativo neutro.
- [ ] Indicador de aba medido (offsetLeft/Width), animado, **corta no fim da última aba** e re-mede em `fonts.ready`/resize.
- [ ] Card expande/recolhe via `grid-template-rows` 0fr↔1fr; chevron gira 180°; clique dentro do corpo **não** recolhe (`stopPropagation`).
- [ ] Resolvido/dispensado esmaecidos (`opacity:0.72`) com nota de estado (check-circle+ok / slash+muted).
- [ ] Ações corretas por status (Dispensar/Reconhecer/Criar tarefa · Dispensar/Iniciar ação · Ver tarefa/Marcar resolvido · Reabrir).
- [ ] Recalcular gira o ícone 1 volta (650ms); no real, skeleton/reidrata a lista — nunca `alert()`.
- [ ] Deep-link: consome `localStorage['senno-insight-focus']`, abre `aberto`, expande e faz flash 2600ms.
- [ ] Estado vazio composto por aba (ícone check `ok` + título com o rótulo da aba + texto de apoio).
- [ ] Busca do topbar é decorativa aqui — no real, ligar ao componente de busca global com popover.
- [ ] Sino: dot se não-lidas (3), shake no clique, "Marcar todas como lidas", linhas tintadas por tipo.
- [ ] Toggle de tema: sol no claro / lua no escuro, swap com rotação+fade.
- [ ] hover/active/focus em tudo interativo; anel de foco `ring`.
