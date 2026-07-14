# Notificações — Handoff detalhado (item a item)

> Especificação granular da tela **Notificações** (`Notificações.dc.html`).
> Objetivo: reconstruir **cada elemento visual, medida, threshold e animação** no stack real
> (Next 16 + Tailwind v3 + shadcn/ui), ícones `lucide-react`, sem improviso. **Nada aqui é opcional.**
>
> **Como usar este doc**
>
> 1. Leia `design.md` primeiro (tokens, regras de cor, tipografia, chrome). Este arquivo **não repete** os tokens — assume que já estão no `globals.css`.
> 2. Toda cor é token semântico via `hsl(var(--token))`. Onde aparece `primary/0.16`, leia `hsl(var(--primary) / 0.16)`.
> 3. Todo número (px, %, peso, threshold) é **literal do protótipo** — reproduza exatamente. Onde houver `clamp(...)`, é responsivo; mantenha a fórmula.
> 4. O `.dc.html` usa um runtime de protótipo próprio — **não copie a sintaxe de template**. Recrie em React/TSX com as libs do codebase. Ícones → `lucide-react`.
>
> **⚠️ Esta é a nossa tela mais "meta":** o **sino da topbar tem seu próprio popover de notificações**, com um **dataset diferente** do corpo da página. São **duas fontes de dados distintas** (§13). Não misture.
>
> **⚠️ Sobre as abas:** as abas do corpo são **filtros por categoria/estado** — `Todas · Não lidas · Leads · Agenda · Financeiro · Tarefas`. **Não** são `Hoje/Semana/…`. `Hoje`, `Esta semana` e `Anteriores` são **cabeçalhos de grupo dentro da lista** (§6), não abas. Cada aba é documentada como uma tela individual em §5.
>
> **Legenda de tokens usados abaixo (do `design.md`):**
> `--card` superfície · `--background` fundo app · `--foreground` texto · `--muted`/`--muted-foreground` neutro · `--border` bordas · `--accent` hover · `--primary` dourado-superfície · `--primary-foreground` texto escuro sobre dourado · `--primary-text` dourado-texto · `--ring` foco · `--destructive` erro/não-lido · `--ok`/`--ok-bg` sucesso · `--shadow`/`--shadow-a` sombra tingida.

---

## 0. Índice

1. Estrutura geral da página (esqueleto + medidas de layout)
2. Sidebar (236px) — item a item (com badge de não-lidas)
3. Topbar (header) — título + busca + tema + **sino com popover** + Novo lead
4. Barra de abas + ação ("Marcar todas como lidas")
5. **As 6 abas como telas individuais** (Todas · Não lidas · Leads · Agenda · Financeiro · Tarefas)
6. Cabeçalhos de grupo (Hoje / Esta semana / Anteriores)
7. Card de grupo + **linha de notificação** (anatomia item a item)
8. Categorias & tints (tabela)
9. Botão de alternância — marcar lida / **dispensar** (+ mecânica de saída)
10. Empty states (por aba)
11. Catálogo de animações (keyframes + transições)
12. Thresholds & lógica condicional (tabela única)
13. **Dois datasets** — sino da topbar vs. corpo (dados de exemplo, fonte da verdade)
14. Props do componente e integração com o App
15. Checklist específico da tela

---

## 1. Estrutura geral da página

### Container raiz

- Elemento `.senno` com `data-theme` (`light|dark`) e `data-font` (`inter`).
- `background: hsl(var(--background))`, `color: hsl(var(--foreground))`, `height: 100vh`, `box-sizing:border-box`, `overflow: hidden`, `line-height: 1.45`, `font-family: Inter`, `-webkit-font-smoothing: antialiased`.
- Reset global: `*{box-sizing:border-box}`, `body{margin:0}`.

### Moldura da app (shell full-bleed)

`data-screen-label="Notificações"` — `width:100%; height:100%; min-height:0; display:flex; overflow:hidden; background:hsl(var(--background))`.

Layout em duas colunas via flex (idêntico às demais telas):

```
[ SIDEBAR 236px fixa ] [ MAIN flex:1 -> (TOPBAR fixo) + (BODY rolável) ]
```

- **MAIN**: `flex:1; min-width:0; min-height:0; display:flex; flex-direction:column`.
- **BODY rolável**: `flex:1; min-height:0; overflow-y:auto; padding:18px 24px; display:flex; flex-direction:column; gap:16px`. **Só o body rola** — sidebar e topbar ficam fixos.

### Ordem vertical do body (gap 16px entre blocos)

1. **Barra de abas + ação** (abas à esquerda, "Marcar todas como lidas" à direita) — §4.
2. **Lista agrupada** de notificações (renderiza quando `hasItems`) — §6/§7.
3. **Empty state** (renderiza quando `isEmpty`, mutuamente exclusivo com a lista) — §10.

### Breakpoints responsivos (media queries globais)

Presentes no `<style>` por consistência com as outras telas, embora esta tela seja de coluna única:

- `@media (max-width:1024px)`: `.senno-2col{grid-template-columns:1fr}` · `.senno-3col{grid-template-columns:1fr 1fr}`.
- `@media (max-width:660px)`: `.senno-3col{grid-template-columns:1fr}`.

---

## 2. Sidebar — 236px

`aside`: `width:236px; flex:none; background:hsl(var(--card)); border-right:1px solid hsl(var(--border)); display:flex; flex-direction:column; padding:18px 14px`.

### 2.1 Bloco de marca (topo)

- Wrapper: `display:flex; align-items:center; gap:10px; padding:6px 8px 18px`.
- **Logo**: `34×34px`, `border-radius:9px`, `background:hsl(var(--primary))`, flex center. Glifo **"B"** — `color:hsl(var(--primary-foreground))`, `font-weight:700`, `font-size:17px`.
- **Textos** (min-width:0, truncam):
  - "Clínica Bellavie" — `14px / 600`, `color:foreground`, `white-space:nowrap; overflow:hidden; text-overflow:ellipsis`.
  - "Plano Premium" — `11px`, `color:muted-foreground`.

### 2.2 Navegação

`nav`: `display:flex; flex-direction:column; gap:2px`.

Cada item = `<a href="#">` (no real: `<Link>`):

