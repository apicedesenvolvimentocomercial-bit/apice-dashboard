# Pacientes — Handoff detalhado (item a item)

> Especificação granular da tela **Pacientes** (`Pacientes.dc.html`).
> Objetivo: reconstruir **cada elemento visual, medida, threshold e animação** no stack real
> (Next 16 + Tailwind v3 + shadcn/ui) sem improviso. **Nada aqui é opcional.**
>
> **Como usar este doc**
>
> 1. Leia `design.md` primeiro (tokens, regras de cor, tipografia, chrome). Este arquivo **não repete** os tokens — assume que já estão no `globals.css`.
> 2. Toda cor é token semântico via `hsl(var(--token))`. Onde aparece `primary/0.16`, leia `hsl(var(--primary) / 0.16)`.
> 3. Todo número (px, %, peso, threshold) é **literal do protótipo** — reproduza exatamente. Onde houver `clamp(...)`, é responsivo; mantenha a fórmula.
> 4. Os `.dc.html` usam um runtime de protótipo próprio — **não copie a sintaxe de template**. Recrie em React/TSX com as libs do codebase. Ícones → `lucide-react`.
>
> **Legenda de tokens usados abaixo (do `design.md`):**
> `--card` superfície · `--background` fundo app · `--foreground` texto · `--muted`/`--muted-foreground` neutro · `--border` bordas · `--accent` hover · `--primary` dourado-superfície · `--primary-foreground` texto escuro sobre dourado · `--primary-text` dourado-texto · `--ring` foco · `--destructive` erro · `--ok`/`--ok-bg` sucesso · `--shadow`/`--shadow-a` sombra tingida.

---

## 0. Índice

1. Estrutura geral da página (esqueleto + medidas de layout)
2. Sidebar (236px) — item a item
3. Topbar (header) — título + busca + tema + sino + Novo lead
4. Barra de abas + ações da página (Todos / Ativos / Inativos + Filtros + Novo paciente)
5. Tabela de pacientes (cabeçalho + linhas + célula a célula)
6. Sistema de tags (5 tipos)
7. Rodapé / paginação
8. Estado vazio (composto)
9. Galeria de estados (carregado / skeleton / vazio / erro)
10. Catálogo de animações (keyframes + transições)
11. Thresholds & lógica condicional (tabela única)
12. Dados de exemplo (fonte da verdade)
13. Props do componente e integração com o App
14. Ordem de build sugerida + checklist

> **Nota de escopo (importante):** as abas **Hoje/Semana/Atrasadas/Todas/Feitas** e o **banner de atrasada** pertencem à tela **Atividades**, _não_ a Pacientes. Esta tela usa três abas de segmento de base — **Todos / Ativos / Inativos** — e não tem banner. Se você veio procurando por aquelas abas, elas estão no handoff de Atividades.

---

## 1. Estrutura geral da página

### Container raiz

- Elemento `.senno` com `data-theme` (`light|dark`) e `data-font` (`inter`).
- `background: hsl(var(--background))`, `color: hsl(var(--foreground))`, `height: 100vh`, `overflow: hidden`, `line-height: 1.45`, `font-family: Inter`.
- `-webkit-font-smoothing: antialiased`, `box-sizing: border-box` global, `body { margin: 0 }`.

### Moldura da app (shell full-bleed)

`data-screen-label="Pacientes"` — `width:100%; height:100%; min-height:0; display:flex; overflow:hidden; background:hsl(var(--background))`.

Layout em duas colunas via flex:

```
[ SIDEBAR 236px fixa ] [ MAIN flex:1 -> (TOPBAR fixo) + (BODY rolável) ]
```

- **MAIN**: `flex:1; min-width:0; min-height:0; display:flex; flex-direction:column`.
- **BODY rolável**: `flex:1; min-height:0; overflow-y:auto; padding:18px 24px; display:flex; flex-direction:column; gap:16px`. **Só o body rola** — sidebar e topbar ficam fixos.

### Ordem vertical do body (gap 16px entre blocos)

1. Linha **abas + ações da página** (barra de abas à esquerda, Filtros + "Novo paciente" à direita)
2. **Tabela de pacientes** (quando há linhas) **ou** **estado vazio** (quando o filtro não retorna nada) — mutuamente exclusivos

### Breakpoints responsivos (media queries globais herdadas do chrome)

