# Atividades — Handoff detalhado (item a item)

> Especificação granular da tela **Atividades** (`Atividades.dc.html`).
> Objetivo: reconstruir **cada elemento visual, medida, threshold e animação** no stack real
> (Next 16 + Tailwind v3 + shadcn/ui) sem improviso. **Nada aqui é opcional.**
>
> **Como usar este doc**
>
> 1. Leia `design.md` primeiro (tokens, regras de cor, tipografia, chrome). Este arquivo **não repete** os tokens — assume que já estão no `globals.css`.
> 2. Toda cor é token semântico via `hsl(var(--token))`. Onde aparece `primary/0.16`, leia `hsl(var(--primary) / 0.16)`.
> 3. Todo número (px, %, peso, threshold) é **literal do protótipo** — reproduza exatamente. Onde houver `clamp(...)`, é responsivo; mantenha a fórmula.
> 4. O `.dc.html` usa um runtime de protótipo próprio — **não copie a sintaxe de template**. Recrie em React/TSX com as libs do codebase. Ícones → `lucide-react`.
> 5. O **chrome** (sidebar + topbar) é idêntico ao do Dashboard. Aqui ele é documentado de novo por completude, mas **reutilize o componente já construído** — só muda o item de nav ativo (`Atividades`), o título (`Atividades`) e uma simplificação da busca (§3.1).
>
> **Legenda de tokens usados abaixo (do `design.md`):**
> `--card` superfície · `--background` fundo app · `--foreground` texto · `--muted`/`--muted-foreground` neutro · `--border` bordas · `--accent` hover · `--primary` dourado-superfície · `--primary-foreground` texto escuro sobre dourado · `--primary-text` dourado-texto · `--ring` foco · `--destructive` erro · `--ok`/`--ok-bg` sucesso · `--warn`/`--warn-bg` aviso · `--shadow`/`--shadow-a` sombra tingida.

---

## 0. Índice

1. Estrutura geral da página (esqueleto + medidas de layout)
2. Sidebar (236px) — item a item
3. Topbar (header) — título + busca + tema + sino + Novo lead
4. Filtro de pastas / cargos (chip dourado com roll-out)
5. Barra de abas (underline) + botão "Nova atividade"
6. Banner de atrasada
7. Lista de atividades — card, linha, ícone por tipo, prioridade, checkbox
8. Concluir atividade (interação de saída)
9. Estados: carregado / skeleton / vazio / erro
10. Catálogo de animações (keyframes + transições)
11. Thresholds & lógica condicional (tabela única)
12. Dados de exemplo (fonte da verdade)
13. Props do componente e integração com o App
14. Checklist específico da tela

---

## 1. Estrutura geral da página

### Container raiz

- Elemento `.senno` com `data-theme` (`light|dark`) e `data-font="inter"`.
- `background: hsl(var(--background))`, `color: hsl(var(--foreground))`, `height: 100vh`, `overflow: hidden`, `line-height: 1.45`, `font-family: Inter`.
- `-webkit-font-smoothing: antialiased`, `box-sizing: border-box` global, `body { margin: 0 }`.

### Moldura da app

`data-screen-label="Atividades"` — `width:100%; height:100%; min-height:0; display:flex; overflow:hidden; background:hsl(var(--background))`.

Layout em duas colunas via flex (idêntico ao Dashboard):

```
[ SIDEBAR 236px fixa ] [ MAIN flex:1 -> (TOPBAR fixo) + (BODY rolável) ]
```

- **MAIN**: `flex:1; min-width:0; min-height:0; display:flex; flex-direction:column`.
- **BODY rolável**: `flex:1; min-height:0; overflow-y:auto; padding:18px 24px; display:flex; flex-direction:column; gap:16px`. **Só o body rola** — sidebar e topbar ficam fixos.

### Ordem vertical do body (gap 16px entre blocos)

1. **Filtro de pastas / cargos** (chip alinhado à esquerda, `margin-bottom:8px` extra)
2. **Barra de abas + botão "Nova atividade"** (linha `space-between`)
3. **Banner de atrasada** (condicional — §6)
4. **Lista de atividades** (card) **ou** **empty state** (mutuamente exclusivos)

### Breakpoints responsivos (media queries globais herdadas do chrome)

- `@media (max-width:1024px)`: `.senno-2col { grid-template-columns:1fr }` e `.senno-3col { grid-template-columns:1fr 1fr }`.
- `@media (max-width:660px)`: `.senno-3col { grid-template-columns:1fr }`.
- (A tela de Atividades é de coluna única; as media queries vêm do chrome compartilhado e não afetam esta rota.)

---

## 2. Sidebar — 236px

Idêntica ao Dashboard. `aside`: `width:236px; flex:none; background:hsl(var(--card)); border-right:1px solid hsl(var(--border)); display:flex; flex-direction:column; padding:18px 14px`.

### 2.1 Bloco de marca (topo)

- Wrapper: `display:flex; align-items:center; gap:10px; padding:6px 8px 18px`.
- **Logo**: `34×34px`, `border-radius:9px`, `background:hsl(var(--primary))`, flex center. Glifo **"B"** — `color:hsl(var(--primary-foreground))`, `font-weight:700`, `font-size:17px`.
- **Textos** (min-width:0, truncam): "Clínica Bellavie" `14px / 600`; "Plano Premium" `11px muted-foreground`.

### 2.2 Navegação