- `position:relative; display:flex; align-items:center; gap:11px; padding:8px 10px; border-radius:8px; font-size:13.5px; text-decoration:none`.
- Ícone: `18×18px; flex:none`.
- Label: `flex:1; white-space:nowrap`.
- **Hover** (qualquer item): `background:hsl(var(--accent))`.

Estados por item:
| Estado | `font-weight` | texto/ícone (`color`) | `background` |
|---|---|---|---|
| Inativo | 500 | `hsl(var(--muted-foreground))` | `transparent` |
| **Ativo** (Notificações) | 600 | `hsl(var(--primary-text))` | `hsl(var(--accent))` |

- **⚠️ Badge de não-lidas (específico desta tela):** o item **Notificações está ativo** e traz um badge com a contagem de não-lidas. Renderiza **só quando `active && unreadCount > 0`** (`showBadge`). Pill: `min-width:18px; text-align:center; font-size:10.5px; font-weight:600; font-variant-numeric:tabular-nums; padding:1px 6px; border-radius:99px; background:hsl(var(--primary)); color:hsl(var(--primary-foreground))`. No estado inicial, `unreadCount = 3` → badge "3".
  - Observação: este badge usa **superfície dourada** (`bg-primary` + `primary-foreground` escuro), diferente do badge translúcido `primary/0.16` usado em abas/contadores. É intencional: é o único indicador de contagem "forte" da nav.

**Ordem fixa da nav (12 itens, menu plano, sem seções):**
`Dashboard` · `Atividades` · `Agenda` · `Funil` · `Pacientes` · `Financeiro` · `Metas` · `Insights` · `Procedimentos` · `Exportações` · **`Notificações` (ativo, badge 3)** · `Configurações`.

Ícones (set stroke-24, lucide no real): grid, activity, calendar, funnel, users, money(rect+circle), target, bulb, syringe, download, bell, settings. Clique chama `onNavigate(label)` (com `preventDefault`).

### 2.3 Rodapé (usuário)

- `margin-top:auto`. Card: `display:flex; align-items:center; gap:10px; padding:10px; border-radius:10px; background:hsl(var(--muted))`.
- Avatar "HC": `32×32px; border-radius:99px; background:hsl(var(--primary)/0.2); color:hsl(var(--primary-text)); font-size:12.5px; font-weight:600`.
- Nome "Dra. Helena Costa" `12.5px / 600` (trunca); cargo "Proprietária" `11px muted`.

---

## 3. Topbar (header)

`header`: `flex:none; display:flex; align-items:center; gap:16px; padding:14px 24px; border-bottom:1px solid hsl(var(--border)); background:hsl(var(--card))`.

- **Esquerda** (`flex:1; min-width:0`): `<h1>` "Notificações" — `font-size:clamp(22px, 0.5vw + 18px, 27px); font-weight:600; letter-spacing:-0.01em; margin:0`.
- **Direita**: `display:flex; align-items:center; gap:9px` — na ordem: **Busca → Tema → Sino → Novo lead**.

### 3.1 Busca "Buscar paciente…" (colapsável) — **decorativa nesta tela**

Visualmente idêntica à busca das outras telas (colapsa para ícone 38px, expande da direita para a esquerda até 240px no hover/`:focus-within`), **mas aqui não tem popover de resultados** — é só o campo. Reaproveite o componente de busca do chrome; nesta rota ele fica sem o painel de resultados (ou, no real, pode compartilhar o mesmo componente do Dashboard — a decisão de plugar resultados aqui fica a critério do produto).

- Wrapper `.senno-search`: `position:relative; width:38px; height:38px; flex:none`.
- Caixa `.senno-search-box`: colapsada `width:38px; height:38px`; `display:flex; align-items:center; gap:8px; padding:0 11px; border-radius:9px; border:1px solid hsl(var(--border)); background:hsl(var(--background)); color:hsl(var(--muted-foreground)); font-size:12.5px; overflow:hidden; white-space:nowrap; cursor:pointer`.
- **Transição:** `width .34s cubic-bezier(.4,0,.2,1), background .22s, border-color .22s, box-shadow .22s`.
- **Expandido** (`:hover` no wrapper **ou** `:focus-within`): `width:240px; border-color:hsl(var(--input)); cursor:text`.
- **Foco** (`:focus-within`): `border-color:hsl(var(--ring)); box-shadow:0 0 0 3px hsl(var(--ring)/0.18)`.
- Ícone lupa `15×15px; flex:none`. Input: `border:none; outline:none; background:transparent; font-size:12.5px; color:foreground`, placeholder "Buscar paciente…".

### 3.2 Toggle de tema (sol/lua)

- Botão `.senno-theme-btn`: `38×38px; border-radius:9px; border:1px solid border; background:background; color:foreground; position:relative; overflow:hidden`; hover `background:accent`. `title` = "Modo escuro"/"Modo claro".
- Dois ícones sobrepostos `.senno-theme-ico` (`position:absolute; top:50%; left:50%; width:17px; height:17px; margin:-8.5px 0 0 -8.5px`), `transition: transform .5s cubic-bezier(.34,1.3,.5,1), opacity .35s`.
- **Estados:**
  | | Light | Dark |
  |---|---|---|
  | Sol (`.senno-theme-sun`) | `rotate(0) scale(1)`, `opacity:1` | `rotate(90deg) scale(.35)`, `opacity:0` |
  | Lua (`.senno-theme-moon`) | `rotate(-90deg) scale(.35)`, `opacity:0` | `rotate(0) scale(1)`, `opacity:1` |
- Clique → `toggleTheme` (usa `onToggleTheme` do App, ou alterna `state.theme` localmente).

### 3.3 Sino de notificações + popover (`senno-notif`) — **funcional nesta tela**

> Este é o mesmo componente de sino do chrome global. **Atenção:** o popover exibe um **dataset próprio de 5 notificações** (`state.notifs`), que **não** é o mesmo `defs` de 11 itens do corpo da página (§13). Trate-os como duas fontes independentes; no real, ambos devem ler a mesma API — aqui estão separados por ser protótipo.