- `@media (max-width:1024px)`: `.senno-2col { grid-template-columns:1fr }` e `.senno-3col { grid-template-columns:1fr 1fr }`.
- `@media (max-width:660px)`: `.senno-3col { grid-template-columns:1fr }`.
- Esta tela **não usa** `.senno-2col`/`.senno-3col`; a tabela é um grid próprio de largura fluida (ver §5). As media queries ficam no chrome por consistência.

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

Cada item = `<a href="#">` (no real: `<Link>`), estrutura:

- `display:flex; align-items:center; gap:11px; padding:8px 10px; border-radius:8px; font-size:13.5px; text-decoration:none`.
- Ícone: `18×18px`, `flex:none`.
- Label: `flex:1; white-space:nowrap`.
- **Hover** (qualquer item): `background:hsl(var(--accent))`.

Estados por item:
| Estado | `font-weight` | texto/ícone (`color`) | `background` |
|---|---|---|---|
| Inativo | 500 | `hsl(var(--muted-foreground))` | `transparent` |
| **Ativo** (Pacientes) | 600 | `hsl(var(--primary-text))` | `hsl(var(--accent))` |

**Ordem fixa da nav (12 itens, menu plano, sem seções):**
`Dashboard` · `Atividades` · `Agenda` · `Funil` · **`Pacientes` (ativo)** · `Financeiro` · `Metas` · `Insights` · `Procedimentos` · `Exportações` · `Notificações` · `Configurações`.

Ícones (set stroke-24, lucide no real): grid, activity, calendar, funnel, **users**, money, target, bulb, syringe, download, bell, settings. Clique chama `onNavigate(label)`. Nesta tela o item **Pacientes** (ícone `users`) é o ativo.

### 2.3 Rodapé (usuário)

- `margin-top:auto` (empurra p/ base). Card: `display:flex; align-items:center; gap:10px; padding:10px; border-radius:10px; background:hsl(var(--muted))`.
- Avatar "HC": `32×32px; border-radius:99px; background:hsl(var(--primary)/0.2); color:hsl(var(--primary-text)); font-size:12.5px; font-weight:600`.
- Nome "Dra. Helena Costa" `12.5px / 600` (trunca); cargo "Proprietária" `11px muted`.

---

## 3. Topbar (header)

`header`: `flex:none; display:flex; align-items:center; gap:16px; padding:14px 24px; border-bottom:1px solid hsl(var(--border)); background:hsl(var(--card))`.

- **Esquerda** (`flex:1; min-width:0`): `<h1>` **"Pacientes"** — `font-size:clamp(22px, 0.5vw + 18px, 27px); font-weight:600; letter-spacing:-0.01em; margin:0`.
- **Direita**: `display:flex; align-items:center; gap:9px` — na ordem: **Busca → Tema → Sino → Novo lead**.

### 3.1 Busca "Buscar paciente…" (colapsável)

**Comportamento:** ícone de lupa 38px que **expande da direita para a esquerda** até 240px no hover/focus.

Marcação/CSS (classe `senno-search`):

- Wrapper `.senno-search`: `position:relative; width:38px; height:38px; flex:none`.
- Caixa `.senno-search-box`: `position:absolute; top:0; right:0; height:38px; width:38px` (estado colapsado) `; display:flex; align-items:center; gap:8px; padding:0 11px; border-radius:9px; border:1px solid hsl(var(--border)); background:hsl(var(--background)); color:hsl(var(--muted-foreground)); font-size:12.5px; overflow:hidden; white-space:nowrap; cursor:pointer`.
- **Transição:** `width .34s cubic-bezier(.4,0,.2,1), background .22s, border-color .22s, box-shadow .22s`.
- **Expandido** (`:hover` no wrapper **ou** `:focus-within` na caixa): `width:240px; border-color:hsl(var(--input)); cursor:text`.
- **Foco** (`:focus-within`): `border-color:hsl(var(--ring)); box-shadow:0 0 0 3px hsl(var(--ring)/0.18)` (anel de foco padrão).
- Ícone lupa `15×15px`, `flex:none`. Input: `border:none; outline:none; background:transparent; font-size:12.5px; color:foreground`, placeholder "Buscar paciente…".

> **Diferença vs. Dashboard:** nesta tela a busca da topbar é **só o campo colapsável** — **não** abre popover de resultados (não há `searchOpen`/`results`/highlight aqui). No produto real, se você já implementou o popover de busca global no chrome (spec no dashboard §3.1), reutilize-o; caso contrário, o campo pode filtrar a tabela abaixo. O protótipo desta tela não fia essa lógica — a filtragem visível vem das abas (§4).

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