`nav`: `display:flex; flex-direction:column; gap:2px`. Cada item = `<a href="#">` (`<Link>` no real): `display:flex; align-items:center; gap:11px; padding:8px 10px; border-radius:8px; font-size:13.5px; text-decoration:none`. Ícone `18×18px flex:none`; label `flex:1; white-space:nowrap`. **Hover:** `background:hsl(var(--accent))`.

| Estado                           | `font-weight` | texto/ícone                    | `background`         |
| -------------------------------- | ------------- | ------------------------------ | -------------------- |
| Inativo                          | 500           | `hsl(var(--muted-foreground))` | `transparent`        |
| **Ativo** (aqui: **Atividades**) | 600           | `hsl(var(--primary-text))`     | `hsl(var(--accent))` |

**Ordem fixa da nav (12 itens):** `Dashboard` · **`Atividades`** (ativo) · `Agenda` · `Funil` · `Pacientes` · `Financeiro` · `Metas` · `Insights` · `Procedimentos` · `Exportações` · `Notificações` · `Configurações`.
Ícones: grid, activity, calendar, funnel, users, money, target, bulb, syringe, download, bell, settings. Clique chama `onNavigate(label)`.

### 2.3 Rodapé (usuário)

`margin-top:auto`. Card `display:flex; align-items:center; gap:10px; padding:10px; border-radius:10px; background:hsl(var(--muted))`. Avatar "HC" `32×32px; border-radius:99px; background:hsl(var(--primary)/0.2); color:hsl(var(--primary-text)); 12.5px/600`. Nome "Dra. Helena Costa" `12.5px/600`; cargo "Proprietária" `11px muted`.

---

## 3. Topbar (header)

`header`: `flex:none; display:flex; align-items:center; gap:16px; padding:14px 24px; border-bottom:1px solid hsl(var(--border)); background:hsl(var(--card))`.

- **Esquerda** (`flex:1; min-width:0`): `<h1>` **"Atividades"** — `font-size:clamp(22px, 0.5vw + 18px, 27px); font-weight:600; letter-spacing:-0.01em; margin:0`.
- **Direita**: `display:flex; align-items:center; gap:9px` — na ordem **Busca → Tema → Sino → Novo lead**.

### 3.1 Busca "Buscar paciente…" (colapsável) — **variante simplificada**

⚠️ **Diferença vs. Dashboard:** nesta tela a busca é **apenas o campo colapsável**, **sem popover de resultados** (não há `searchOpen`, lista, realce nem empty). Só o comportamento de expandir/colapsar.

- Wrapper `.senno-search`: `position:relative; width:38px; height:38px; flex:none`.
- Caixa `.senno-search-box`: `position:absolute; top:0; right:0; height:38px; width:38px` (colapsado); `display:flex; align-items:center; gap:8px; padding:0 11px; border-radius:9px; border:1px solid hsl(var(--border)); background:hsl(var(--background)); color:hsl(var(--muted-foreground)); font-size:12.5px; overflow:hidden; white-space:nowrap; cursor:pointer`.
- **Transição:** `width .34s cubic-bezier(.4,0,.2,1), background .22s, border-color .22s, box-shadow .22s`.
- **Expandido** (`:hover` no wrapper **ou** `:focus-within` na caixa): `width:240px; border-color:hsl(var(--input)); cursor:text`.
- **Foco** (`:focus-within`): `border-color:hsl(var(--ring)); box-shadow:0 0 0 3px hsl(var(--ring)/0.18)`.
- Ícone lupa `15×15px flex:none`. Input `border:none; outline:none; background:transparent; font-size:12.5px; color:foreground`, placeholder "Buscar paciente…".

### 3.2 Toggle de tema (sol/lua)

- Botão `.senno-theme-btn`: `38×38px; border-radius:9px; border:1px solid border; background:background; color:foreground; position:relative; overflow:hidden`; hover `background:accent`. `title` = "Modo escuro"/"Modo claro" (`themeTitle`).
- Dois ícones sobrepostos `.senno-theme-ico` (`position:absolute; top:50%; left:50%; width:17px; height:17px; margin:-8.5px 0 0 -8.5px`), `transition: transform .5s cubic-bezier(.34,1.3,.5,1), opacity .35s`.

|                           | Light                                    | Dark                                    |
| ------------------------- | ---------------------------------------- | --------------------------------------- |
| Sol (`.senno-theme-sun`)  | `rotate(0) scale(1)`, `opacity:1`        | `rotate(90deg) scale(.35)`, `opacity:0` |
| Lua (`.senno-theme-moon`) | `rotate(-90deg) scale(.35)`, `opacity:0` | `rotate(0) scale(1)`, `opacity:1`       |

Clique → `toggleTheme`: usa `onToggleTheme()` do App se existir, senão alterna `state.theme` local.

### 3.3 Sino de notificações (`senno-notif`)

- Wrapper `position:relative`. Botão `38×38px; border-radius:9px; border; background:background; color:foreground`; hover `accent`; `title="Notificações"`. Ícone sino `17×17px; transform-origin:top center`.
- **Dot de não-lidas** (se `unreadCount > 0`): `position:absolute; top:7px; right:8px; width:7px; height:7px; border-radius:99px; background:hsl(var(--destructive)); border:1.5px solid hsl(var(--card))`.
- **Shake ao clicar:** aplica `senno-bell-ring-a` → keyframes `senno-bell-ring .7s cubic-bezier(.36,.07,.19,.97)`; classe removida no `animationend` (`bellAnimEnd`). O clique também alterna `notifOpen`.