- Wrapper `position:relative`. Botão `38×38px; border-radius:9px; border:1px solid border; background:background; color:foreground; display:flex; align-items:center; justify-content:center; cursor:pointer`; hover `background:accent`; `title="Notificações"`.
- Ícone sino `.senno-bell-ico` `17×17px; transform-origin:top center`.
- **Dot de não-lidas** (se `topbarUnread`, i.e. há não-lidas no dataset do sino): `position:absolute; top:7px; right:8px; width:7px; height:7px; border-radius:99px; background:hsl(var(--destructive)); border:1.5px solid hsl(var(--card))`.
- **Shake ao clicar:** ao abrir/fechar (`toggleNotif`) aplica `state.bellRing=true` → classe `senno-bell-ring-a` → keyframes `senno-bell-ring .7s cubic-bezier(.36,.07,.19,.97)` (§11). A classe é removida no `onAnimationEnd` (`bellAnimEnd` → `bellRing=false`).

**Popover** (renderiza quando `notifOpen`):

- Overlay de fechar: `position:fixed; inset:0; z-index:40` (clique fora → `closeNotif`).
- Painel: `position:absolute; top:46px; right:0; width:362px; background:hsl(var(--popover)); border:1px solid hsl(var(--border)); border-radius:12px; box-shadow:0 16px 40px -12px hsl(var(--shadow)/calc(var(--shadow-a)*3.5)); z-index:50; overflow:hidden`.
- **Cabeçalho** (`padding:12px 14px 10px; display:flex; align-items:center; justify-content:space-between; gap:10px`):
  - Esquerda: "Notificações" (`clamp(13px,0.14vw+11.2px,14.3px)/600`) + **pill de contagem** de não-lidas (só se `topbarUnread`): `font-size:11px; font-weight:600; padding:1px 7px; border-radius:99px; background:hsl(var(--primary)/0.16); color:hsl(var(--primary-text)); tabular-nums` = `topbarUnreadCount`.
  - Direita (só se `topbarUnread`): botão-texto "Marcar todas como lidas" — `border:none; background:transparent; font-size:11.5px; font-weight:600; color:hsl(var(--primary-text)); cursor:pointer; padding:2px 4px`; hover `text-decoration:underline`. Ação `markAllRead` → todas do dataset do sino viram lidas.
- **Lista** (`display:flex; flex-direction:column; padding:0 6px 6px; max-height:344px; overflow-y:auto`):
  - **Item** (`<button>`): `display:flex; align-items:flex-start; gap:11px; width:100%; text-align:left; padding:10px 8px; border:none; border-radius:8px`; `background` = lida `transparent` / não-lida `hsl(var(--primary)/0.05)` (`rowBg`); hover `background:accent`.
    - Ícone tile: `32×32px; border-radius:99px; flex:none; display:flex; center`, cor por tipo (tabela abaixo). Ícone interno `15×15px`.
    - Centro (`flex:1; min-width:0`): título `12.5px`, `font-weight` = não-lida 600 / lida 500 (`titleWeight`); sub `11.5px muted` (nowrap, trunca).
    - Direita (`flex:none; flex-direction:column; align-items:flex-end; gap:5px`): hora `10.5px muted` (nowrap) + dot `7×7px; radius:99px; background:primary` se não-lida.
    - Clique no item → marca **aquele** como lido.
- **Rodapé** (`display:flex; center; padding:9px 14px; border-top:1px solid border; background:hsl(var(--muted)/0.4)`): link "Ver todas as notificações" (`12px/600 primary-text; text-decoration:none`).

**Tints por tipo (dataset do sino)** — `iconBg` / `iconColor`:
| tipo | ícone | fundo (`iconBg`) | cor (`iconColor`) |
|---|---|---|---|
| `lead` | users | `hsl(var(--primary)/0.16)` | `hsl(var(--primary-text))` |
| `money` | money (rect+circle) | `hsl(var(--ok-bg))` | `hsl(var(--ok))` |
| `agenda` | calendar | `hsl(var(--accent))` | `hsl(var(--muted-foreground))` |
| `alert` | alert (triângulo) | `hsl(var(--destructive)/0.14)` | `hsl(var(--destructive))` |

> Fallback: tipo desconhecido usa o tint de `agenda` e o ícone de sino.

### 3.4 Botão "Novo lead"

- `height:38px; padding:0 15px; border-radius:9px; border:none; background:hsl(var(--primary)); color:hsl(var(--primary-foreground)); font-size:clamp(13px,0.14vw+11.2px,14.3px); font-weight:600; display:flex; align-items:center; gap:7px`; hover `filter:brightness(1.05)`.
- Ícone `+` `15×15px`. Clique → `onNewLead`.

---

## 4. Barra de abas + ação

Wrapper: `display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap` — abas à esquerda, ação à direita.

### 4.1 Barra de abas (underline medido)

- Trilho (`ref=setTabBar`): `position:relative; display:flex; align-items:center; gap:2px; border-bottom:1px solid hsl(var(--border)); flex-wrap:wrap`.
- **Indicador deslizante (2px dourado):** `position:absolute; left:0; bottom:-1px; height:2px; border-radius:2px; background:hsl(var(--primary)); width:{indWidth}; transform:translateX({indLeft}); opacity:{indOpacity}; pointer-events:none`. Transição `transform .32s cubic-bezier(.34,1.1,.5,1), width .32s cubic-bezier(.34,1.1,.5,1), opacity .2s`.
  - **Medição:** em `componentDidMount` / `componentDidUpdate`, mede o `<button>` com `data-tab-active="1"` (`offsetLeft` → `indLeft`, `offsetWidth` → `indWidth`); remede após `document.fonts.ready`. `indOpacity` = 1 quando há largura medida, senão 0. **A linha do indicador corta no fim da aba ativa — não atravessa a barra toda.**
- **Cada aba** (`<button>`): `position:relative; display:inline-flex; align-items:center; gap:7px; border:none; background:transparent; cursor:pointer; font-size:13.5px; font-weight:600; padding:9px 12px; margin-bottom:-1px; border-bottom:2px solid transparent`. Cor: ativa `hsl(var(--foreground))` / inativa `hsl(var(--muted-foreground))`.
  - **Badge de contagem** (só quando `showCount`): `font-size:10.5px; font-weight:600; font-variant-numeric:tabular-nums; min-width:18px; text-align:center; padding:1px 6px; border-radius:99px; background:{badgeBg}; color:{badgeColor}`.