Idêntico ao dashboard. Wrapper `position:relative`. Botão `38×38px; border-radius:9px; border; background:background; color:foreground`; hover `accent`; `title="Notificações"`.

- Ícone sino `17×17px; transform-origin:top center`.
- **Dot de não-lidas** (se `unreadCount > 0`): `position:absolute; top:7px; right:8px; width:7px; height:7px; border-radius:99px; background:hsl(var(--destructive)); border:1.5px solid hsl(var(--card))`.
- **Animação de shake ao clicar:** aplica classe `senno-bell-ring-a` → keyframes `senno-bell-ring .7s cubic-bezier(.36,.07,.19,.97)` (ver §10). A classe é removida no `animationend`.

**Popover de notificações** (quando `notifOpen`):

- Overlay `fixed inset:0 z:40`. Painel: `position:absolute; top:46px; right:0; width:362px; background:hsl(var(--popover)); border:1px solid hsl(var(--border)); border-radius:12px; box-shadow:0 16px 40px -12px hsl(var(--shadow)/calc(var(--shadow-a)*3.5)); z:50; overflow:hidden`.
- **Cabeçalho:** "Notificações" (`clamp(13px, 0.14vw + 11.2px, 14.3px)/600`) + pill de contador de não-lidas (`11px/600; padding:1px 7px; radius:99px; background:hsl(var(--primary)/0.16); color:primary-text; tabular-nums`). À direita, botão-texto "Marcar todas como lidas" (`11.5px/600 primary-text`, hover underline) — só aparece se há não-lidas.
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
- Ícone `+` `15×15px`. Clique → `onNewLead` (abre criação de lead).

> Este é o botão **global do chrome** (topbar). A ação **específica desta tela** ("Novo paciente") vive **dentro do conteúdo**, na barra de abas (§4.3) — não no header. Não confundir os dois.

---

## 4. Barra de abas + ações da página

Primeiro bloco do body. Linha: `display:flex; align-items:center; justify-content:space-between; gap:16px`.

- **Esquerda:** barra de abas de segmento (Todos / Ativos / Inativos) com indicador underline animado.
- **Direita:** botão de Filtros (ícone) + botão "Novo paciente" (dourado).

### 4.1 Abas (underline dourado medido)

Wrapper da barra: `ref=setTabBar; position:relative; display:flex; align-items:center; gap:4px; border-bottom:1px solid hsl(var(--border))`.

**Indicador deslizante** (elemento absoluto dentro do wrapper):

- `position:absolute; left:0; bottom:-1px; height:2px; border-radius:2px; background:hsl(var(--primary)); width:{indWidth}; transform:translateX({indLeft}); opacity:{indOpacity}; pointer-events:none`.
- **Transição:** `transform .32s cubic-bezier(.34,1.1,.5,1), width .32s cubic-bezier(.34,1.1,.5,1), opacity .2s`.
- **Medição:** ao montar (`componentDidMount`), em cada update (`componentDidUpdate`) e após `document.fonts.ready`, mede a aba ativa (`[data-tab-active="1"]`) e grava `indLeft = offsetLeft`, `indWidth = offsetWidth`. `indOpacity` = `1` quando há largura medida, senão `0` (esconde o indicador até a 1ª medição). **A linha de 2px corta no fim da última aba — não atravessa a largura toda** (o `border-bottom` do wrapper é a régua fina; o indicador é o traço grosso dourado).

Cada aba = `<button>` (`data-tab-active` = `"1"` na ativa, `""` nas demais):

- `position:relative; display:inline-flex; align-items:center; gap:7px; border:none; background:transparent; cursor:pointer; font-size:13.5px; font-weight:600; padding:9px 12px; margin-bottom:-1px; border-bottom:2px solid transparent`.
- **Cor do texto:** ativa `hsl(var(--foreground))` / inativa `hsl(var(--muted-foreground))`.
- **Badge-contador** (pill à direita do rótulo): `font-size:10.5px; font-weight:600; font-variant-numeric:tabular-nums; min-width:18px; text-align:center; padding:1px 6px; border-radius:99px`.
  - Ativa: `background:hsl(var(--primary)/0.16); color:primary-text`.
  - Inativa: `background:hsl(var(--muted)); color:muted-foreground`.