**Popover de notificações** (quando `notifOpen`) — idêntico ao Dashboard:

- Overlay `fixed inset:0 z:40` (clique fora fecha). Painel `position:absolute; top:46px; right:0; width:362px; background:popover; border:1px solid border; border-radius:12px; box-shadow:0 16px 40px -12px hsl(var(--shadow)/calc(var(--shadow-a)*3.5)); z:50; overflow:hidden`.
- **Cabeçalho:** "Notificações" (`clamp(13…14.3)/600`) + pill de contador de não-lidas (`11px/600; padding:1px 7px; radius:99px; background:hsl(var(--primary)/0.16); color:primary-text; tabular-nums`). À direita, botão-texto "Marcar todas como lidas" (`11.5px/600 primary-text`, hover underline) — só se há não-lidas.
- **Lista:** `flex-direction:column; padding:0 6px 6px; max-height:344px; overflow-y:auto`.
- **Item** (`<button>`): `display:flex; align-items:flex-start; gap:11px; padding:10px 8px; border-radius:8px`; `background` = lida `transparent` / não-lida `hsl(var(--primary)/0.05)`; hover `accent`. Tile `32×32px radius:99px` (cor por tipo, tabela abaixo), ícone interno `15×15px`. Título `12.5px` (não-lida 600 / lida 500), sub `11.5px muted` (trunca). À direita: hora `10.5px muted` + dot `7×7px radius:99px bg-primary` se não-lida.
- **Rodapé:** centralizado, "Ver todas as notificações" (`12px/600 primary-text`).

**Tints por tipo de notificação** (`iconBg` / `iconColor`):
| tipo | ícone | fundo | cor |
|---|---|---|---|
| `lead` | users | `primary/0.16` | `primary-text` |
| `money` | money | `ok-bg` | `ok` |
| `agenda` | calendar | `accent` | `muted-foreground` |
| `alert` | alert | `destructive/0.14` | `destructive` |

Clique num item → marca aquele como lido (`onClick` interno). "Marcar todas" (`markAllRead`) → todas lidas.

### 3.4 Botão "Novo lead"

`height:38px; padding:0 15px; border-radius:9px; border:none; background:hsl(var(--primary)); color:hsl(var(--primary-foreground)); font-size:clamp(13px, 0.14vw + 11.2px, 14.3px); font-weight:600; display:flex; align-items:center; gap:7px`; hover `filter:brightness(1.05)`. Ícone `+` `15×15px`. Clique → `onNewLead`.

---

## 4. Filtro de pastas / cargos (chip dourado com roll-out)

Padrão exclusivo desta tela: um único chip **alinhado à esquerda** (`align-self:flex-start; margin-bottom:8px`) que revela as demais pastas ao passar o mouse. Container `.senno-pastas`: `display:inline-flex; align-items:center; background:hsl(var(--muted)); border:1px solid hsl(var(--border)); border-radius:99px; padding:4px`.

Estrutura interna, da esquerda p/ direita:

1. **Pasta selecionada** (sempre visível) — botão dourado.
2. **Demais pastas** (`.senno-pastas-rest`) — escondidas; deslizam para fora à direita da selecionada no hover.
3. **Gatilho "Pastas"** (`.senno-pastas-trigger`) — empurrado para a direita quando expande.

### 4.1 Botão de pasta (chip)

Cada chip: `display:inline-flex; align-items:center; gap:7px; flex:none; cursor:pointer; white-space:nowrap; padding:6px 13px; border-radius:99px; border:1px solid transparent`. **Dot** `7×7px; border-radius:99px` à esquerda do label (cor = cor do cargo; na pasta ativa vira `primary-foreground`).

| Estado             | `font-weight` | `background`          | `color` (texto)                  | `dot`                            |
| ------------------ | ------------- | --------------------- | -------------------------------- | -------------------------------- |
| Selecionado (`on`) | 600           | `hsl(var(--primary))` | `hsl(var(--primary-foreground))` | `hsl(var(--primary-foreground))` |
| Não selecionado    | 500           | `transparent`         | `hsl(var(--foreground))`         | cor do cargo (tabela §12)        |

`font-size:12.5px` em todos. Clique num chip → `setState({role:i})` e faz `blur()` no alvo (fecha o roll-out após escolher).

### 4.2 Roll-out das demais pastas

- `.senno-pastas-rest`: `flex:none; max-width:0; opacity:0; overflow:hidden; transition:max-width .42s cubic-bezier(.4,0,.2,1), opacity .3s ease .02s`.
- No `:hover`/`:focus-within` de `.senno-pastas`: `max-width:760px; opacity:1`.
- Inner `.senno-pastas-rest-inner`: `width:max-content; display:flex; align-items:center; gap:8px; padding-left:8px` (contém os chips **não selecionados**, na ordem original menos o ativo).
- A **hitbox é o container inteiro** — passar o mouse em qualquer parte de `.senno-pastas` expande.

### 4.3 Gatilho "Pastas"

`.senno-pastas-trigger`: `margin-left:8px; display:inline-flex; align-items:center; gap:8px; cursor:pointer; font-size:12.5px; font-weight:500; color:foreground; background:hsl(var(--card)); border:1px solid hsl(var(--border)); border-radius:99px; padding:7px 13px`; transição `background/border/color .2s`. **Hover** (próprio ou via `.senno-pastas:hover`): `background:accent; border-color:input`.