- Clique → `setState({tab:k})`.

**As 6 abas (ordem fixa, `k` = chave interna):**
| # | Rótulo | `k` | Mostra contador? | Contador |
|---|---|---|---|---|
| 1 | Todas | `todas` | **sim** | `live.length` = **11** |
| 2 | Não lidas | `nao-lidas` | **sim** | `unreadCount` = **3** |
| 3 | Leads | `leads` | não | — |
| 4 | Agenda | `agenda` | não | — |
| 5 | Financeiro | `financeiro` | não | — |
| 6 | Tarefas | `tarefas` | não | — |

**Cores do badge** (por aba, `badgeBg`/`badgeColor`):

- Aba **Não lidas** com `count > 0` → `background:hsl(var(--primary)/0.16)`, `color:hsl(var(--primary-text))` (sempre destacada, mesmo inativa).
- Qualquer aba **ativa** (que mostra contador) → `background:hsl(var(--primary)/0.16)`, `color:hsl(var(--primary-text))`.
- Aba **inativa** (que mostra contador) → `background:hsl(var(--muted))`, `color:hsl(var(--muted-foreground))`.

> Aba padrão selecionada = **Todas** (`state.tab = 'todas'`).

### 4.2 Ação "Marcar todas como lidas"

- Alinhada à direita da barra de abas (dentro do conteúdo, **não** no header — padrão do design system).
- Base: `display:inline-flex; align-items:center; gap:7px; height:36px; padding:0 14px; border-radius:9px; font-size:12.5px; font-weight:600; border:1px solid hsl(var(--border)); background:hsl(var(--background))`. Ícone check-check `15×15px` + texto.
- **Habilitado** (`!noUnread`): `color:hsl(var(--foreground)); cursor:pointer`; hover `background:hsl(var(--accent))`.
- **Desabilitado** (`noUnread`, i.e. `unreadCount === 0`): `color:hsl(var(--muted-foreground)/0.6); cursor:default`; sem hover; `disabled`.
- Ação `markAll`: marca **todas as não-lidas vivas** (`live`, exclui removidas) como lidas — grava `state.read[id]=true` para cada não-lida. É **global** (independe da aba ativa).

---

## 5. As 6 abas como telas individuais

> Cada aba é um filtro sobre `defs` (11 itens, §13). Após o filtro por aba, os itens são reagrupados em **Hoje / Esta semana / Anteriores** (§6). Grupos vazios são omitidos. Abaixo, o conteúdo exato de cada aba no **estado inicial** (sem interação; `read`/`removed` vazios ⇒ só n1, n2, n3 estão não-lidas).
>
> **Regra de filtragem** (`renderVals`):
>
> - `nao-lidas` → `defs.filter(!isRead && !removida)`.
> - `todas` → todos os 11 (`defs.slice()`).
> - qualquer outra → `defs.filter(n.cat === tab)`.
>
> `isRead(n) = !n.unread || state.read[n.id]`. `isGone(n) = state.removed[n.id]`.

### 5.1 Aba "Todas" (`todas`) — padrão

Contador **11**. Mostra os 11 itens em 3 grupos:

- **Hoje** (5): n1 Novo lead · n2 Tarefa atrasada · n3 Pagamento recebido · n4 Agendamento confirmado · n5 Agendamento cancelado. Meta do grupo: "3 não lidas".
- **Esta semana** (4): n6 Meta de faturamento atingida · n7 Lead avançou no funil · n8 5 aniversariantes esta semana · n9 Conta a receber vencendo. Meta: "Tudo lido".
- **Anteriores** (2): n10 Resumo semanal da agenda · n11 Nova avaliação recebida. Meta: "Tudo lido".

### 5.2 Aba "Não lidas" (`nao-lidas`)

Contador **3**. Só itens não-lidos e não-removidos. No estado inicial: n1, n2, n3 — **todos no grupo Hoje** (meta "3 não lidas"). Grupos "Esta semana"/"Anteriores" ficam vazios ⇒ omitidos.

- **Comportamento dinâmico:** ao marcar um item como lido em qualquer aba, ele **some** desta aba (o filtro reavalia `isRead`). Quando chega a zero, exibe o **empty state "Você está em dia"** (§10) com botão "Ver todas".

### 5.3 Aba "Leads" (`leads`)

Sem contador na aba. Itens com `cat==='leads'`: **n1** (Hoje, não-lida) e **n7** (Esta semana, lida).

- **Hoje** (1): n1 "Novo lead: Rafael Souza" — meta "1 não lida".
- **Esta semana** (1): n7 "Lead avançou no funil" — meta "Tudo lido".

### 5.4 Aba "Agenda" (`agenda`)

Sem contador. Itens com `cat==='agenda'`: **n4, n5** (Hoje, lidas) e **n10** (Anteriores, lida).

- **Hoje** (2): n4 "Agendamento confirmado" · n5 "Agendamento cancelado" — meta "Tudo lido".
- **Anteriores** (1): n10 "Resumo semanal da agenda" — meta "Tudo lido".

### 5.5 Aba "Financeiro" (`financeiro`)

Sem contador. Itens com `cat==='financeiro'`: **n3** (Hoje, não-lida) e **n9** (Esta semana, lida).

- **Hoje** (1): n3 "Pagamento recebido" — meta "1 não lida".
- **Esta semana** (1): n9 "Conta a receber vencendo" — meta "Tudo lido".

### 5.6 Aba "Tarefas" (`tarefas`)

Sem contador. Itens com `cat==='tarefas'`: **n2** (Hoje, não-lida) — único item.

- **Hoje** (1): n2 "Tarefa atrasada" — meta "1 não lida".

> **Nota sobre categorias sem aba:** `metas` (n6) e `pacientes` (n8, n11) **não têm aba dedicada** — só aparecem em "Todas". As 6 abas cobrem `todas`, `nao-lidas`, `leads`, `agenda`, `financeiro`, `tarefas`.

---

## 6. Cabeçalhos de grupo (Hoje / Esta semana / Anteriores)

Dentro de cada aba, os itens filtrados são particionados em 3 grupos fixos (nesta ordem): `hoje` → **"Hoje"**, `semana` → **"Esta semana"**, `antes` → **"Anteriores"**. Grupos sem itens são **omitidos** do DOM final (`.filter(g=>g.items.length>0)`).