**Abas (3) — rótulo + contador:**
| chave | Rótulo | Contador (padrão) | filtro aplicado |
|---|---|---|---|
| `todos` | Todos | **10** | todos os registros |
| `ativos` | Ativos | **8** | `status === 'ativo'` |
| `inativos` | Inativos | **2** | `status === 'inativo'` |

- Aba padrão selecionada = **Todos** (`state.tab = 'todos'`).
- Clique numa aba → `setState({tab})`; a tabela reflui e o contador da aba ativa fica dourado.

### 4.2 Botão de Filtros (ícone)

- `width:36px; height:36px; border-radius:9px; border:1px solid hsl(var(--border)); background:hsl(var(--card)); color:foreground; display:inline-flex; align-items:center; justify-content:center; cursor:pointer`; hover `background:accent`. `title="Filtros"`.
- Ícone **sliders** `17×17px` (duas linhas horizontais + dois círculos vazados com `fill:hsl(var(--card))` — o mesmo ícone de filtros usado na Agenda). No protótipo é **decorativo** (sem popover de filtros); no real, abrir um painel de filtros (status, tags, período de visita).

### 4.3 Botão "Novo paciente" (ação da página)

- `height:36px; padding:0 14px; border-radius:9px; border:none; background:hsl(var(--primary)); color:hsl(var(--primary-foreground)); font-size:clamp(13px, 0.14vw + 11.2px, 14.3px); font-weight:600; display:inline-flex; align-items:center; gap:7px; cursor:pointer`; hover `filter:brightness(1.05)`.
- Ícone `+` `15×15px`. **Altura 36px** (compacta) — menor que o "Novo lead" da topbar (38px), porque é ação de conteúdo alinhada à barra de abas.

---

## 5. Tabela de pacientes

Renderiza quando `hasRows` (há linhas no filtro atual). Card externo: `background:hsl(var(--card)); border:1px solid hsl(var(--border)); border-radius:13px; box-shadow:0 1px 2px hsl(var(--shadow)/var(--shadow-a)); overflow:hidden`.

### 5.1 Grid compartilhado (cabeçalho + linhas)

Tanto o cabeçalho quanto cada linha usam **o mesmo grid** (assim as colunas alinham):

```
grid-template-columns: minmax(0,2.3fr) minmax(0,1.9fr) 112px 112px 92px minmax(0,1.7fr);
align-items: center;
gap: 16px;
```

6 colunas, na ordem: **Paciente · E-mail · 1ª visita · Última visita · Agend. · Tags**. As três do meio são fixas em px; Paciente/E-mail/Tags são fluidas.

### 5.2 Cabeçalho

- `padding:11px 20px; background:hsl(var(--muted)/0.4); border-bottom:1px solid hsl(var(--border))`.
- Rótulos: `font-size:11.5px; font-weight:600; letter-spacing:0.02em; text-transform:uppercase; color:hsl(var(--muted-foreground))`.
- Textos: `Paciente` · `E-mail` · `1ª visita` · `Última visita` · `Agend.` (**`text-align:center`**) · `Tags`.

### 5.3 Linha (item a item)

Container da linha: `padding:12px 20px; border-top:1px solid hsl(var(--border)); cursor:pointer`; **hover** `background:hsl(var(--accent)/0.5)`. (A 1ª linha herda a borda-topo; visualmente encosta no cabeçalho.)

**Coluna 1 — Paciente** (`display:flex; align-items:center; gap:11px; min-width:0`):

- **Avatar de iniciais:** `36×36px; border-radius:99px; flex:none; display:flex; align-items:center; justify-content:center; background:hsl(var(--primary)/0.16); color:primary-text; font-size:12px; font-weight:600`. Iniciais = 2 primeiras palavras do nome, maiúsculas (`initials()`).
- **Bloco de texto** (`min-width:0`):
  - Nome: `font-size:13.5px; font-weight:600; line-height:1.25; color:{nameColor}` (ver threshold §11); `white-space:nowrap; overflow:hidden; text-overflow:ellipsis`.
  - Telefone: `font-size:11.5px; color:muted-foreground; line-height:1.25; font-variant-numeric:tabular-nums` (formato `(11) 9xxxx-xxxx`).

**Coluna 2 — E-mail:** `font-size:12.5px; color:muted-foreground; white-space:nowrap; overflow:hidden; text-overflow:ellipsis`.