- Ícone **folder** `15×15px` `color:primary-text`.
- Texto "Pastas".
- Chevron-right `.senno-pastas-chev` `13×13px muted`; no hover do container → `transform:translateX(2px)` (`transition:transform .3s`).

---

## 5. Barra de abas (underline) + botão "Nova atividade"

Linha: `display:flex; align-items:center; justify-content:space-between; gap:16px`.

### 5.1 Abas (underline dourado medido)

Barra (`ref=setTabBar`): `position:relative; display:flex; align-items:center; gap:4px; border-bottom:1px solid hsl(var(--border))`.

- **Indicador** (2px): `position:absolute; left:0; bottom:-1px; height:2px; border-radius:2px; background:hsl(var(--primary)); width:{indWidth}; transform:translateX({indLeft}); opacity:{indOpacity}; pointer-events:none`. Transição `transform .32s cubic-bezier(.34,1.1,.5,1), width .32s cubic-bezier(.34,1.1,.5,1), opacity .2s`.
  - `indLeft`/`indWidth` são **medidos** do tab ativo (`offsetLeft`/`offsetWidth`) em `componentDidMount` (+`document.fonts.ready`) e `componentDidUpdate`. `indOpacity` = 0 até medir, depois 1.
  - ⚠️ **A linha (`border-bottom`) e o indicador terminam no fim da última aba — não atravessam a largura toda.** A barra tem largura de conteúdo (não `width:100%`).
- **Botão de aba** (`<button>`): `position:relative; display:inline-flex; align-items:center; gap:7px; border:none; background:transparent; cursor:pointer; font-size:13.5px; font-weight:600; padding:9px 12px; margin-bottom:-1px; border-bottom:2px solid transparent`. Cor: ativo `hsl(var(--foreground))` / inativo `hsl(var(--muted-foreground))`. `data-tab-active="1"` no ativo (usado pela medição).
- **Badge-contador** (pill, dentro do botão): `font-size:10.5px; font-weight:600; font-variant-numeric:tabular-nums; min-width:18px; text-align:center; padding:1px 6px; border-radius:99px`.

**5 abas (chave → label):** `hoje → "Hoje"` · `semana → "Esta semana"` · `atrasadas → "Atrasadas"` · `todas → "Todas"` · `feitas → "Feitas"`. **Padrão selecionado = "Hoje"** (`tab:'hoje'`). Clique → `setState({tab:k})`.

**Cor do badge** (por prioridade de regra):
| Condição | `background` | `color` |
|---|---|---|
| Aba "atrasadas" **e** `counts.atrasadas > 0` (`isOver`) | `hsl(var(--destructive)/0.15)` | `hsl(var(--destructive))` |
| Aba ativa (não-over) | `hsl(var(--primary)/0.16)` | `hsl(var(--primary-text))` |
| Demais (inativa, não-over) | `hsl(var(--muted))` | `hsl(var(--muted-foreground))` |

**Contadores** (calculados sobre a lista viva — §12): `hoje: 4` · `semana: 6` · `atrasadas: 1` · `todas: 11` · `feitas: 10`.

> ⚠️ **Nota de inconsistência do protótipo:** `counts.feitas` é o **literal `10`**, mas o array `done` tem **6 itens** (a lista da aba "Feitas" mostra 6). No produto real, derive o contador da fonte de dados (devem bater); mantido aqui só como fidelidade ao protótipo.

### 5.2 Botão "Nova atividade" (dentro do conteúdo)

Alinhado à direita da barra de abas (nunca no header): `flex:none; height:36px; padding:0 14px; border-radius:9px; border:none; background:hsl(var(--primary)); color:hsl(var(--primary-foreground)); font-size:clamp(13px, 0.14vw + 11.2px, 14.3px); font-weight:600; display:inline-flex; align-items:center; gap:7px`; hover `filter:brightness(1.05)`. Ícone `+` `15×15px`. (No protótipo abre o fluxo de criação de atividade.)

---

## 6. Banner de atrasada

Renderiza quando `showOverdue` = `counts.atrasadas > 0 && tab !== 'atrasadas' && tab !== 'feitas'` (some ao entrar na aba Atrasadas ou Feitas).

- Wrapper: `display:flex; align-items:center; gap:24px; padding:9px 12px 9px 18px; border-radius:11px; background:hsl(var(--destructive)/0.09); border:1px solid hsl(var(--destructive)/0.3); box-shadow:0 1px 2px hsl(var(--shadow)/var(--shadow-a))`.
- **Tile de ícone:** `28×28px; border-radius:8px; flex:none; background:hsl(var(--destructive)); transform:translateX(5px)`; classe `.senno-overdue-ico` (pulsa — §10). Ícone alert `15×15px; color:#fff; transform:translateY(-1.5px)`.
- **Texto** (`flex:1; display:flex; align-items:baseline; gap:8px; flex-wrap:wrap`): título **"1 atividade atrasada"** `12.5px/700; color:destructive` + apoio "Precisa de atenção para não impactar o atendimento." `11.5px; color:hsl(var(--destructive)/0.8)`.
- **Botão "Ver atrasadas":** `flex:none; height:28px; padding:0 12px; border-radius:7px; border:none; background:hsl(var(--destructive)); color:#fff; font-size:12px; font-weight:600`; hover `filter:brightness(1.08)`. Clique → `goOverdue` (`setState({tab:'atrasadas'})`).