Container externo da lista: `display:flex; flex-direction:column`. Cada grupo é um bloco `display:flex; flex-direction:column; gap:9px; margin-bottom:18px` (classe `senno-notif-group`).

**Cabeçalho do grupo** (`display:flex; align-items:center; gap:10px; padding:0 2px`):

- **Rótulo:** `font-size:11.5px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:muted-foreground` = "Hoje" / "Esta semana" / "Anteriores".
- **Linha divisória** (flex-grow): `flex:1; height:1px; background:hsl(var(--border))`.
- **Meta (à direita):** `font-size:11.5px; font-weight:500; font-variant-numeric:tabular-nums; color:muted-foreground`. Regra de texto:
  - com não-lidas visíveis no grupo → `"{u} não lida"` (singular, `u===1`) ou `"{u} não lidas"` (plural).
  - sem não-lidas → **"Tudo lido"**.
  - a meta considera apenas itens **visíveis** (não-removidos) do grupo.

> **Colapso de grupo (dismiss):** quando todos os itens visíveis de um grupo saem (dispensados), o grupo ganha a classe `senno-notif-group-empty` (`max-height:0; opacity:0; margin-bottom:0; overflow:hidden; pointer-events:none`) com transição, animando o fechamento antes de sumir — ver §11.

---

## 7. Card de grupo + linha de notificação

**Card do grupo** (envolve as linhas): `background:hsl(var(--card)); border:1px solid hsl(var(--border)); border-radius:13px; box-shadow:0 1px 2px hsl(var(--shadow)/var(--shadow-a)); overflow:hidden`.

### 7.1 Anatomia da linha (`senno-notif-row`)

`position:relative; display:flex; align-items:flex-start; gap:13px; padding:14px 18px; border-top:1px solid hsl(var(--border)); background:{rowBg}`. Hover: `background:hsl(var(--accent)/0.5)`.

- **`border-top`** em toda linha: como o card tem `overflow:hidden`, a 1ª linha encosta na borda do card e as divisórias internas ficam entre linhas (efeito de lista dividida). _(Se preferir, no real use `divide-y` do Tailwind — o resultado visual é o mesmo.)_
- **`rowBg`:** lida `transparent` / não-lida `hsl(var(--primary)/0.05)`.

Da esquerda para a direita:

**(a) Ícone tile** — `width:38px; height:38px; border-radius:10px; flex:none; display:flex; center; background:{tintBg}; color:{tintColor}` (cor por categoria, §8). Ícone interno `18×18px`.

**(b) Bloco central** — `flex:1; min-width:0; padding-top:1px`:

- **Linha de título:** `display:flex; align-items:center; gap:8px`.
  - Título: `font-size:13.5px; font-weight:{titleWeight}; color:foreground; overflow:hidden; text-overflow:ellipsis; white-space:nowrap`. `titleWeight` = lida 500 / não-lida 600.
  - **Dot de não-lida** (se `unread`): `width:7px; height:7px; flex:none; border-radius:99px; background:hsl(var(--primary))`.
- **Descrição:** `font-size:12.5px; color:muted-foreground; margin-top:3px; line-height:1.45`. Texto completo (não trunca).
- **Botão de ação** (só se o item tem `action`): `margin-top:9px; display:inline-flex; align-items:center; gap:6px; height:30px; padding:0 12px; border-radius:8px; border:1px solid hsl(var(--border)); background:hsl(var(--background)); color:foreground; font-size:12px; font-weight:600; cursor:pointer`. Hover: `border-color:hsl(var(--primary)/0.5); color:hsl(var(--primary-text))`. Conteúdo: rótulo da ação + ícone seta (`icoArrow`, `13×13px`). Ação → `onAction` (no protótipo é no-op; no real, deep-link para a rota correspondente).

**(c) Bloco direito** — `display:flex; flex-direction:column; align-items:flex-end; gap:8px; flex:none`:

- **Carimbo de tempo (`when`):** `font-size:11.5px; font-weight:500; color:muted-foreground; white-space:nowrap; font-variant-numeric:tabular-nums`.
- **Botão de alternância** (marcar lida / dispensar) — detalhado em §9.

### 7.2 Rótulos de ação por item

| item | tem ação? | rótulo (`action`) |
| ---- | --------- | ----------------- |
| n1   | sim       | Ver no funil      |
| n2   | sim       | Abrir atividade   |
| n3   | sim       | Ver recibo        |
| n4   | sim       | Ver na agenda     |
| n5   | sim       | Reagendar         |
| n6   | sim       | Ver metas         |
| n7   | sim       | Ver no funil      |
| n8   | sim       | Ver pacientes     |
| n9   | sim       | Ver financeiro    |
| n10  | **não**   | —                 |
| n11  | **não**   | —                 |

---

## 8. Categorias & tints (corpo da página)

Cada notificação do corpo pertence a uma **categoria** (`cat`), que define ícone + tint do tile (`tintBg`/`tintColor`). **⚠️ Estas cores são diferentes das tints do sino (§3.3)** — o corpo usa uma paleta por categoria mais ampla, incluindo **valores HSL fixos** para agenda/pacientes (série de dados, não tokens — mantenha os literais).

| `cat`        | Rótulo     | Ícone               | `tintBg`                       | `tintColor`                |
| ------------ | ---------- | ------------------- | ------------------------------ | -------------------------- |
| `leads`      | Leads      | funnel              | `hsl(var(--primary)/0.14)`     | `hsl(var(--primary-text))` |
| `agenda`     | Agenda     | calendar            | `hsl(217 80% 58% / 0.16)`      | `hsl(217 75% 50%)`         |
| `financeiro` | Financeiro | money (rect+circle) | `hsl(142 58% 44% / 0.16)`      | `hsl(142 52% 36%)`         |
| `tarefas`    | Tarefas    | alert (triângulo)   | `hsl(var(--destructive)/0.13)` | `hsl(var(--destructive))`  |
| `metas`      | Metas      | target              | `hsl(var(--primary)/0.14)`     | `hsl(var(--primary-text))` |
| `pacientes`  | Pacientes  | gift                | `hsl(262 52% 58% / 0.16)`      | `hsl(262 48% 56%)`         |