**Coluna 3 — 1ª visita:** `font-size:12.5px; color:foreground; font-variant-numeric:tabular-nums` (formato `dd/mm/aaaa`).

**Coluna 4 — Última visita:** `font-size:12.5px; color:{lastColor}; font-variant-numeric:tabular-nums`. `lastColor` segue o mesmo threshold do nome (inativo → muted).

**Coluna 5 — Agend.** (contador de agendamentos, `display:flex; justify-content:center`):

- Pill: `min-width:26px; text-align:center; padding:2px 9px; border-radius:99px; font-size:12px; font-weight:600; font-variant-numeric:tabular-nums; background:{countBg}; color:{countColor}`.
- **Cor por threshold:** `count > 0` → `background:hsl(var(--primary)/0.14); color:primary-text`; `count === 0` → `background:hsl(var(--muted)); color:muted-foreground`.

**Coluna 6 — Tags** (`display:flex; align-items:center; gap:6px; flex-wrap:wrap`): 1–2 pills por paciente, estilizadas por tipo (§6).

---

## 6. Sistema de tags (5 tipos)

Base comum de toda pill de tag (`tagStyle`):

```
display:inline-flex; align-items:center; gap:5px;
font-size:11px; font-weight:600; line-height:1;
padding:4px 9px; border-radius:99px; white-space:nowrap;
```

Variações por tipo:
| `kind` | Rótulo típico | `background` | `color` | borda |
|---|---|---|---|---|
| `vip` | VIP | `hsl(var(--primary)/0.16)` | `primary-text` | — |
| `plano` | Plano mensal | `transparent` | `primary-text` | `1px solid hsl(var(--primary)/0.45)` |
| `recorrente` | Recorrente | `hsl(var(--ok-bg))` | `hsl(var(--ok))` | — |
| `danger` | Inadimplente | `hsl(var(--destructive)/0.12)` | `hsl(var(--destructive))` | — |
| `muted` | Inativo | `hsl(var(--muted))` | `muted-foreground` | — |

> Fallback: qualquer `kind` desconhecido cai no estilo `muted`. As tags são **presentacionais** (não interativas) no protótipo.

---

## 7. Rodapé / paginação

Barra dentro do card, abaixo das linhas: `display:flex; align-items:center; justify-content:space-between; gap:12px; padding:11px 20px; border-top:1px solid hsl(var(--border)); background:hsl(var(--muted)/0.4)`.

- **Esquerda — rótulo de intervalo** (`pageLabel`): `font-size:12px; color:muted-foreground; font-variant-numeric:tabular-nums`. Texto = `"Mostrando 1–{rows.length} de {filtered.length}"`. Como o protótipo não pagina de fato, `rows.length === filtered.length` (ex.: "Mostrando 1–8 de 8" na aba Ativos).
- **Direita — controles** (`display:flex; align-items:center; gap:7px`):
  - **Anterior** (desabilitado): `32×32px; border-radius:8px; border:1px solid border; background:card; color:hsl(var(--muted-foreground)/0.5); cursor:not-allowed`. Ícone `chevron-left` `15×15px`.
  - **Próximo:** `32×32px; border-radius:8px; border:1px solid border; background:card; color:foreground; cursor:pointer`; hover `background:accent`. Ícone `chevron-right` `15×15px`.

> No real, ligar a paginação real (tamanho de página, offsets); o botão "Anterior" nasce desabilitado na 1ª página.
>
> **Observação:** o protótipo também calcula `totalLabel` (`"N paciente(s) cadastrado(s)"`), mas **não** o renderiza nesta tela — só `pageLabel` aparece. Ignore `totalLabel` ou use-o como legenda de total se desejar.

---

## 8. Estado vazio (composto)

Renderiza quando `isEmpty` (o filtro atual não retorna linhas). Mutuamente exclusivo com a tabela (§5).

Card: `background:hsl(var(--card)); border:1px dashed hsl(var(--border)); border-radius:13px; padding:46px 24px; display:flex; flex-direction:column; align-items:center; text-align:center; gap:11px`.