> O "1" do título é literal do protótipo. No real, derive do contador de atrasadas (singular/plural: "N atividades atrasadas").

---

## 7. Lista de atividades

Renderiza quando `hasItems` (`items.length > 0`). Card: `background:hsl(var(--card)); border:1px solid hsl(var(--border)); border-radius:13px; box-shadow:0 1px 2px hsl(var(--shadow)/var(--shadow-a)); overflow:hidden`. As linhas dividem-se por `border-top` (a 1ª também tem `border-top`).

### 7.1 Linha de atividade (`.senno-act-row`)

`display:flex; align-items:center; gap:14px; padding:14px 18px; border-top:1px solid hsl(var(--border))`. **Hover:** `background:hsl(var(--accent)/0.5)`. `overflow:hidden; max-height:180px` (para a animação de saída — §8).

Da esquerda p/ direita:

1. **Tile de ícone (tipo):** `38×38px; border-radius:10px; flex:none; display:flex; center`; `background` e `color` pelo **tipo** (tabela §7.3). Ícone interno `18×18px`.
2. **Centro** (`flex:1; min-width:0`):
   - **Título** `13.5px/600`; `color` = concluída `muted-foreground` / aberta `foreground`; `text-decoration` = concluída `line-through` / aberta `none`. Trunca (`white-space:nowrap; ellipsis`).
   - **Sub** `12px; color:muted-foreground; margin-top:2px`: `"{tipo} · {paciente}"`. Trunca.
3. **Prazo/quando** `font-size:12px; font-weight:500; flex:none; white-space:nowrap`; `color` = atrasada `hsl(var(--destructive))` / demais `hsl(var(--muted-foreground))`. Texto = campo `when` (ex.: "Hoje · 14:00", "Venceu ontem", "Qua · 13:00").
4. **Pill "Alta"** (só se `prioHigh` = `prio === 'alta' && !done`): `font-size:10.5px; font-weight:600; padding:2px 8px; border-radius:99px; background:hsl(var(--warn-bg)); color:hsl(var(--warn)); flex:none`. Texto "Alta".
5. **Checkbox** (`.senno-check`) — §8.

> **Dado disponível não renderizado:** cada atividade tem um responsável `who` (iniciais HC/AT/FN/GR → `assigneeName`). O protótipo mapeia mas **não exibe** na linha atual. No real, considere um avatar de iniciais à direita se o produto pedir; caso contrário, ignore.

### 7.2 Checkbox de conclusão

`.senno-check`: `width:24px; height:24px; border-radius:99px; flex:none; display:flex; center; border:1.5px solid {checkBorder}; background:{checkBg}; color:{checkColor}`; transição `background/border-color/color .2s, transform .25s`. Ícone check `13×13px`.

| Estado                 | classe extra                  | `border`             | `background`          | `color` (check)                    |
| ---------------------- | ----------------------------- | -------------------- | --------------------- | ---------------------------------- |
| Aberta (clicável)      | `senno-check-on`              | `hsl(var(--border))` | `transparent`         | `hsl(var(--muted-foreground)/0.4)` |
| Aberta · **hover**     | (via `.senno-check-on:hover`) | `hsl(var(--ok))`     | `hsl(var(--ok)/0.12)` | `hsl(var(--ok))`                   |
| Concluída (aba Feitas) | —                             | `hsl(var(--ok))`     | `hsl(var(--ok))`      | `#fff`                             |

Aberta: `cursor:pointer`, `onClick → complete(title)`. Concluída: sem `onClick`.

### 7.3 Ícone e tint por **tipo** de atividade (`TYPE` map)

Tile `background` + ícone/`color`. Tipos com cor própria (fora dos tokens) usam **HSL fixo** — mantenha os literais.

| Tipo                                                    | ícone        | `background` (tile)        | `color` (ícone)                |
| ------------------------------------------------------- | ------------ | -------------------------- | ------------------------------ |
| `Tarefa`                                                | check-square | `hsl(var(--primary)/0.14)` | `hsl(var(--primary-text))`     |
| `Reunião`                                               | users        | `hsl(262 52% 58% / 0.16)`  | `hsl(262 48% 56%)`             |
| `Ligação`                                               | phone        | `hsl(217 80% 58% / 0.16)`  | `hsl(217 75% 50%)`             |
| `E-mail`                                                | mail         | `hsl(190 70% 45% / 0.18)`  | `hsl(190 68% 36%)`             |
| `Nota`                                                  | note         | `hsl(38 85% 50% / 0.18)`   | `hsl(32 80% 40%)`              |
| `Mensagem`                                              | message      | `hsl(142 58% 44% / 0.16)`  | `hsl(142 52% 38%)`             |
| **`_default`** (tipo personalizado, ex.: "Aniversário") | star         | `hsl(var(--muted))`        | `hsl(var(--muted-foreground))` |

> **Regra:** qualquer tipo fora do mapa cai no `_default` (ícone **estrela**, tint neutro). É assim que "Aniversário" aparece — ícone padrão para tipos personalizados criados pela clínica.

### 7.4 Qual lista cada aba mostra

- `feitas` → array `done` (com `done:true`; título riscado + check verde fixo, sem interação).
- `todas` → `open` completo (11).
- `hoje` / `semana` / `atrasadas` → `open` filtrado por `bucket === tab`.

---

## 8. Concluir atividade (interação de saída)