> Os HSL fixos (agenda azul 217, financeiro verde 142, pacientes roxo 262) são cores de série — não têm token semântico. `leads`/`metas` reutilizam o dourado (`primary`). No dark mode, o dourado e o `destructive` acompanham os tokens; os 3 HSL fixos permanecem constantes (aceitável por serem categorização de dados, como o donut do Dashboard).

---

## 9. Botão de alternância — marcar lida / dispensar

Um único botão por linha, cujo **modo depende do estado lido**:

`width:26px; height:26px; border-radius:7px; border:1px solid {toggleBorder}; background:{toggleBg}; color:{toggleColor}; display:flex; center; cursor:pointer` (classe `senno-toggle`, transição `background/border-color/color .18s`). Ícone interno `13×13px`. Atributo `title` = `toggleTitle`.

| Estado do item | Modo                 | Ícone | `title`            | classe          | borda                     | fundo                      | cor                            |
| -------------- | -------------------- | ----- | ------------------ | --------------- | ------------------------- | -------------------------- | ------------------------------ |
| **Não-lida**   | **Marcar como lida** | check | "Marcar como lida" | `senno-mark`    | `hsl(var(--primary)/0.4)` | `hsl(var(--primary)/0.12)` | `hsl(var(--primary-text))`     |
| **Lida**       | **Dispensar**        | X     | "Dispensar"        | `senno-dismiss` | `hsl(var(--border))`      | `hsl(var(--background))`   | `hsl(var(--muted-foreground))` |

**Hover (por classe):**

- `.senno-mark:hover` → `border-color:hsl(var(--primary)/0.5)`.
- `.senno-dismiss:hover` → `border-color:hsl(var(--destructive)); color:hsl(var(--destructive)); background:hsl(var(--destructive)/0.12)`.

**Comportamento (`onToggle`):**

- **Se não-lida →** marca como lida: `state.read[id]=true`. O item permanece na lista (agora com aparência de lida) — exceto na aba "Não lidas", onde some.
- **Se já lida →** **dispensa** (remove) com animação de saída:
  1. O botão pinta imediatamente `background/border:hsl(var(--destructive)); color:#fff` (feedback instantâneo). Em CSS, `.senno-notif-leaving .senno-dismiss` também força esse estilo vermelho sólido.
  2. A linha desliza para fora **pela direita** e colapsa a altura (Web Animations API, ver §11).
  3. No `finish`/`cancel` da animação → `state.removed[id]=true` (o item sai do dataset vivo; contadores e metas recalculam).

> A linha removida é mantida no DOM colapsada (`senno-notif-leaving`) até o fim da animação para **não reindexar** a lista no meio do gesto. Grupos que ficam vazios colapsam em seguida (§6/§11).

---

## 10. Empty states (por aba)

Renderiza quando `isEmpty` (nenhum item **visível** na aba atual, i.e. `!hasItems`). Mutuamente exclusivo com a lista.

Card: `background:hsl(var(--card)); border:1px dashed hsl(var(--border)); border-radius:13px; padding:54px 24px; display:flex; flex-direction:column; align-items:center; text-align:center; gap:11px`.

- **Ícone (sucesso):** tile `46×46px; border-radius:12px; background:hsl(var(--ok-bg)); color:hsl(var(--ok))`, ícone check-check `22×22px`.
- **Título** (`emptyTitle`, `14.5px/600`):
  - aba `nao-lidas` → **"Você está em dia"**.
  - qualquer outra → **"Nada por aqui"**.
- **Descrição** (`emptyDesc`, `12.5px muted; margin-top:-4px; max-width:340px`):
  - aba `nao-lidas` → "Não há notificações não lidas. Tudo o que precisava da sua atenção já foi visto."
  - outras → "Nenhuma notificação neste filtro. Quando algo acontecer nesta categoria, aparece aqui."
- **Botão "Ver todas"** (só se `canResetFilter`, i.e. `tab !== 'todas'`): `height:36px; padding:0 16px; border-radius:9px; border:1px solid hsl(var(--input)); background:hsl(var(--background)); color:foreground; font-size:clamp(13px,0.14vw+11.2px,14.3px); font-weight:600; margin-top:6px`; hover `background:accent`. Ação `goAll` → `state.tab='todas'`.

> No estado inicial nenhuma aba está vazia. O empty aparece após interação (dispensar todos os itens de uma categoria, ou marcar tudo como lido estando em "Não lidas").

---

## 11. Catálogo de animações

### Keyframes (no `<style>`)

| Nome              | Definição                                                                            | Uso                     |
| ----------------- | ------------------------------------------------------------------------------------ | ----------------------- |
| `senno-bell-ring` | rotação amortecida `0 → 11deg → -9 → 6 → -4 → 2 → 0` (offsets 0/15/30/45/60/75/100%) | shake do sino ao clicar |

### Transições

| Elemento                                       | Propriedade / timing                                                                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Indicador de aba (underline)                   | `transform .32s cubic-bezier(.34,1.1,.5,1), width .32s cubic-bezier(.34,1.1,.5,1), opacity .2s`                                   |
| Busca (expand/collapse)                        | `width .34s cubic-bezier(.4,0,.2,1)`, bg/border/shadow `.22s`                                                                     |
| Toggle de tema (sol↔lua)                       | `transform .5s cubic-bezier(.34,1.3,.5,1)`, `opacity .35s`                                                                        |
| Sino (shake)                                   | `senno-bell-ring .7s cubic-bezier(.36,.07,.19,.97)` (removida no `animationend`)                                                  |
| Botão de alternância (`senno-toggle`)          | `background/border-color/color .18s`                                                                                              |
| Linha de notificação (repouso/dismiss via CSS) | `transform .42s cubic-bezier(.4,0,.2,1) .26s, opacity .42s .26s, max-height .32s .55s, padding .32s .55s, border-width .32s .55s` |
| Grupo colapsando (`senno-notif-group`)         | `max-height .4s .55s, opacity .3s .55s, margin .4s .55s`                                                                          |
| Card (hover de borda)                          | `border-color` p/ `hsl(var(--primary)/0.5)` — via `.senno-mark:hover` nos botões                                                  |