- **Ícone tile:** `40×40px; border-radius:11px; background:hsl(var(--muted)); color:muted-foreground; flex center`. Ícone interno **users** `20×20px`.
- **Título:** "Nenhum paciente neste filtro" — `font-size:14px; font-weight:600`.
- **Texto de apoio:** "Ajuste a busca ou cadastre um novo paciente para começar a montar a base da clínica." — `font-size:12.5px; color:muted-foreground; margin-top:-4px; max-width:330px`.
- **Ação (ghost):** botão "Ver todos" — `margin-top:6px; height:36px; padding:0 16px; border-radius:9px; border:1px solid hsl(var(--input)); background:hsl(var(--background)); color:foreground; font-size:clamp(13px, 0.14vw + 11.2px, 14.3px); font-weight:600`; hover `background:accent`. Clique → `goAll` (`setState({tab:'todos'})`).

> Empty state **composto** (ícone + título + texto + ação), conforme regra do `design.md`. Com os dados de exemplo as três abas sempre têm registros; este estado só dispara quando um filtro/busca real esvazia o resultado.

---

## 9. Galeria de estados (referência dos 4 estados)

> O protótipo desta tela **não** traz uma galeria dedicada, mas **os 4 estados são obrigatórios** para a superfície de dados (tabela). Especifique-os assim, reaproveitando os primitivos do dashboard (§13 do `dashboard-handoff.md`):

- **Carregado:** tabela normal (§5) com linhas.
- **Skeleton (nunca spinner):** repita ~6 linhas de placeholder mantendo o grid de 6 colunas. Cada célula = bloco com `border-radius` + **shimmer** `linear-gradient(90deg, hsl(var(--muted)) 25%, hsl(var(--accent)) 37%, hsl(var(--muted)) 63%); background-size:220% 100%; animation:sennoShimmer 1.5s ease-in-out infinite`. Sugestão de blocos por linha: avatar `36×36` circular; nome `13×60%`; telefone `11×40%`; e-mail `12×70%`; datas `12×64`; pill agend. `18×26`; 1–2 pills de tag `18×56`.
- **Vazio (composto):** exatamente o §8 (dashed + ícone users + título + texto + "Ver todos").
- **Erro (inline — nunca `alert()`):** dentro do card, caixa `background:hsl(var(--destructive)/0.1); border:1px solid hsl(var(--destructive)/0.3); border-radius:10px; padding:13px`, ícone `alert` `18px`, título "Erro ao carregar pacientes" `destructive/600`, sub "Verifique a conexão e tente novamente." `12px muted` + botão "Recarregar" (`30px; border:1px solid hsl(var(--destructive)/0.4); color:destructive; background:transparent`).

---

## 10. Catálogo de animações

### Keyframes (no `<style>`)

| Nome              | Definição                                                                | Uso                                                                                       |
| ----------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `senno-bell-ring` | rotação amortecida: `0→11deg→-9→6→-4→2→0`                                | shake do sino ao clicar (`.7s cubic-bezier(.36,.07,.19,.97)`, removida no `animationend`) |
| `sennoShimmer`    | `0% { background-position:-180% 0 } 100% { background-position:180% 0 }` | skeletons da tabela (§9) — herdado do chrome                                              |

### Transições

| Elemento                         | Propriedade / timing                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| **Indicador de aba (underline)** | `transform .32s cubic-bezier(.34,1.1,.5,1)`, `width .32s` (mesmo easing), `opacity .2s` |
| Texto da aba (troca de cor)      | herda; sem transição explícita — cor recalculada por estado                             |
| Busca (expand/collapse)          | `width .34s cubic-bezier(.4,0,.2,1)`, bg/border/shadow `.22s`                           |
| Toggle de tema (sol↔lua)         | `transform .5s cubic-bezier(.34,1.3,.5,1)`, `opacity .35s`                              |
| Sino (shake)                     | `senno-bell-ring .7s cubic-bezier(.36,.07,.19,.97)`                                     |
| Linha da tabela (hover)          | `background` → `hsl(var(--accent)/0.5)`                                                 |
| Botão primário (hover)           | `filter:brightness(1.05)`                                                               |
| Botões de ícone (hover)          | `background` → `hsl(var(--accent))`                                                     |

> Tom **operacional/premium**: transições curtas, leve overshoot no underline. Nada de animação longa ou chamativa.

---

## 11. Thresholds & lógica condicional (resumo)