Ao clicar o checkbox de uma atividade aberta (`complete(key)`, `key = title`):

1. `state.completing[key] = true` imediatamente → a linha recebe `.senno-act-leaving` (junto com `rowClass`).
2. Após **850ms** (`setTimeout`): remove de `completing` e grava `state.removed[key] = true` (linha some da lista viva; contadores recalculam). Reentrância bloqueada (`if(completing[key]) return`).

**CSS da saída:**

- `.senno-act-row`: `transition: transform .42s cubic-bezier(.4,0,.2,1) .26s, opacity .42s ease .26s, max-height .32s ease .55s, padding .32s ease .55s` (repare o **delay escalonado**: check anima primeiro, depois a linha desliza, depois colapsa a altura).
- `.senno-act-leaving`: `transform:translateX(115%); opacity:0; max-height:0 !important; padding-top/bottom:0 !important` (desliza para fora pela **direita** e colapsa).
- **Pop do check:** `.senno-act-leaving .senno-check` → `background/border:hsl(var(--ok)); color:#fff; animation:senno-check-pop .4s ease` (keyframes `scale 1 → 1.28 → 0.9 → 1`).

> Efeito: check fica verde e "pula", a linha desliza para a direita, some, e a lista se fecha suavemente.

---

## 9. Estados: carregado / skeleton / vazio / erro

O protótipo implementa **carregado** e **vazio**. **Skeleton** e **erro** seguem os padrões do `design.md §5` (obrigatórios no real). Todos os 4 devem existir na rota.

### 9.1 Carregado

A lista do §7 com ≥1 item. (Padrão ao abrir: aba "Hoje", 4 atividades.)

### 9.2 Vazio (composto — quando `isEmpty`, `items.length === 0` no filtro)

Card **tracejado**: `background:hsl(var(--card)); border:1px dashed hsl(var(--border)); border-radius:13px; padding:46px 24px; display:flex; flex-direction:column; align-items:center; text-align:center; gap:11px`.

- Tile `40×40px; border-radius:11px; background:hsl(var(--muted)); color:hsl(var(--muted-foreground))`; ícone check-square `20×20px`.
- Título "Nenhuma atividade neste filtro" `14px/600`.
- Apoio "Quando houver tarefas, reuniões ou ligações aqui, elas aparecem nesta lista." `12.5px muted; margin-top:-4px; max-width:320px`.
- Botão ghost "Ver todas" `margin-top:6px; height:36px; padding:0 16px; border-radius:9px; border:1px solid hsl(var(--input)); background:hsl(var(--background)); color:foreground; font-size:clamp(13…14.3)/600`; hover `accent`. Clique → `goAll` (`setState({tab:'todas'})`).

### 9.3 Skeleton (a implementar — nunca spinner)

No lugar da lista, o card `bg-card border radius:13px` com **4 linhas placeholder** (`padding:14px 18px; border-top`), cada uma com shimmer: tile `38×38 radius:10`, título `13×55%`, sub `11×35%`, quando `12×70`, check `24×24 radius:99`. Shimmer: `background:linear-gradient(90deg, hsl(var(--muted)) 25%, hsl(var(--accent)) 37%, hsl(var(--muted)) 63%); background-size:220% 100%; animation:sennoShimmer 1.5s ease-in-out infinite`.

### 9.4 Erro (a implementar — inline, nunca `alert()`)

Caixa `background:hsl(var(--destructive)/0.1); border:1px solid hsl(var(--destructive)/0.3); border-radius:13px; padding:16px 18px; display:flex; align-items:center; gap:12px`: ícone alert `18px destructive`, título "Erro ao carregar as atividades" `destructive/600`, sub "Verifique a conexão e tente novamente." `12.5px muted` + botão "Recarregar" (`30px; border:1px solid hsl(var(--destructive)/0.4); color:destructive; background:transparent`).

---

## 10. Catálogo de animações

### Keyframes (no `<style>`)

| Nome                  | Definição                                                                                                           | Uso                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `senno-bell-ring`     | rotação amortecida `0 → 11deg → -9 → 6 → -4 → 2 → 0`                                                                | shake do sino ao clicar (`.7s cubic-bezier(.36,.07,.19,.97)`) |
| `senno-overdue-pulse` | `0%,100% { box-shadow:0 0 0 0 hsl(var(--destructive)/0.5) } 70% { box-shadow:0 0 0 6px hsl(var(--destructive)/0) }` | halo pulsante no tile do banner (`2s ease-out infinite`)      |
| `senno-check-pop`     | `0%{scale 1} 35%{scale 1.28} 70%{scale .9} 100%{scale 1}`                                                           | pop do check ao concluir (`.4s ease`)                         |
| `sennoShimmer`        | `0%{background-position:-180% 0} 100%{background-position:180% 0}`                                                  | skeleton (do design system)                                   |

### Transições