### Dismiss da linha (Web Animations API — fonte da verdade)

O gesto de dispensar usa `element.animate(...)` para garantir sincronismo (o CSS `.senno-notif-leaving` é o fallback e o estado final visual). Keyframes JS na linha (`duration:780; easing:cubic-bezier(.4,0,.2,1); fill:forwards`):

1. `{ transform:translateX(0); opacity:1; maxHeight:{h}px; paddingTop:14px; paddingBottom:14px }`
2. `{ transform:translateX(115%); opacity:0; maxHeight:{h}px; padding 14px } @ offset 0.55` — desliza para fora **antes** de colapsar a altura.
3. `{ transform:translateX(115%); opacity:0; maxHeight:0; padding:0 }` — colapsa a altura.

Onde `h = row.offsetHeight` no momento do clique. `onfinish`/`oncancel` → `state.removed[id]=true`.

> Tom **operacional/premium**: gestos curtos, leve overshoot no underline/tema. O dismiss é o único gesto mais longo (~0,78s) porque encadeia deslizar + colapsar.

---

## 12. Thresholds & lógica condicional (resumo)

| Onde                              | Regra                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `isRead(n)`                       | `!n.unread \|\| state.read[n.id]` (override local sobrepõe o dado)                                                        |
| `isGone(n)`                       | `state.removed[n.id]` (item dispensado)                                                                                   |
| `live`                            | `defs.filter(n => !isGone(n))` — itens não-removidos                                                                      |
| `unreadCount`                     | `live.filter(n => !isRead(n)).length` — inicial **3**                                                                     |
| Badge da nav (Notificações)       | aparece se `active && unreadCount > 0`; texto = `unreadCount`; **superfície dourada** (`bg-primary`+`primary-foreground`) |
| Filtro por aba                    | `nao-lidas` → não-lidas vivas; `todas` → todos; outra → `n.cat === tab`                                                   |
| Contador na aba                   | só "Todas" (`live.length`) e "Não lidas" (`unreadCount`) mostram badge (`showCount`)                                      |
| Cor do badge de aba               | "Não lidas" c/ count>0 **ou** aba ativa → `primary/0.16`+`primary-text`; inativa → `muted`+`muted-foreground`             |
| Meta do grupo                     | `{u} não lida(s)` (visíveis não-lidas) ou "Tudo lido" se `u===0`                                                          |
| Grupo omitido                     | grupo sem itens após filtro é removido (`items.length===0`)                                                               |
| Grupo colapsa                     | sem itens **visíveis** (todos removidos) → classe `senno-notif-group-empty`                                               |
| `rowBg` / `titleWeight`           | lida `transparent`/500 · não-lida `primary/0.05`/600 + dot                                                                |
| Botão de alternância              | não-lida → "Marcar como lida" (check, dourado); lida → "Dispensar" (X, vermelho no hover)                                 |
| Toggle em não-lida                | `state.read[id]=true` (item fica lido, permanece — some só na aba "Não lidas")                                            |
| Toggle em lida                    | anima saída → `state.removed[id]=true`                                                                                    |
| "Marcar todas como lidas" (barra) | desabilitado se `noUnread` (`unreadCount===0`); marca todas as não-lidas de `live`                                        |
| Empty — título                    | `nao-lidas` → "Você está em dia"; senão "Nada por aqui"                                                                   |
| Empty — botão "Ver todas"         | aparece se `canResetFilter` (`tab !== 'todas'`) → `tab='todas'`                                                           |
| Sino — dot                        | aparece se `topbarUnread` (há não-lidas **no dataset do sino**, §13)                                                      |
| Sino — "Marcar todas"             | só se `topbarUnread`; marca todas do dataset do sino                                                                      |
| Indicador de aba                  | mede aba `data-tab-active="1"` (`offsetLeft`/`offsetWidth`); remede após `fonts.ready`; `opacity` 0 até medir             |

---

## 13. Dois datasets (fonte da verdade)

> **Crítico:** o sino da topbar e o corpo da página usam **datasets diferentes** no protótipo. No produto real ambos devem consumir a mesma API de notificações — aqui estão separados para ilustrar os dois componentes. Documento os dois abaixo.

### 13.1 Dataset do SINO da topbar (`state.notifs` — 5 itens)

Campos: `{id, type, title, sub, time, read}`. Ordem = exibição no popover.

```
1  lead    "Novo lead"                — Mariana Alves · Instagram          — agora  — não-lida
2  money   "Pagamento confirmado"     — R$ 1.200 · Botox · Camila Souza    — 8 min  — não-lida
3  agenda  "Agendamento confirmado"   — Patrícia Lima · amanhã às 14h      — 40 min — não-lida
4  alert   "Tarefa atrasada"          — Retornar ligação · Rafael Dias     — 1 h    — lida
5  agenda  "Novo agendamento online"  — Beatriz Ramos · Limpeza de pele    — 3 h    — lida
```

- `topbarUnreadCount` inicial = **3** (itens 1, 2, 3). `topbarUnread = count > 0`.
- Tints por `type`: ver tabela §3.3.

### 13.2 Dataset do CORPO da página (`defs` — 11 itens)

Campos: `{id, cat, group, when, unread, title, desc, action}`. Este é o dataset das abas/grupos/linhas (§5–§9).