| Onde                   | Regra                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| Filtro de aba          | `todos` = tudo · `ativos` = `status==='ativo'` · `inativos` = `status==='inativo'`                          |
| Contadores das abas    | `todos = data.length` · `ativos = nº ativos` · `inativos = nº inativos` (recalculados da base)              |
| Badge da aba           | ativa → `bg:primary/0.16` + `color:primary-text`; inativa → `bg:muted` + `muted-foreground`                 |
| Indicador underline    | mede a aba `[data-tab-active="1"]` (`offsetLeft`/`offsetWidth`); `opacity=1` só após 1ª medição (senão `0`) |
| Nome do paciente (cor) | `status==='inativo'` → `muted-foreground`; senão `foreground`                                               |
| Última visita (cor)    | idem: inativo → `muted-foreground`; ativo → `foreground`                                                    |
| Pill "Agend." (cor)    | `count > 0` → `bg:primary/0.14` + `primary-text`; `count === 0` → `bg:muted` + `muted-foreground`           |
| Tag por `kind`         | vip/plano/recorrente/danger/muted → estilo da §6; `kind` desconhecido → `muted`                             |
| Iniciais do avatar     | 2 primeiras palavras do nome, 1ª letra de cada, maiúsculas                                                  |
| Tabela × Vazio         | `rows.length > 0` mostra tabela; `=== 0` mostra empty state (excludentes)                                   |
| `pageLabel`            | `"Mostrando 1–{rows.length} de {filtered.length}"` (sem paginação real no protótipo)                        |
| Botão "Anterior"       | sempre desabilitado (1ª página)                                                                             |
| Dot do sino            | aparece se `unreadCount > 0`                                                                                |
| Notificação — linha    | lida `bg:transparent` / não-lida `bg:primary/0.05`, título 500/600, dot se não-lida                         |

---

## 12. Dados de exemplo (fonte da verdade)

Base de **10 pacientes** (`data`), campos `{ name, phone, email, first, last, count, status, tags }`. `first`/`last` no formato `dd/mm/aaaa`; `count` = nº de agendamentos; `status` ∈ `ativo|inativo`; `tags` = lista de `[rótulo, kind]`.

| Nome           | Telefone        | E-mail                     | 1ª visita  | Última visita | Agend. | Status  | Tags                   |
| -------------- | --------------- | -------------------------- | ---------- | ------------- | ------ | ------- | ---------------------- |
| Mariana Costa  | (11) 98876-1240 | mariana.costa@gmail.com    | 12/03/2025 | 18/06/2026    | 7      | ativo   | VIP · Plano mensal     |
| Sofia Andrade  | (11) 99431-7782 | sofia.andrade@outlook.com  | 04/08/2024 | 21/06/2026    | 9      | ativo   | VIP · Recorrente       |
| Bruno Almeida  | (11) 97720-5519 | bruno.almeida@gmail.com    | 27/01/2026 | 19/06/2026    | 3      | ativo   | Recorrente             |
| Patrícia Nunes | (11) 99102-3344 | patricia.nunes@gmail.com   | 19/11/2024 | 10/06/2026    | 5      | ativo   | VIP · Plano mensal     |
| Letícia Moraes | (11) 98045-9911 | leticia.moraes@gmail.com   | 06/02/2025 | 14/06/2026    | 6      | ativo   | Recorrente             |
| Camila Ribeiro | (11) 99655-2078 | camila.ribeiro@hotmail.com | 15/05/2025 | 09/06/2026    | 2      | ativo   | Plano mensal           |
| Beatriz Lima   | (11) 98290-6633 | beatriz.lima@gmail.com     | 30/09/2024 | 02/06/2026    | 4      | ativo   | Recorrente             |
| Rafael Souza   | (11) 99877-1002 | rafael.souza@gmail.com     | 22/06/2026 | 22/06/2026    | 1      | ativo   | VIP                    |
| Helena Martins | (11) 98112-4567 | helena.martins@gmail.com   | 08/04/2024 | 12/10/2025    | 8      | inativo | Inadimplente · Inativo |
| Diego Fonseca  | (11) 99540-8821 | diego.fonseca@gmail.com    | 17/07/2024 | 03/11/2025    | 2      | inativo | Inativo                |

- **Contadores das abas:** Todos **10** · Ativos **8** · Inativos **2**.
- Os dois inativos (Helena, Diego) aparecem com nome/última-visita em `muted-foreground`; Helena carrega a tag `danger` (Inadimplente).

### Notificações da topbar (5 — idênticas ao dashboard)