| Elemento                                   | Propriedade / timing                                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Busca (expand/collapse)                    | `width .34s cubic-bezier(.4,0,.2,1)`, bg/border/shadow `.22s`                                                   |
| Toggle de tema (sol↔lua)                   | `transform .5s cubic-bezier(.34,1.3,.5,1)`, `opacity .35s`                                                      |
| Roll-out das pastas (`.senno-pastas-rest`) | `max-width .42s cubic-bezier(.4,0,.2,1)`, `opacity .3s .02s`                                                    |
| Chevron do gatilho "Pastas"                | `transform .3s` (→ `translateX(2px)` no hover)                                                                  |
| Chip de pasta / gatilho (hover)            | `background/border-color/color .2s`                                                                             |
| Indicador de aba (underline)               | `transform .32s cubic-bezier(.34,1.1,.5,1)`, `width .32s ...`, `opacity .2s`                                    |
| Linha ao concluir (`.senno-act-row`)       | `transform .42s cubic-bezier(.4,0,.2,1) .26s`, `opacity .42s .26s`, `max-height .32s .55s`, `padding .32s .55s` |
| Checkbox (`.senno-check`)                  | `background/border-color/color .2s`, `transform .25s`                                                           |
| Card / botões (hover)                      | `filter:brightness(1.05)` (primário), `background:accent` (ghost)                                               |

> Tom **operacional/premium**: transições curtas, leve overshoot. Nada de animação longa ou chamativa.

---

## 11. Thresholds & lógica condicional (resumo)

| Onde                    | Regra                                                                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contador de aba         | `hoje/semana/atrasadas` = `open` filtrado por `bucket` (sobre a lista viva, pós-remoções); `todas` = `open.length`; `feitas` = literal `10` (ver nota de inconsistência §5.1) |
| Cor do badge de aba     | `atrasadas>0` na aba atrasadas → `destructive`; ativa → `primary-text`/`primary/0.16`; demais → `muted`                                                                       |
| Banner de atrasada      | visível se `atrasadas>0 && tab≠'atrasadas' && tab≠'feitas'`                                                                                                                   |
| Ícone/tint da atividade | por `type` no mapa `TYPE`; tipo fora do mapa → `_default` (estrela, neutro)                                                                                                   |
| Pill "Alta"             | visível se `prio==='alta' && !done`                                                                                                                                           |
| Cor do "quando"         | `overdue` → `destructive`; senão `muted-foreground`                                                                                                                           |
| Título da atividade     | `done` → `muted-foreground` + `line-through`; senão `foreground` + sem deco                                                                                                   |
| Checkbox                | `done` → verde preenchido, sem clique; aberto → contorno, hover verde, `onClick=complete`                                                                                     |
| Concluir                | trava reentrância; `.senno-act-leaving` na hora; remove após **850ms**                                                                                                        |
| Lista por aba           | `feitas`→`done`; `todas`→`open`; demais→`open` por `bucket`                                                                                                                   |
| Empty                   | `items.length===0` no filtro → card tracejado + "Ver todas"                                                                                                                   |
| Dot do sino             | aparece se `unreadCount > 0`                                                                                                                                                  |
| Indicador de aba        | medido do tab ativo (`offsetLeft`/`offsetWidth`); `opacity` 0→1 após 1ª medição; re-mede no `fonts.ready` e em cada update                                                    |

---

## 12. Dados de exemplo (fonte da verdade)

### Pastas / cargos (`roleDefs`, 6 — padrão selecionado = índice 0)

| #   | Label                     | `dot` (cor)                    |
| --- | ------------------------- | ------------------------------ |
| 0   | LuCorreia Estética (você) | `hsl(var(--primary))`          |
| 1   | Atendente (teste)         | `hsl(217 80% 58%)`             |
| 2   | Financeiro (teste)        | `hsl(142 58% 44%)`             |
| 3   | Gerente (teste)           | `hsl(262 52% 58%)`             |
| 4   | Sem cargo (teste)         | `hsl(var(--muted-foreground))` |
| 5   | Todos                     | `hsl(var(--muted-foreground))` |

### Atividades abertas (`open`, 11) — `{ bucket, type, title, patient, when, who, prio, overdue }`

| #   | bucket    | tipo        | título                                 | paciente/detalhe     | quando       | who | prio               |
| --- | --------- | ----------- | -------------------------------------- | -------------------- | ------------ | --- | ------------------ |
| 1   | atrasadas | Ligação     | Ligar para Patrícia Nunes              | Retorno de avaliação | Venceu ontem | HC  | **alta** · overdue |
| 2   | hoje      | Tarefa      | Confirmar agendamento de Bruno Almeida | Botox — full face    | Hoje · 14:00 | AT  | normal             |
| 3   | hoje      | Reunião     | Reunião de equipe semanal              | Sala 2 · toda equipe | Hoje · 17:00 | HC  | normal             |
| 4   | hoje      | Mensagem    | Enviar orçamento para Rafael Souza     | Lead via Instagram   | Hoje · 18:30 | FN  | **alta**           |
| 5   | hoje      | Nota        | Anotar preferências de Mariana Costa   | Ficha clínica        | Hoje · 12:00 | HC  | normal             |
| 6   | semana    | E-mail      | Enviar pós-venda para Beatriz Lima     | Botox                | Qua · 13:00  | FN  | normal             |
| 7   | semana    | Aniversário | Parabenizar aniversariantes            | 5 pacientes          | Dom · 09:00  | AT  | normal             |
| 8   | semana    | Tarefa      | Follow-up pós-procedimento             | Mariana Costa        | Qui · 10:00  | AT  | normal             |
| 9   | semana    | Ligação     | Ligar para lead Anderson Pereira       | Avaliação            | Sex · 11:00  | AT  | normal             |
| 10  | semana    | Reunião     | Revisar metas do mês                   | Gerência             | Sex · 16:00  | GR  | normal             |
| 11  | semana    | Tarefa      | Cobrança de Camila Ribeiro             | Microagulhamento     | Sáb · 09:00  | FN  | normal             |