| id  | cat        | group  | when          | unread  | title                         | desc                                                                     | action          |
| --- | ---------- | ------ | ------------- | ------- | ----------------------------- | ------------------------------------------------------------------------ | --------------- |
| n1  | leads      | hoje   | Há 8 min      | **sim** | Novo lead: Rafael Souza       | Veio pelo Instagram interessado em Botox. Entrou na etapa Lead do funil. | Ver no funil    |
| n2  | tarefas    | hoje   | Há 35 min     | **sim** | Tarefa atrasada               | "Ligar para Patrícia Nunes" venceu ontem e ainda está em aberto.         | Abrir atividade |
| n3  | financeiro | hoje   | Há 1 h        | **sim** | Pagamento recebido            | Beatriz Lima pagou R$ 1.200,00 — Botox full face (Pix).                  | Ver recibo      |
| n4  | agenda     | hoje   | Há 2 h        | não     | Agendamento confirmado        | Bruno Almeida confirmou presença para hoje às 14:00.                     | Ver na agenda   |
| n5  | agenda     | hoje   | Há 3 h        | não     | Agendamento cancelado         | Camila Ribeiro cancelou o horário de quinta às 10:00.                    | Reagendar       |
| n6  | metas      | semana | Ontem · 18:40 | não     | Meta de faturamento atingida  | A clínica bateu a meta mensal de R$ 80.000 com 4 dias de folga.          | Ver metas       |
| n7  | leads      | semana | Ontem · 15:10 | não     | Lead avançou no funil         | Anderson Pereira passou de Avaliação para Proposta.                      | Ver no funil    |
| n8  | pacientes  | semana | Ter · 09:00   | não     | 5 aniversariantes esta semana | Envie uma mensagem de parabéns e fortaleça o relacionamento.             | Ver pacientes   |
| n9  | financeiro | semana | Seg · 11:25   | não     | Conta a receber vencendo      | Parcela 2/3 de Marcos Vinícius vence em 2 dias (R$ 450,00).              | Ver financeiro  |
| n10 | agenda     | antes  | 12 jun        | não     | Resumo semanal da agenda      | 42 atendimentos realizados, 3 cancelamentos e 1 falta na semana.         | —               |
| n11 | pacientes  | antes  | 10 jun        | não     | Nova avaliação recebida       | Helena Martins deixou uma avaliação 5 estrelas após o procedimento.      | —               |

- **Não-lidas iniciais:** n1, n2, n3 (⇒ `unreadCount = 3`, badge da nav "3", contador da aba "Não lidas" = 3).
- **Distribuição por grupo:** Hoje = n1–n5 (5) · Esta semana = n6–n9 (4) · Anteriores = n10–n11 (2).
- **Distribuição por categoria:** leads = n1, n7 · agenda = n4, n5, n10 · financeiro = n3, n9 · tarefas = n2 · metas = n6 · pacientes = n8, n11.

> Copy em **sentence case**, dados brasileiros realistas (nomes, R$ com ponto de milhar, procedimentos reais). As aspas em n2 são curvas (`"…"`).

---

## 14. Props do componente & integração com o App

**Props do Notificações** (`data-props`, `$preview` 1440×960):

- `defaultTheme`: enum `light | dark` (default `light`).

**Callbacks/props que o App injeta** (integração real):

- `theme` (controlado externamente; `this.props.theme ?? state.theme`), `onToggleTheme()`.
- `onNavigate(labelDaRota)` — usado pela nav da sidebar. No real, também deve alimentar os **botões de ação das linhas** (`onAction`) — deep-link por categoria: "Ver no funil" → Funil, "Abrir atividade" → Atividades, "Ver recibo"/"Ver financeiro" → Financeiro, "Ver na agenda"/"Reagendar" → Agenda, "Ver metas" → Metas, "Ver pacientes" → Pacientes. (No protótipo `onAction` é no-op.)
- `onNewLead()` — botão "Novo lead".

**Estado interno relevante** (no real, virá da API/servidor):

- `read: {}` — mapa `id → true` de itens marcados como lidos localmente.
- `removed: {}` — mapa `id → true` de itens dispensados.
- `tab` — aba ativa (default `'todas'`).
- `notifs` — dataset do sino (5 itens); `notifOpen`, `bellRing` — estado do popover/shake.
- `indLeft`/`indWidth` — medição do indicador de aba.

> No produto real, unifique os dois datasets numa única fonte (API), derivando o popover do sino (ex.: 5 mais recentes) e o corpo (lista completa paginável) da mesma coleção. "Marcar como lida", "dispensar" e "marcar todas" viram mutations.

---

## 15. Checklist específico da tela

- [ ] Chrome idêntico (sidebar 236px + topbar) — reaproveitado do design system.
- [ ] Item **Notificações ativo** na nav com **badge de não-lidas** em superfície dourada (`bg-primary`+`primary-foreground`), só quando `unreadCount>0`.
- [ ] Só tokens semânticos no chrome; conferir dark mode em todas as superfícies (os 3 HSL fixos de categoria — agenda/financeiro/pacientes — são série de dados, ok).
- [ ] Dois dourados nos papéis certos (`primary` superfície / `primary-text` texto/links/ícones-texto/contadores/nav-ativo).
- [ ] `tabular-nums` em: badge da nav, contadores de aba, contagem do popover, carimbos de tempo (`when`), metas de grupo.
- [ ] **Sino da topbar funcional:** dot se não-lidas, shake no clique (removido no `animationend`), popover com contador + "Marcar todas como lidas" + linhas tintadas por tipo + rodapé "Ver todas as notificações". **Dataset do sino ≠ dataset do corpo.**
- [ ] Busca colapsável presente (expand right→left); nesta rota **sem popover de resultados** (decidir no real se pluga resultados).
- [ ] Abas = filtros `Todas · Não lidas · Leads · Agenda · Financeiro · Tarefas`; contador só em Todas (11) e Não lidas (3).
- [ ] Indicador de aba mede a aba ativa (`offsetLeft`/`offsetWidth`), remede após `fonts.ready`, **corta no fim da aba** — não atravessa a barra.
- [ ] Cada aba mostra o conteúdo correto (§5); grupos vazios omitidos; metas de grupo "N não lida(s)" / "Tudo lido".
- [ ] Grupos fixos **Hoje / Esta semana / Anteriores** com cabeçalho uppercase + linha + meta.
- [ ] Linha: tile por categoria, título 500/600 + dot se não-lida, descrição completa, botão de ação (quando há), carimbo de tempo, botão de alternância.
- [ ] Botão de alternância: **não-lida → marcar como lida** (check dourado); **lida → dispensar** (X, hover vermelho) com **animação de saída** (desliza p/ direita + colapsa) e colapso do grupo vazio.
- [ ] "Marcar todas como lidas" (barra de ação): desabilitada quando `noUnread`; global.
- [ ] 4 estados cobertos: carregado (default), skeleton (no real — usar shimmer do design system), **vazio composto** (por aba, título/desc/ação corretos), erro inline — **nunca `alert()`**.
- [ ] hover/active/focus em tudo interativo; anel de foco `ring`.
- [ ] Copy pt-BR sentence case, sem emoji; dados brasileiros realistas.