```
1 lead    "Novo lead"                — Mariana Alves · Instagram            — agora  — não-lida
2 money   "Pagamento confirmado"     — R$ 1.200 · Botox · Camila Souza      — 8 min  — não-lida
3 agenda  "Agendamento confirmado"   — Patrícia Lima · amanhã às 14h        — 40 min — não-lida
4 alert   "Tarefa atrasada"          — Retornar ligação · Rafael Dias       — 1 h    — lida
5 agenda  "Novo agendamento online"  — Beatriz Ramos · Limpeza de pele      — 3 h    — lida
```

---

## 13. Props do componente & integração com o App

**Props da tela Pacientes** (`data-props`, `$preview` 1440×860):

- `defaultTheme`: enum `light | dark` (default `light`).

**Callbacks/props que o App injeta** (integração real):

- `theme` (controlado externamente) — a tela usa `this.props.theme ?? this.state.theme`.
- `onToggleTheme()` — botão de tema (fallback: alterna estado local).
- `onNavigate(labelDaRota)` — nav da sidebar (`Pacientes` é o ativo).
- `onNewLead()` — botão "Novo lead" da topbar.

**Estado interno do protótipo:**

- `theme` — tema local (quando não controlado).
- `tab` — aba ativa (`todos|ativos|inativos`, default `todos`).
- `notifs` — 5 notificações; `notifOpen`, `bellRing` — controle do popover/shake do sino.
- `indLeft` / `indWidth` — geometria medida do indicador de aba.

**Ações locais expostas:**

- `setState({tab})` por clique de aba; `goAll` (empty state → aba Todos).
- `toggleTheme`, `toggleNotif`, `closeNotif`, `markAllRead`, ações por item de notificação.
- Botão "Novo paciente" (§4.3) e Filtros (§4.2): **sem handler** no protótipo — ligar no real (`onNewPatient()` e painel de filtros).

---

## 14. Ordem de build sugerida + checklist

**Ordem:**

1. Tokens no `globals.css` + Inter + `tabular-nums` (ver `design.md`).
2. **Chrome** (sidebar 236px + topbar) — idêntico a todas as telas; reutilizar do dashboard.
3. Primitivos reutilizados: card, botão primário/ghost, botão de ícone, **abas underline medidas**, pill de tag, pill de contador, popover de notificações, empty state composto, skeleton shimmer, erro inline.
4. Barra de abas + ações → tabela (cabeçalho + linhas + tags + agend.) → rodapé/paginação → empty state.
5. Ligar callbacks (`onNavigate`, `onToggleTheme`, `onNewLead`, `onNewPatient`) e a filtragem real (abas + busca + filtros).
6. Rodar o checklist do `design.md` §9 na tela.

**Checklist específico de Pacientes:**

- [ ] Só tokens semânticos; conferir dark mode em **todas** as superfícies (tabela, header do grid, pills, empty).
- [ ] Dois dourados nos papéis certos: avatar/logo/botões = `primary` superfície; nome-ativo-nav/`primary-text` em tags VIP/Plano, contadores, links.
- [ ] `tabular-nums` em: telefone, datas de visita, pill de agendamentos, contadores das abas, `pageLabel`, contador do sino.
- [ ] Abas: underline 2px dourado **medido** que corta no fim da última aba; badge da aba ativa dourado, inativas neutras.
- [ ] Contadores das abas batem com a base (10 / 8 / 2).
- [ ] Linhas de inativos com nome + última visita em `muted-foreground`.
- [ ] Pill "Agend." dourada quando `count > 0`, neutra quando `0`.
- [ ] Tags nos 5 tipos com as cores/borda corretas (Plano = contorno; VIP = preenchida clara; Recorrente = ok; Inadimplente = destructive; Inativo = muted).
- [ ] Botão de ação **dentro do conteúdo** ("Novo paciente" na barra de abas), não no header.
- [ ] Empty state composto (ícone users + título + texto + "Ver todos") com dashed border.
- [ ] 4 estados da tabela (carregado/skeleton/vazio/erro) — nunca `alert()`.
- [ ] Sino: dot se não-lidas, shake no clique, "Marcar todas como lidas", linhas tintadas.
- [ ] Toggle de tema: sol no claro / lua no escuro, swap com rotação+fade.
- [ ] hover/active/focus em tudo interativo; anel de foco `ring` na busca.
- [ ] Paginação: "Anterior" desabilitado na 1ª página; `pageLabel` com tabular-nums.