(→ `hoje: 4`, `semana: 6`, `atrasadas: 1`, `todas: 11`.) Item 7 "Aniversário" usa o ícone `_default` (estrela).

### Atividades concluídas (`done`, 6 — aba Feitas) — `{ type, title, patient, when, who }`

| #   | tipo     | título                                | detalhe         | quando        | who |
| --- | -------- | ------------------------------------- | --------------- | ------------- | --- |
| 1   | Ligação  | Confirmação de retorno — Beatriz Lima | Botox           | Ontem · 15:20 | AT  |
| 2   | Tarefa   | Cadastro de novo paciente             | Marcos Vinícius | Ontem · 11:05 | FN  |
| 3   | Mensagem | Lembrete de consulta enviado          | Helena Martins  | Seg · 09:40   | AT  |
| 4   | Reunião  | Briefing de campanha Meta Ads         | Marketing       | Seg · 14:00   | GR  |
| 5   | Ligação  | Pesquisa de satisfação                | Carla Mendes    | Sex · 16:30   | AT  |
| 6   | Tarefa   | Fechamento financeiro semanal         | Financeiro      | Sex · 18:00   | FN  |

### Notificações (5 — idênticas ao Dashboard)

```
1 lead    "Novo lead"                — Mariana Alves · Instagram        — agora  — não-lida
2 money   "Pagamento confirmado"     — R$ 1.200 · Botox · Camila Souza  — 8 min  — não-lida
3 agenda  "Agendamento confirmado"   — Patrícia Lima · amanhã às 14h    — 40 min — não-lida
4 alert   "Tarefa atrasada"          — Retornar ligação · Rafael Dias   — 1 h    — lida
5 agenda  "Novo agendamento online"  — Beatriz Ramos · Limpeza de pele  — 3 h    — lida
```

(→ `unreadCount = 3`.)

---

## 13. Props do componente & integração com o App

**Props do Atividades** (`data-props`, `$preview` 1440×900):

- `defaultTheme`: enum `light | dark` (default `light`).

**Estado interno** (protótipo): `theme`, `notifOpen`, `notifs[]`, `role` (índice da pasta, default 0), `tab` (default `'hoje'`), `completing{}` (em conclusão), `removed{}` (já concluídas nesta sessão), `bellRing`, `indLeft`/`indWidth` (medição do indicador de aba).

**Callbacks/props que o App injeta** (integração real):

- `theme` (controlado externamente), `onToggleTheme()`.
- `onNavigate(labelDaRota)` — usado pela nav da sidebar (`item.onClick` → `onNavigate(label)`).
- `onNewLead()` — botão "Novo lead" da topbar.

**A ligar no real** (não implementado no protótipo, mas esperado pela tela):

- Ação do botão **"Nova atividade"** (abrir criação de atividade).
- Persistir conclusão (o protótipo só remove da UI por 850ms/sessão).
- Fonte de dados real para pastas/cargos, abertas, concluídas e contadores (com `feitas` derivado, não literal).

---

## 14. Checklist específico da tela

- [ ] Chrome reaproveitado (sidebar 236px + topbar), com **Atividades** ativo (`primary-text` + `bg-accent`) e `<h1>` "Atividades".
- [ ] Busca da topbar na **variante simplificada** (campo colapsável, **sem popover** de resultados).
- [ ] Só tokens semânticos no chrome; conferir dark mode em todas as superfícies. Tints de tipo (Reunião/Ligação/E-mail/Nota/Mensagem) usam **HSL fixo** de propósito — ok.
- [ ] Dois dourados nos papéis certos: chip de pasta ativo e botões = `bg-primary`+`primary-foreground`; nav ativo / folder-icon / badge ativo = `primary-text`.
- [ ] `tabular-nums` nos badges de contagem das abas e no contador do sino.
- [ ] Chip de pastas: selecionada sempre visível à esquerda; demais deslizam à direita no hover (hitbox = container inteiro); escolher aplica e faz `blur`.
- [ ] Abas underline: indicador 2px **medido**, **corta no fim da última aba**; badge com 3 cores (atrasadas destructive / ativa primary-text / neutro muted).
- [ ] Botão "Nova atividade" **dentro do conteúdo**, alinhado à direita da barra de abas.
- [ ] Banner de atrasada só quando há atrasadas e fora das abas Atrasadas/Feitas; tile com halo pulsante; "Ver atrasadas" leva à aba.
- [ ] Ícone por tipo correto; **tipo personalizado → estrela** (`_default`).
- [ ] Pill "Alta" só em `prio alta` e não-concluída; "quando" em `destructive` quando overdue.
- [ ] Aba "Feitas": título riscado + check verde preenchido, sem interação.
- [ ] Concluir: hover verde no check, pop do check, linha desliza p/ direita e colapsa (delays escalonados), remoção após 850ms, recálculo de contadores.
- [ ] 4 estados: carregado (lista) · skeleton (4 linhas shimmer) · vazio (card tracejado + "Ver todas") · erro (inline `destructive`, nunca `alert()`).
- [ ] Sino: dot se não-lidas, shake no clique, popover com "Marcar todas como lidas" e linhas tintadas por tipo.
- [ ] Toggle de tema: sol no claro / lua no escuro, swap com rotação+fade.
- [ ] Corrigir a inconsistência do contador "Feitas" (derivar da fonte de dados: badge deve bater com a lista).
