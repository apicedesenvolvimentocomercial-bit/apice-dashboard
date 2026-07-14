# Configurações — Handoff detalhado (item a item)

> Especificação granular da tela **Configurações** (`Configurações.dc.html`).
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
> **⚠️ Nota de escopo.** O pedido original mencionava "abas Hoje/Semana/Atrasadas/Todas/Feitas" e "banner de atrasada" — esses elementos são da tela **Atividades**, não desta. **Configurações não usa abas com underline nem contadores.** A navegação aqui é uma **barra de busca de configuração + chips de categoria** (10 chips, incluindo "Todas"). Este doc documenta a tela **real**. Como pedido, **cada categoria é tratada como uma tela individual** (seções 7 a 15) — esta é a tela mais complexa do produto.
>
> **Legenda de tokens usados abaixo (do `design.md`):**
> `--card` superfície · `--background` fundo app · `--foreground` texto · `--muted`/`--muted-foreground` neutro · `--border`/`--input` bordas · `--accent` hover · `--primary` dourado-superfície · `--primary-foreground` texto escuro sobre dourado · `--primary-text` dourado-texto · `--ring` foco · `--destructive` erro · `--ok`/`--ok-bg` sucesso · `--warn`/`--warn-bg` aviso · `--shadow`/`--shadow-a` sombra tingida.

---

## 0. Índice

1. Estrutura geral da página (esqueleto + medidas de layout)
2. Sidebar (236px) — item a item
3. Topbar (header) — título + busca + tema + sino + Novo lead
4. Barra de busca de configuração + chips de categoria (a "toolbar/nav")
5. Shell de seção (card padrão reutilizado por todas as categorias)
6. Modo "Todas" (empilhamento de todas as seções)
7. **Tela: Perfil**
8. **Tela: Aparência**
9. **Tela: Clínica**
10. **Tela: Pagamento no crédito**
11. **Tela: Webhooks**
12. **Tela: Régua de retenção**
13. **Tela: Pessoas**
14. **Tela: Cargos e permissões**
15. **Tela: Usuários da clínica**
16. Selects, popovers e toggles (detalhe transversal)
17. Catálogo de animações (keyframes + transições)
18. Thresholds & lógica condicional (tabela única)
19. Dados de exemplo (fonte da verdade)
20. Props do componente & integração com o App
21. Ordem de build sugerida + checklist

---

## 1. Estrutura geral da página

### Container raiz

- Elemento `.senno` com `data-theme` (`light|dark`) e `data-font` (`inter`).
- `background: hsl(var(--background))`, `color: hsl(var(--foreground))`, `height: 100vh`, `overflow: hidden`, `line-height: 1.45`, `font-family: Inter`.
- `-webkit-font-smoothing: antialiased`, `box-sizing: border-box` global, `body { margin: 0 }`.

### Moldura da app (shell full-bleed)

`data-screen-label="Configurações"` — `width:100%; height:100%; min-height:0; display:flex; overflow:hidden; background:hsl(var(--background))`.

Layout em duas colunas via flex:

```
[ SIDEBAR 236px fixa ] [ MAIN flex:1 -> (TOPBAR fixo) + (BODY rolável) ]
```

- **MAIN**: `flex:1; min-width:0; min-height:0; display:flex; flex-direction:column`.
- **BODY rolável**: `flex:1; min-height:0; overflow-y:auto; padding:22px 26px`. **Só o body rola** — sidebar e topbar ficam fixos.
- **Coluna de conteúdo:** dentro do body, um wrapper único `max-width:940px; margin:0 auto; width:100%`. **Configurações é uma coluna centralizada de ~940px** — não é a largura cheia dos dashboards.

### Ordem vertical do body

1. Barra de busca de configuração + chips de categoria (bloco `margin-bottom:22px`).
2. **Uma** seção de conteúdo (a categoria ativa) — ou **todas** empilhadas no modo "Todas" (ver §6).

### Breakpoints responsivos (media queries globais)

- `@media (max-width:1024px)`: `.senno-2col { grid-template-columns:1fr }` e `.senno-3col { grid-template-columns:1fr 1fr }`.
- `@media (max-width:660px)`: `.senno-3col { grid-template-columns:1fr }`.
- Usados nos grids de campos do Perfil (2col + 3col), Clínica (2col).

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

Cada item = `<a href="#">` (no real: `<Link>`), estrutura:

- `display:flex; align-items:center; gap:11px; padding:8px 10px; border-radius:8px; font-size:13.5px; text-decoration:none`.
- Ícone: `18×18px`, `flex:none`.
- Label: `flex:1; white-space:nowrap`.
- **Hover** (qualquer item): `background:hsl(var(--accent))`.

Estados por item:
| Estado | `font-weight` | texto/ícone (`color`) | `background` |
|---|---|---|---|
| Inativo | 500 | `hsl(var(--muted-foreground))` | `transparent` |
| **Ativo** (Configurações) | 600 | `hsl(var(--primary-text))` | `hsl(var(--accent))` |

**Ordem fixa da nav (12 itens, menu plano, sem seções):**
`Dashboard` · `Atividades` · `Agenda` · `Funil` · `Pacientes` · `Financeiro` · `Metas` · `Insights` · `Procedimentos` · `Exportações` · `Notificações` · **`Configurações`** (ativo).

Ícones (set stroke-24, lucide no real): grid, activity, calendar, funnel, users, money(rect+circle), target, bulb, syringe, download, bell, settings. Clique chama `onNavigate(label)` (`e.preventDefault()` + `props.onNavigate(label)`).

### 2.3 Rodapé (usuário)

- `margin-top:auto` (empurra p/ base). Card: `display:flex; align-items:center; gap:10px; padding:10px; border-radius:10px; background:hsl(var(--muted))`.
- Avatar "HC": `32×32px; border-radius:99px; background:hsl(var(--primary)/0.2); color:hsl(var(--primary-text)); font-size:12.5px; font-weight:600`.
- Nome "Dra. Helena Costa" `12.5px / 600` (trunca); cargo "Proprietária" `11px muted`.

---

## 3. Topbar (header)

`header`: `flex:none; display:flex; align-items:center; gap:16px; padding:14px 24px; border-bottom:1px solid hsl(var(--border)); background:hsl(var(--card))`.

- **Esquerda** (`flex:1; min-width:0`): `<h1>` "Configurações" — `font-size:clamp(22px, 0.5vw + 18px, 27px); font-weight:600; letter-spacing:-0.01em; margin:0`.
- **Direita**: `display:flex; align-items:center; gap:9px` — na ordem: **Busca → Tema → Sino → Novo lead**.

### 3.1 Busca "Buscar paciente…" (colapsável)

**Comportamento:** ícone de lupa 38px que **expande da direita para a esquerda** até 240px no hover/focus.

> ⚠️ **Diferença em relação ao Dashboard:** aqui esta busca da topbar é **decorativa** — o `<input>` não tem `onInput`/state nem popover de resultados. Reproduza a mecânica de expandir/colapsar; a busca funcional desta tela é a **de configuração**, no corpo (§4). No real, você pode ligá-la ao mesmo popover global de pacientes do Dashboard se quiser paridade — mas o protótipo desta tela não abre popover.

Marcação/CSS (classe `senno-search`):

- Wrapper `.senno-search`: `position:relative; width:38px; height:38px; flex:none`.
- Caixa `.senno-search-box`: `position:absolute; top:0; right:0; height:38px; width:38px` (colapsado) `; display:flex; align-items:center; gap:8px; padding:0 11px; border-radius:9px; border:1px solid hsl(var(--border)); background:hsl(var(--background)); color:hsl(var(--muted-foreground)); font-size:12.5px; overflow:hidden; white-space:nowrap; cursor:pointer`.
- **Transição:** `width .34s cubic-bezier(.4,0,.2,1), background .22s, border-color .22s, box-shadow .22s`.
- **Expandido** (`:hover` no wrapper **ou** `:focus-within` na caixa): `width:240px; border-color:hsl(var(--input)); cursor:text`.
- **Foco** (`:focus-within`): `border-color:hsl(var(--ring)); box-shadow:0 0 0 3px hsl(var(--ring)/0.18)`.
- Ícone lupa `15×15px`, `flex:none`. Input: `border:none; outline:none; background:transparent; font-size:12.5px; color:foreground`, placeholder "Buscar paciente…".

### 3.2 Toggle de tema (sol/lua)

- Botão `.senno-theme-btn`: `38×38px; border-radius:9px; border:1px solid border; background:background; color:foreground; position:relative; overflow:hidden`; hover `background:accent`. `title` = "Modo escuro"/"Modo claro" (via `themeTitle`, pelo tema atual).
- Dois ícones sobrepostos `.senno-theme-ico` (`position:absolute; top:50%; left:50%; width:17px; height:17px; margin:-8.5px 0 0 -8.5px`), com `transition: transform .5s cubic-bezier(.34,1.3,.5,1), opacity .35s`.
- **Estados:**
  | | Light | Dark |
  |---|---|---|
  | Sol (`.senno-theme-sun`) | `rotate(0) scale(1)`, `opacity:1` | `rotate(90deg) scale(.35)`, `opacity:0` |
  | Lua (`.senno-theme-moon`) | `rotate(-90deg) scale(.35)`, `opacity:0` | `rotate(0) scale(1)`, `opacity:1` |
- Clique → `toggleTheme`: se o App injetar `onToggleTheme`, chama-o; senão alterna local (`theme` + espelha em `appearance`).

> **Ligação com Aparência (§8):** o toggle da topbar e o segmented de Aparência controlam o **mesmo tema**. Trocar o tema aqui deve refletir na seção Aparência e vice-versa (o protótipo mantém `theme` e `appearance` em sincronia).

### 3.3 Sino de notificações (`senno-notif`)

- Wrapper `position:relative`. Botão `38×38px; border-radius:9px; border; background:background; color:foreground`; hover `accent`; `title="Notificações"`.
- Ícone sino `17×17px; transform-origin:top center`.
- **Dot de não-lidas** (se `unreadCount > 0`): `position:absolute; top:7px; right:8px; width:7px; height:7px; border-radius:99px; background:hsl(var(--destructive)); border:1.5px solid hsl(var(--card))`.
- **Shake ao clicar:** aplica classe `senno-bell-ring-a` → keyframes `senno-bell-ring .7s cubic-bezier(.36,.07,.19,.97)` (§17). Removida no `animationend`.

**Popover de notificações** (quando `notifOpen` — este é **funcional**, idêntico ao Dashboard):

- Overlay `fixed inset:0 z:40` (clique fora fecha). Painel: `position:absolute; top:46px; right:0; width:362px; background:hsl(var(--popover)); border:1px solid border; border-radius:12px; box-shadow:0 16px 40px -12px hsl(var(--shadow)/calc(var(--shadow-a)*3.5)); z-index:50; overflow:hidden`.
- **Cabeçalho:** "Notificações" (`clamp(13…14.3)/600`) + pill de contador de não-lidas (`11px/600; padding:1px 7px; radius:99px; background:hsl(var(--primary)/0.16); color:primary-text; tabular-nums`) só se há não-lidas. À direita, "Marcar todas como lidas" (`11.5px/600 primary-text`, hover underline) — só se há não-lidas.
- **Lista:** `padding:0 6px 6px; max-height:344px; overflow-y:auto`.
- **Item** (`<button>`): `display:flex; align-items:flex-start; gap:11px; padding:10px 8px; border-radius:8px`; `background` = lida `transparent` / não-lida `hsl(var(--primary)/0.05)`; hover `accent`.
  - Ícone tile `32×32px; border-radius:99px`, cor por tipo (tabela abaixo). Ícone interno `15×15px`.
  - Título `12.5px`, `font-weight` = não-lida 600 / lida 500. Sub `11.5px muted` (trunca).
  - À direita: hora `10.5px muted` (nowrap) + dot `7×7px; radius:99px; background:primary` se não-lida.
- **Rodapé:** centralizado, "Ver todas as notificações" (`12px/600 primary-text`).

**Tints por tipo** (`iconBg` / `iconColor`):
| tipo | ícone | fundo | cor |
|---|---|---|---|
| `lead` | users | `primary/0.16` | `primary-text` |
| `money` | money | `ok-bg` | `ok` |
| `agenda` | calendar | `accent` | `muted-foreground` |
| `alert` | alert | `destructive/0.14` | `destructive` |

Clique num item → marca aquele como lido. "Marcar todas" → todas lidas. Abrir o sino também dispara o shake.

### 3.4 Botão "Novo lead"

- `height:38px; padding:0 15px; border-radius:9px; border:none; background:hsl(var(--primary)); color:hsl(var(--primary-foreground)); font-size:clamp(13px, 0.14vw + 11.2px, 14.3px); font-weight:600; display:flex; align-items:center; gap:7px`; hover `filter:brightness(1.05)`.
- Ícone `+` `15×15px`. Clique → `onNewLead`.

---

## 4. Barra de busca de configuração + chips de categoria

Bloco no topo do corpo, `margin-bottom:22px`. **É a "toolbar/nav" desta tela** (equivalente às abas underline das outras telas, mas em formato de busca + chips).

### 4.1 Input de busca de configuração

- Wrapper: `position:relative; width:340px; max-width:100%`.
- Ícone lupa: `position:absolute; left:13px; top:50%; transform:translateY(-50%); width:15px; height:15px; color:muted-foreground`.
- Input `.senno-input`: `width:100%; height:42px; padding:0 12px 0 37px; border-radius:10px; border:1px solid hsl(var(--input)); background:hsl(var(--card)); color:foreground; font-size:clamp(13px, 0.14vw + 11.2px, 14.3px); outline:none; transition:border-color .15s, box-shadow .15s`.
- **Foco** (`.senno-input:focus`): `border-color:hsl(var(--ring)); box-shadow:0 0 0 3px hsl(var(--ring)/0.18)`. Placeholder "Buscar configuração…" (`color:muted-foreground; opacity:.7`).
- `onInput` → `searchQuery = valor`. **Filtra os chips em tempo real** (não filtra o conteúdo da seção, só a lista de chips).

### 4.2 Chips de categoria

- Linha: `display:flex; flex-wrap:wrap; gap:8px; margin-top:14px`.
- Chip (`chipBase`): `display:inline-flex; align-items:center; gap:8px; height:38px; padding:0 15px; border-radius:10px; font-size:clamp(13px, 0.14vw + 11.2px, 14.3px); white-space:nowrap; cursor:pointer; transition:background .15s, border-color .15s, color .15s`. Ícone interno `15×15px; flex:none`.
- **Estados:**
  | Estado | `background` | `color` | `border` | `font-weight` | hover |
  |---|---|---|---|---|---|
  | **Ativo** (`section===k`) | `hsl(var(--primary))` | `hsl(var(--primary-foreground))` | `1px hsl(var(--primary))` | 600 | `filter:brightness(1.05)` |
  | Inativo | `hsl(var(--card))` | `hsl(var(--muted-foreground))` | `1px hsl(var(--border))` | 500 | `background:hsl(var(--accent)); color:hsl(var(--foreground))` |
- Clique → `section = k`.

**10 chips, nesta ordem exata** (`chave / rótulo / ícone`):
| Chave | Rótulo | Ícone |
|---|---|---|
| `todas` | Todas | grid |
| `perfil` | Perfil | user |
| `aparencia` | Aparência | palette |
| `clinica` | Clínica | building |
| `pagamento` | Pagamento no crédito | card |
| `webhooks` | Webhooks | plug |
| `retencao` | Régua de retenção | message |
| `pessoas` | Pessoas | users |
| `cargos` | Cargos e permissões | shield |
| `usuarios` | Usuários da clínica | user-check |

- **Categoria padrão:** `todas` (mostra todas as seções empilhadas — ver §6).
- **Filtro por busca:** `chips = cats.filter(([k,label]) => !q || label.toLowerCase().includes(q))`, com `q = searchQuery.trim().toLowerCase()`. O chip "Todas" some se não casar com a busca.

### 4.3 Empty state da busca

- Se `chips.length === 0` (`noChips`): `margin-top:16px; font-size:clamp(13…14.3); color:muted-foreground` → texto **`Nenhuma configuração encontrada para "{searchQuery}".`** (com aspas curvas “ ”).

---

## 5. Shell de seção (card padrão)

Toda categoria renderiza dentro de um wrapper `display:flex; flex-direction:column; gap:14px; padding-bottom:10px` e usa o mesmo **card de seção**:

- **Card:** `background:hsl(var(--card)); border:1px solid hsl(var(--border)); border-radius:14px; padding:24px 26px; box-shadow:0 1px 2px hsl(var(--shadow)/var(--shadow-a))`.
- **Cabeçalho do card** (bloco no topo, `margin-bottom` varia 18–20px por seção):
  - `<h2>`: `font-size:16.5px; font-weight:600; letter-spacing:-0.01em; margin:0`.
  - `<p>` de apoio: `margin:5px 0 0; font-size:clamp(13px, 0.14vw + 11.2px, 14.3px); color:muted-foreground; line-height:1.5` (1.55 no Webhooks/Pagamento/Retenção).
- **Label de campo (padrão):** `display:block; font-size:12px; font-weight:600; color:muted-foreground; margin-bottom:7px`.
- **Input de campo (padrão)** `.senno-input`: `width:100%; height:40px; padding:0 12px; border-radius:9px; border:1px solid hsl(var(--input)); background:hsl(var(--background)); color:foreground; font-size:clamp(13px, 0.14vw + 11.2px, 14.3px); outline:none; transition:border-color .15s, box-shadow .15s`. Foco = anel `ring` (§4.1).
- **Botão de ação da seção (primário):** `height:40px; padding:0 18px; border-radius:9px; border:none; background:hsl(var(--primary)); color:hsl(var(--primary-foreground)); font-size:clamp(13…14.3); font-weight:600`; hover `filter:brightness(1.05)`. Fica **dentro do card**, no rodapé, separado por `border-top:1px solid border` (padrão da marca: ação da página no conteúdo, não no header).

> As nove seções abaixo são documentadas **como telas individuais**. Cada uma corresponde a um chip; no modo "Todas" todas aparecem empilhadas na mesma ordem dos chips.

---

## 6. Modo "Todas" (`section === 'todas'`)

Quando a categoria ativa é **Todas**, a flag `all = true` e **todas as nove seções renderizam empilhadas**, na ordem dos chips: Perfil → Aparência → Clínica → Pagamento no crédito → Webhooks → Régua de retenção → Pessoas → Cargos e permissões → Usuários da clínica.

- Cada `sc-if` de seção usa a regra `isX = (section === 'x') || all`. Ou seja: cada categoria mostra **só a sua** seção; "Todas" mostra **o conjunto**.
- Não há separadores extras entre seções no modo Todas além do próprio `gap:14px` interno de cada wrapper e do espaçamento natural entre cards.
- No produto real, "Todas" pode virar uma página de índice rolável (com âncoras por seção) ou manter o empilhamento — o protótipo empilha.

---

## 7. Tela: Perfil (`section === 'perfil'`)

**Card único.** Cabeçalho `margin-bottom:20px`:

- `<h2>` **"Perfil"**.
- `<p>` "Atualize seus dados de acesso e como seu nome aparece para a equipe."

### 7.1 Grid de identidade (`senno-2col`)

`display:grid; grid-template-columns:1fr 1fr; gap:16px 18px` (colapsa p/ 1 coluna ≤1024px):
| Campo | Tipo | `defaultValue` / placeholder |
|---|---|---|
| Nome pessoal | text | `Helena Costa` |
| E-mail para visualização | email | `helena@bellavie.com.br` |

### 7.2 Bloco "Alterar senha"

Separado por `margin-top:24px; padding-top:22px; border-top:1px solid border`.

- Sub-cabeçalho: `display:flex; align-items:center; gap:8px; margin-bottom:16px` → ícone **lock** `16×16px muted` + "Alterar senha" `13.5px/600`.
- Grid `senno-3col`: `grid-template-columns:1fr 1fr 1fr; gap:16px 18px` (colapsa p/ 2 col ≤1024px, 1 col ≤660px):
  | Campo | Tipo | placeholder |
  |---|---|---|
  | Senha atual | password | `••••••••` |
  | Nova senha | password | `Mínimo 8 caracteres` |
  | Confirmar nova senha | password | `Repita a nova senha` |

### 7.3 Rodapé de ação

`display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:24px; padding-top:20px; border-top:1px solid border`:

- Esquerda: `12.5px muted` "Alterações de nome e senha são aplicadas imediatamente."
- Direita: botão primário **"Salvar alterações"** (`flex:none`).

---

## 8. Tela: Aparência (`section === 'aparencia'`)

**Card único.** Cabeçalho `margin-bottom:18px`:

- `<h2>` **"Aparência"**.
- `<p>` "Escolha o tema da interface. “Sistema” acompanha as preferências do seu dispositivo."

### 8.1 Segmented de tema

- Trilho: `display:inline-flex; gap:6px; background:hsl(var(--muted)); border:1px solid border; border-radius:12px; padding:5px`.
- **Botão do segmento (`segBase`):** `display:inline-flex; align-items:center; gap:7px; height:36px; padding:0 15px; border-radius:9px; font-size:12.5px; font-weight:600; border:none; cursor:pointer; transition:background .15s, color .15s`. Ícone `15×15px`.
  - **Ativo** (`appearance===v`): `background:hsl(var(--primary)); color:hsl(var(--primary-foreground))`; hover `filter:brightness(1.05)`.
  - **Inativo:** `background:transparent; color:hsl(var(--muted-foreground))`; hover `color:hsl(var(--foreground))`.

> ⚠️ **Este segmented NÃO usa a pílula deslizante do Dashboard.** É troca instantânea de `background` por botão (transição só de cor/fundo, `.15s`). Mesma mecânica dos segmenteds de Régua de retenção (§12). Não recrie o `translateX`.

3 opções (`valor / rótulo / ícone`):
| Valor | Rótulo | Ícone |
|---|---|---|
| `light` | Claro | sun |
| `dark` | Escuro | moon |
| `system` | Sistema | monitor |

### 8.2 Lógica de tema

`setAppearance(v)` → `{ appearance: v, theme: v === 'system' ? (tema atual) : v }`.

- Escolher **Claro/Escuro** troca o `appearance` **e** aplica o tema em toda a UI (`theme`).
- Escolher **Sistema** grava `appearance='system'` mas **mantém o `theme` atual** (o protótipo não lê `prefers-color-scheme`; no real, ligue "Sistema" a `matchMedia('(prefers-color-scheme: dark)')`).
- O toggle sol/lua da topbar espelha esse estado (ver §3.2).

---

## 9. Tela: Clínica (`section === 'clinica'`)

**Card único.** Cabeçalho `margin-bottom:20px`:

- `<h2>` **"Clínica"**.
- `<p>` "Dados cadastrais usados em documentos, recibos e integrações fiscais."

### 9.1 Grid de campos (`senno-2col`, `gap:16px 18px`)

| Campo             | Span                     | Tipo         | `defaultValue`                                      | Obs.                                                                |
| ----------------- | ------------------------ | ------------ | --------------------------------------------------- | ------------------------------------------------------------------- |
| Nome da clínica   | `1 / -1` (largura cheia) | text         | `Clínica Bellavie Estética`                         |                                                                     |
| E-mail            | 1 col                    | email        | `contato@bellavie.com.br`                           |                                                                     |
| Telefone          | 1 col                    | text         | `(41) 99631-2088`                                   |                                                                     |
| Cidade            | 1 col                    | text         | `Curitiba`                                          |                                                                     |
| Estado            | 1 col                    | **select**   | `PR`                                                | ver opções abaixo                                                   |
| Regime tributário | 1 col                    | **select**   | `simples`                                           | ver opções abaixo                                                   |
| CNAE              | 1 col                    | text         | `9602-5/02`                                         | `font-variant-numeric:tabular-nums`                                 |
| Observações       | `1 / -1`                 | **textarea** | placeholder "Informações internas sobre a clínica…" | `rows:3`, `resize:vertical`, `line-height:1.5`, `padding:10px 12px` |

**Select "Estado"** — opções (`value / label`): `PR`/Paraná · `SP`/São Paulo · `RJ`/Rio de Janeiro · `MG`/Minas Gerais · `RS`/Rio Grande do Sul · `SC`/Santa Catarina · `BA`/Bahia.
**Select "Regime tributário"** — `simples`/Simples Nacional · `presumido`/Lucro Presumido · `real`/Lucro Real · `mei`/MEI.

Estilo de select nativo → §16.1.

### 9.2 Rodapé de ação

`display:flex; justify-content:flex-end; margin-top:22px; padding-top:20px; border-top:1px solid border` → botão primário **"Salvar dados da clínica"**.

---

## 10. Tela: Pagamento no crédito (`section === 'pagamento'`)

**Card único.** Cabeçalho `margin-bottom:20px`:

- `<h2>` **"Pagamento no crédito"**.
- `<p>` (`line-height:1.5`) "Define como as vendas no crédito entram no financeiro, conforme seu contrato com a adquirente (maquininha)."

### 10.1 Bloco de forma de recebimento (`max-width:540px`)

- Label "Forma de recebimento".
- **Select** `value={creditMode}` `onChange` — **height:44px** (mais alto que os campos padrão), `padding:0 34px 0 13px; radius:9px; border:input; bg:background; font-size:13.5px; appearance:none`; chevron overlay (§16.1). Opções:
  | `value` | Rótulo |
  |---|---|
  | `repasse` | Recebo conforme o cliente paga |
  | `antecipacao` | Recebo à vista, com taxa de antecipação |
- **Texto de ajuda** (`creditHelp`): `margin:10px 0 0; font-size:12.5px; color:muted-foreground; line-height:1.55`. Muda com o modo:
  - `antecipacao` → "As vendas no crédito entram no financeiro como recebidas à vista, já descontada a taxa de antecipação da adquirente."
  - `repasse` → "As parcelas entram no financeiro na data em que a adquirente repassa cada uma, acompanhando o pagamento do cliente."

### 10.2 Campo condicional "Taxa de antecipação" (`showFee`)

Aparece **só se `creditMode === 'antecipacao'`**. Bloco `margin-top:20px; padding-top:20px; border-top:1px dashed border; max-width:260px`:

- Label "Taxa de antecipação (% a.m.)".
- Wrapper `position:relative`: input `defaultValue "2,99"` — `height:40px; padding:0 34px 0 12px; radius:9px; border:input; bg:background; font-variant-numeric:tabular-nums`.
- Sufixo **"%"**: `position:absolute; right:13px; top:50%; transform:translateY(-50%); font-size:clamp(13…14.3); font-weight:600; color:muted-foreground; pointer-events:none`.

### 10.3 Rodapé de ação

`justify-content:flex-end; margin-top:22px; padding-top:20px; border-top` → botão primário **"Salvar"**.

---

## 11. Tela: Webhooks (`section === 'webhooks'`)

**Card único.** Cabeçalho `margin-bottom:20px`:

- `<h2>` **"Webhooks"**.
- `<p>` (`line-height:1.55`): "Recebe leads das integrações (WhatsApp, Meta Ads, Google Ads). O token autentica a requisição e vincula o lead a esta clínica — envie-o no header **`x-webhook-secret`**."
  - O trecho `x-webhook-secret` é um `<code>`: `font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; background:hsl(var(--muted)); padding:1.5px 6px; border-radius:5px; color:hsl(var(--foreground))`.

### 11.1 Linha do token

`display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; background:hsl(var(--background)); border:1px solid border; border-radius:11px; padding:14px 16px`:

- **Esquerda** (`min-width:0`): rótulo "Token de autenticação" `11.5px/600 muted; margin-bottom:5px` + valor **`whk_live_8f3a2b91c7d64e05`** em `ui-monospace; font-size:clamp(13…14.3); color:foreground; letter-spacing:0.02em`.
- **Direita** (`display:flex; gap:8px; flex:none`), dois botões `height:36px; padding:0 13px; border-radius:9px; font-size:12.5px; font-weight:600; display:inline-flex; align-items:center; gap:7px`:
  - **Rotacionar** — `border:1px solid border; background:card; color:foreground`; hover `background:accent`. Ícone **refresh** `14×14px` `color:primary-text`. Clique (`rotateToken`) → gera novo token `whk_live_` + **16 dígitos hex aleatórios** (`0-9a-f`).
  - **Revogar** — `border:1px solid hsl(var(--destructive)/0.5); background:transparent; color:destructive`; hover `background:hsl(var(--destructive)/0.1)`. Ícone **trash** `14×14px`. Clique (`revokeToken`) → token vira **"— revogado —"**.

### 11.2 Lista de endpoints

`margin-top:22px`. Rótulo "Endpoints" `12px/600 muted; margin-bottom:10px`. Lista `display:flex; flex-direction:column; gap:9px`.

Cada endpoint = `display:flex; align-items:center; gap:14px; background:hsl(var(--background)); border:1px solid border; border-radius:11px; padding:12px 14px`:

- **Tile de ícone:** `34×34px; border-radius:9px; background:hsl(var(--primary)/0.14); color:primary-text`; ícone interno `16×16px`.
- **Centro** (`min-width:0; flex:1`):
  - Linha `display:flex; align-items:baseline; gap:8px`: nome `clamp(13…14.3)/600` + descrição `11.5px muted`.
  - URL `ui-monospace; font-size:11.5px; color:muted-foreground; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px`.
- **Botão Copiar** (`flex:none`): `height:34px; padding:0 12px; border-radius:8px; font-size:12px; font-weight:600; display:inline-flex; align-items:center; gap:6px`; ícone `14×14px`; hover `filter:brightness(0.98)`; `title="Copiar link"`.

**3 endpoints** (`chave · nome · descrição · ícone · URL`):
| Chave | Nome | Descrição | Ícone | URL |
|---|---|---|---|---|
| `wa` | WhatsApp | Cloud API | whats(message) | `https://api.senno.app/webhooks/wa/8f3a2b` |
| `meta` | Meta Ads | Lead Ads | users | `https://api.senno.app/webhooks/meta/8f3a2b` |
| `google` | Google Ads | Lead Form | target | `https://api.senno.app/webhooks/gads/8f3a2b` |

**Estado do botão Copiar** (por endpoint, `copiedId`):
| | Ícone | Rótulo | `background` | `color` | `border` |
|---|---|---|---|---|---|
| Padrão | copy | Copiar | `hsl(var(--card))` | `hsl(var(--foreground))` | `hsl(var(--border))` |
| **Copiado** | check | Copiado | `hsl(var(--ok-bg))` | `hsl(var(--ok))` | `hsl(var(--ok)/0.4)` |

- Clique (`onCopy`) → `navigator.clipboard.writeText(url)` (try/catch) + `copiedId = id`; reseta para o padrão em **1400ms** (só se ainda for aquele id). Só um endpoint por vez mostra "Copiado".

---

## 12. Tela: Régua de retenção (`section === 'retencao'`)

**Dois blocos:** o card de modo + a lista de modelos de mensagem (condicional).

### 12.1 Card "Modo de operação"

Cabeçalho `margin-bottom:18px`: `<h2>` **"Régua de retenção"** + `<p>` "Mantém pacientes ativos com follow-ups no momento certo."

- Label "Modo de operação" `margin-bottom:9px`.
- **Segmented** (mesmo `segBase` do §8.1 — troca instantânea, sem pílula), trilho `background:muted; border; radius:12px; padding:5px`. Opções (`valor / rótulo / ícone`):
  | Valor | Rótulo | Ícone |
  |---|---|---|
  | `manual` | Manual | edit |
  | `tarefas` | Por tarefas | user-check |
  | `automatico` | Automático | whats(message) |
  - **Padrão:** `tarefas`.
- **Texto de ajuda** (`retentionHelp`): `margin:11px 0 0; font-size:12.5px; color:muted; line-height:1.55`:
  - `manual` → "Nenhuma ação automática. Você registra os contatos de retenção manualmente."
  - `tarefas` → "O sistema cria tarefas para a equipe entrar em contato no momento certo."
  - `automatico` → "As mensagens abaixo são enviadas automaticamente pelo WhatsApp nos gatilhos definidos."

### 12.2 Modelos de mensagem (`showMessages` — só se `retentionMode !== 'manual'`)

- **Faixa de cabeçalho:** `display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:2px` → "Modelos de mensagem" `13.5px/600` + "Usados nos modos “Por tarefas” e “Automático”." `12px muted`.
- **Lista** `display:flex; flex-direction:column; gap:12px`. Cada card de mensagem:
  - Card: `background:card; border; border-radius:13px; padding:18px 20px; box-shadow:0 1px 2px hsl(var(--shadow)/var(--shadow-a)); opacity:{cardOpacity}` — **`opacity:1` se ativa, `0.66` se inativa**.
  - **Linha topo** (`display:flex; align-items:flex-start; justify-content:space-between; gap:14px`):
    - Esquerda: label `13.5px/600` + hint `12px muted; margin-top:2px`.
    - Direita (`<label>` `display:inline-flex; align-items:center; gap:8px; cursor:pointer; flex:none`): texto de estado `12px/600` (**"Ativa"** `color:primary-text` / **"Inativa"** `color:muted-foreground`) + **toggle switch** (§16.3).
  - **Grid de edição** (`display:grid; grid-template-columns:220px 1fr; gap:14px; margin-top:15px; align-items:start`):
    - **Apelido:** label `11.5px/600 muted; margin-bottom:6px` + input (`height:38px`) `defaultValue={m.apelido}`, placeholder "ex: sentimos sua falta".
    - **Conteúdo da mensagem:** label + textarea `rows:2; padding:9px 12px; resize:vertical; line-height:1.5`, placeholder "Escreva o conteúdo enviado ao paciente…".
  - **Rodapé** (`display:flex; justify-content:flex-end; margin-top:13px`): botão ghost **"Salvar mensagem"** `height:34px; padding:0 15px; border-radius:8px; border:1px solid border; background:card; color:foreground; font-size:12.5px; font-weight:600`; hover `background:accent`.

**5 modelos** (`chave · label · hint · apelido · ativa?`):
| Chave | Label | Hint | Apelido | Ativa |
|---|---|---|---|---|
| `agendamento` | Relembrar do agendamento | Enviada antes da consulta | Lembrete de horário | **sim** |
| `nutricao` | Nutrição | Enviada de 2 a 15 dias após o procedimento | Dica de cuidado | **sim** |
| `pos` | Pós-procedimento | Enviada de 0 a 24h após | Como você está? | **sim** |
| `reativacao` | Reativação | Paciente com retorno atrasado | Sentimos sua falta | não |
| `inativos` | Salvamento / inativos | Última tentativa de retorno | Uma condição especial | não |

- Toggle (`onToggle`) inverte o `active` daquele modelo — muda opacidade do card, texto/cor de estado e a posição do knob.

---

## 13. Tela: Pessoas (`section === 'pessoas'`)

**Card único.** Cabeçalho `margin-bottom:18px`:

- `<h2>` **"Pessoas"**.
- `<p>` "Convide membros da equipe para acessar o Senno. Cada pessoa recebe um e-mail com o link de acesso e assume um cargo depois."

### 13.1 Banner de convite (empty-ish / CTA)

`display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; background:hsl(var(--background)); border:1px dashed hsl(var(--border)); border-radius:12px; padding:20px 22px` (**borda tracejada** — sinaliza área de convite):

- **Esquerda** (`display:flex; align-items:center; gap:14px`):
  - Tile `42×42px; border-radius:11px; background:hsl(var(--primary)/0.14); color:primary-text`; ícone **users** `20×20px`.
  - Textos: "Convide sua equipe" `13.5px/600` + "Você tem 4 membros ativos e 1 convite pendente." `12.5px muted; margin-top:2px`.
- **Direita:** botão primário **"Convidar pessoa"** `height:40px; padding:0 17px`; ícone **mail** `15×15px`; `flex:none`.

> Esta seção é um CTA — a listagem/gerência real de membros vive em **Usuários da clínica** (§15). O contador "4 membros ativos e 1 convite pendente" é texto fixo no protótipo; no real, derive dos dados.

---

## 14. Tela: Cargos e permissões (`section === 'cargos'`)

**Card único.** Cabeçalho em linha (`display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:14px`):

- Esquerda: `<h2>` **"Cargos e permissões"** + `<p>` "Arraste para reordenar a hierarquia — cargos no topo têm mais permissões."
- Direita: botão primário **"Novo cargo"** (`height:40px; padding:0 16px`; ícone **plus** `15px`; `flex:none`).

### 14.1 Lista de cargos (drag-and-drop reordenável)

`display:flex; flex-direction:column; gap:9px`. Cada cargo (`draggable="true"`):

- Linha: `display:flex; align-items:center; gap:13px; background:hsl(var(--background)); border:1px solid {border}; border-radius:11px; padding:12px 14px; opacity:{opacity}; transition:border-color .12s`.
  - **Durante o arraste do item** (`dragIndex === i`): `opacity:0.5` e `border-color:hsl(var(--primary)/0.6)`. Normal: `opacity:1`, `border:hsl(var(--border))`.
- **Grip** (`icoGrip`, seis pontos preenchidos): `20×20px; color:muted-foreground; cursor:grab; flex:none`; `title="Arraste para reordenar"`.
- **Tile de escudo:** `30×30px; border-radius:8px; background:hsl(var(--primary)/0.14); color:primary-text`; ícone **shield** `15×15px`.
- **Centro** (`flex:1; min-width:0`): nome `13.5px/600` + `usersLabel` `12px muted; margin-top:1px`.
- **Ações** (`display:flex; gap:6px; flex:none`), dois botões `34×34px; border-radius:8px; border:1px solid border; background:card`:
  - **Editar** (`icoEdit` 15px, `color:muted-foreground`) — hover `background:accent; color:foreground`; `title="Editar"`.
  - **Excluir** (`icoTrash` 15px, `color:muted-foreground`) — hover `background:hsl(var(--destructive)/0.1); color:destructive; border-color:hsl(var(--destructive)/0.4)`; `title="Excluir"`.

**4 cargos** (`id · nome · usuários`): `1` Proprietária/1 · `2` Gerente/2 · `3` Financeiro/1 · `4` Atendente/3.

- `usersLabel` = `{n} usuário` (singular quando `n===1`) / `{n} usuários`.

### 14.2 Mecânica de drag-reorder

- `onDragStart` → `dataTransfer.effectAllowed='move'`; `dragIndex = i`.
- `onDragOver` (na linha) → `allowDrop`: `e.preventDefault()` (habilita o drop).
- `onDragEnter` → `e.preventDefault()`; se `dragIndex` válido e `!== i`, **reordena** o array (`splice` remove de `dragIndex`, insere em `i`) e atualiza `dragIndex = i` (reorder ao vivo durante o hover).
- `onDragEnd` → `dragIndex = null` (limpa o realce).
- No real (shadcn/Next), use `@dnd-kit/sortable` mantendo o mesmo feedback visual (opacidade 0.5 + borda dourada).

---

## 15. Tela: Usuários da clínica (`section === 'usuarios'`)

**Card único.** Cabeçalho `margin-bottom:14px`:

- `<h2>` **"Usuários da clínica"**.
- `<p>` "Atribua um cargo a cada usuário interno."

### 15.1 Lista de usuários

Cada linha: `display:flex; align-items:center; justify-content:space-between; gap:16px; padding:14px 2px; border-bottom:1px solid border`.

- **Esquerda** (`min-width:0`):
  - Linha do nome `display:flex; align-items:center; gap:7px`: nome `13.5px/600` + (se `owner`) ícone **crown** `15×15px; color:primary-text` (coroa preenchida).
  - E-mail `12.5px muted; margin-top:2px`.
- **Direita** — depende de ser proprietário:
  - **`owner`** → texto `clamp(13…14.3); color:muted-foreground; flex:none` = **"Acesso total"** (sem select).
  - **`notOwner`** → **select de cargo** `width:172px; flex:none`, `defaultValue={u.role}`, estilo select nativo (§16.1). Opções: `Sem cargo` · `Gerente` · `Financeiro` · `Atendente`.

**5 usuários** (`nome · e-mail · cargo/owner`):
| Nome | E-mail | Cargo |
|---|---|---|
| Atendente (teste) | atendente-lucorreia@senno.dev | Sem cargo |
| Financeiro (teste) | financeiro-lucorreia@senno.dev | Sem cargo |
| Gerente (teste) | gerente-lucorreia@senno.dev | Gerente |
| **LuCorreia Estética** | lucorreiaesteticacwb@gmail.com | **owner** → "Acesso total" (coroa) |
| Sem Cargo (teste) | semcargo-lucorreia@senno.dev | Sem cargo |

> A ordem é a do array (alfabética por nome de teste, com o owner no meio). No real, considere destacar o owner no topo.

---

## 16. Selects, popovers e toggles (detalhe transversal)

### 16.1 Select nativo (dropdown) — padrão da tela

Usado em: Clínica (Estado, Regime), Pagamento (Forma de recebimento, `height:44px`), Usuários (Cargo, `width:172px`).

- `<select>`: `width:100%; height:40px (44px no Pagamento); padding:0 34px 0 12–13px; border-radius:9px; border:1px solid hsl(var(--input)); background:hsl(var(--background)); color:foreground; font-size:clamp(13…14.3) (13.5px no Pagamento); outline:none; -webkit-appearance:none; appearance:none; cursor:pointer`.
- **Chevron overlay** (`icoChevDown`): `position:absolute; right:12px; top:50%; transform:translateY(-50%); width:15px; height:15px; color:muted-foreground; pointer-events:none`. O `<select>` fica em wrapper `position:relative`.
- No real: `shadcn/ui <Select>` (Radix) reproduz isso com o chevron embutido; mantenha altura, radius e o `bg-background`.

### 16.2 Popover de notificações (sino)

Único popover flutuante da tela — documentado por completo em §3.3. `bg-popover`, radius 12, sombra `*3.5`, overlay `fixed inset-0` para fechar, `max-height:344px` rolável.

### 16.3 Toggle switch (Régua de retenção)

- Trilho (`<button role="switch">`): `position:relative; width:38px; height:22px; border-radius:99px; padding:0; flex:none; cursor:pointer; transition:background .2s, border-color .2s`.
  - **Ativa:** `border:1px solid hsl(var(--primary)); background:hsl(var(--primary))`.
  - **Inativa:** `border:1px solid hsl(var(--border)); background:hsl(var(--muted))`.
- Knob: `position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:99px; box-shadow:0 1px 2px rgba(0,0,0,0.25); transition:transform .2s`.
  - **Ativa:** `background:hsl(var(--primary-foreground))` (escuro sobre dourado) + `transform:translateX(16px)`.
  - **Inativa:** `background:hsl(var(--card))` + `transform:translateX(0)`.
- > Nota: a sombra do knob usa `rgba(0,0,0,0.25)` literal (única exceção de cor não-tokenizada da tela, aceitável por ser sombra de peça pequena). No real, pode migrar para `hsl(var(--shadow)/…)`.

---

## 17. Catálogo de animações

### Keyframes (no `<style>`)

| Nome              | Definição                                             | Uso                     |
| ----------------- | ----------------------------------------------------- | ----------------------- |
| `senno-bell-ring` | rotação amortecida: `0 → 11deg → -9 → 6 → -4 → 2 → 0` | shake do sino ao clicar |

> **Sem shimmer/skeleton nesta tela** (formulários carregam com os dados; no real, se houver fetch, aplique o skeleton do `design.md`). **Sem pílula deslizante** — os segmenteds aqui trocam `background` por botão.

### Transições

| Elemento                          | Propriedade / timing                                                             |
| --------------------------------- | -------------------------------------------------------------------------------- |
| Toggle de tema (sol↔lua)          | `transform .5s cubic-bezier(.34,1.3,.5,1)`, `opacity .35s`                       |
| Sino (shake)                      | `senno-bell-ring .7s cubic-bezier(.36,.07,.19,.97)` (removida no `animationend`) |
| Busca da topbar (expand/collapse) | `width .34s cubic-bezier(.4,0,.2,1)`, bg/border/shadow `.22s`                    |
| Input `.senno-input` (foco)       | `border-color .15s, box-shadow .15s`                                             |
| Chips de categoria                | `background .15s, border-color .15s, color .15s`                                 |
| Segmented (Aparência, Retenção)   | `background .15s, color .15s`                                                    |
| Toggle switch (trilho)            | `background .2s, border-color .2s`                                               |
| Toggle switch (knob)              | `transform .2s`                                                                  |
| Card de cargo (arraste)           | `border-color .12s`                                                              |
| Botão Copiar (endpoints)          | hover `filter:brightness(0.98)`                                                  |

> Tom **operacional/premium**: transições curtas. Nada de animação longa ou chamativa.

---

## 18. Thresholds & lógica condicional (resumo)

| Onde                   | Regra                                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --- | -------------------------------- |
| Categoria ativa        | `section` (default `'todas'`); cada seção renderiza se `section===chave` **ou** `section==='todas'` (`all`)                         |
| Modo "Todas"           | `all=true` → empilha as 9 seções na ordem dos chips                                                                                 |
| Filtro de chips        | `q = searchQuery.trim().toLowerCase()`; chip visível se `!q                                                                         |     | label.toLowerCase().includes(q)` |
| Empty de busca         | `chips.length===0` → "Nenhuma configuração encontrada para “{q}”."                                                                  |
| Chip ativo             | `section===k` → superfície `primary` (texto `primary-foreground`); senão `card` + `muted-foreground`                                |
| Aparência ativa        | `appearance===v` → superfície `primary`                                                                                             |
| `setAppearance(v)`     | grava `appearance=v`; **`theme = v==='system' ? tema-atual : v`**                                                                   |
| Pagamento — ajuda      | texto por `creditMode` (`repasse` vs `antecipacao`)                                                                                 |
| Pagamento — campo taxa | `showFee = creditMode==='antecipacao'` (mostra bloco tracejado + input "2,99" + sufixo %)                                           |
| Retenção — ajuda       | texto por `retentionMode` (`manual` / `tarefas` / `automatico`)                                                                     |
| Retenção — modelos     | `showMessages = retentionMode !== 'manual'` (esconde toda a lista no modo Manual)                                                   |
| Modelo de mensagem     | `active` → `opacity:1`, estado "Ativa" `primary-text`, knob à direita; inativo → `opacity:0.66`, "Inativa" `muted`, knob à esquerda |
| Webhook — copiar       | `copiedId===id` → ícone check, "Copiado", cores `ok`; reseta em **1400ms** (só se ainda for o mesmo id)                             |
| Webhook — rotacionar   | novo token `whk_live_` + 16 hex aleatórios                                                                                          |
| Webhook — revogar      | token → "— revogado —"                                                                                                              |
| Cargo — arraste        | `dragIndex===i` → `opacity:0.5` + `border primary/0.6`; reorder no `onDragEnter`                                                    |
| Cargo — plural         | `n===1 ? 'usuário' : 'usuários'`                                                                                                    |
| Usuário — linha        | `owner` → "Acesso total" + coroa; `notOwner` → select de cargo (172px)                                                              |
| Sino — dot             | aparece se `unreadCount>0`                                                                                                          |
| Tema — título          | `themeTitle = tema==='dark' ? 'Modo escuro' : 'Modo claro'`                                                                         |

---

## 19. Dados de exemplo (fonte da verdade)

### Categorias / chips (10, na ordem)

`todas` Todas · `perfil` Perfil · `aparencia` Aparência · `clinica` Clínica · `pagamento` Pagamento no crédito · `webhooks` Webhooks · `retencao` Régua de retenção · `pessoas` Pessoas · `cargos` Cargos e permissões · `usuarios` Usuários da clínica.

### Perfil

Nome pessoal `Helena Costa` · E-mail `helena@bellavie.com.br`.

### Clínica

Nome `Clínica Bellavie Estética` · E-mail `contato@bellavie.com.br` · Telefone `(41) 99631-2088` · Cidade `Curitiba` · Estado `PR` · Regime `simples` (Simples Nacional) · CNAE `9602-5/02`.

### Pagamento no crédito

`creditMode` default `repasse`; taxa de antecipação default `2,99` (% a.m., mostrada só no modo `antecipacao`).

### Webhooks

Token default `whk_live_8f3a2b91c7d64e05`. Endpoints:

```
wa      WhatsApp    Cloud API   https://api.senno.app/webhooks/wa/8f3a2b
meta    Meta Ads    Lead Ads    https://api.senno.app/webhooks/meta/8f3a2b
google  Google Ads  Lead Form   https://api.senno.app/webhooks/gads/8f3a2b
```

### Régua de retenção

`retentionMode` default `tarefas`. Modelos (5):

```
agendamento  Relembrar do agendamento  Enviada antes da consulta                 Lembrete de horário   ativa
nutricao     Nutrição                  Enviada de 2 a 15 dias após o procedimento Dica de cuidado       ativa
pos          Pós-procedimento          Enviada de 0 a 24h após                    Como você está?       ativa
reativacao   Reativação                Paciente com retorno atrasado              Sentimos sua falta    inativa
inativos     Salvamento / inativos     Última tentativa de retorno                Uma condição especial inativa
```

### Cargos (4)

```
1  Proprietária  1 usuário
2  Gerente       2 usuários
3  Financeiro    1 usuário
4  Atendente     3 usuários
```

### Usuários (5)

```
Atendente (teste)     atendente-lucorreia@senno.dev     Sem cargo
Financeiro (teste)    financeiro-lucorreia@senno.dev    Sem cargo
Gerente (teste)       gerente-lucorreia@senno.dev       Gerente
LuCorreia Estética    lucorreiaesteticacwb@gmail.com    owner (Acesso total)
Sem Cargo (teste)     semcargo-lucorreia@senno.dev      Sem cargo
```

### Notificações (sino — 5, compartilhado com as demais telas)

```
1 lead    "Novo lead"                — Mariana Alves · Instagram            — agora  — não-lida
2 money   "Pagamento confirmado"     — R$ 1.200 · Botox · Camila Souza      — 8 min  — não-lida
3 agenda  "Agendamento confirmado"   — Patrícia Lima · amanhã às 14h        — 40 min — não-lida
4 alert   "Tarefa atrasada"          — Retornar ligação · Rafael Dias       — 1 h    — lida
5 agenda  "Novo agendamento online"  — Beatriz Ramos · Limpeza de pele      — 3 h    — lida
```

### Selects — opções

- **Estado (Clínica):** PR Paraná · SP São Paulo · RJ Rio de Janeiro · MG Minas Gerais · RS Rio Grande do Sul · SC Santa Catarina · BA Bahia.
- **Regime tributário:** simples Simples Nacional · presumido Lucro Presumido · real Lucro Real · mei MEI.
- **Cargo (Usuários):** Sem cargo · Gerente · Financeiro · Atendente.

---

## 20. Props do componente & integração com o App

**Props do Configurações** (`data-props`, `$preview` 1440×860):

- `defaultTheme`: enum `light | dark` (default `light`).

**Callbacks/props que o App injeta** (usados na integração real):

- `theme` (controlado externamente), `onToggleTheme()` — o toggle da topbar chama `onToggleTheme` se existir, senão alterna local. **O segmented de Aparência (§8) deve compartilhar esse mesmo controle de tema.**
- `onNavigate(labelDaRota)` — nav da sidebar.
- `onNewLead()` — botão "Novo lead".

**Estado interno da tela** (no real, mapeie para form state / server actions):
`theme`, `appearance`, `section` (categoria ativa), `searchQuery`, `creditMode`, `retentionMode`, `messages[]` (com `active`), `roles[]` (ordem), `dragIndex`, `token`, `copiedId`, `notifs[]`, `notifOpen`, `bellRing`.

> **Ações de "Salvar"** (Perfil, Clínica, Pagamento, mensagem individual): no protótipo são botões sem handler. No real, ligue a server actions / mutations e mostre feedback (toast ou estado de sucesso inline) — **nunca `alert()`**. Cubra os 4 estados por superfície de dados quando houver fetch (carregado/skeleton/vazio/erro).

---

## 21. Ordem de build sugerida + checklist

**Ordem:**

1. Tokens no `globals.css` + Inter + `tabular-nums` (ver `design.md`).
2. **Chrome** (sidebar 236px + topbar) — reaproveite o das outras telas (idêntico). Nesta tela, a busca da topbar é decorativa; o sino é funcional.
3. Coluna centralizada `max-width:940px` no body.
4. **Barra de busca de configuração + chips** (filtro em tempo real, chip ativo dourado, empty state, "Todas").
5. **Shell de seção** (card padrão + label/input/select/textarea/botão primário reutilizados).
6. As 9 seções, uma a uma, conferindo contra este doc: Perfil → Aparência → Clínica → Pagamento → Webhooks → Retenção → Pessoas → Cargos → Usuários.
7. Primitivos específicos: **segmented sem pílula** (Aparência/Retenção), **toggle switch** (Retenção), **select nativo + chevron** (shadcn Select), **drag-reorder** (Cargos, `@dnd-kit`), **copiar com feedback** (Webhooks).
8. Ligar callbacks (`onNavigate`, `onToggleTheme`, `onNewLead`) e sincronizar tema topbar ↔ Aparência.
9. Rodar o checklist do `design.md` §9.

**Checklist específico de Configurações:**

- [ ] Só tokens semânticos; conferir dark mode em **todas** as superfícies (inclusive borda tracejada de Pessoas e tile de Webhooks/Cargos).
- [ ] Dois dourados nos papéis certos: chip ativo/segmented ativo/toggle ativo/botões = `primary` (texto `primary-foreground`); grip-tile/ícones/coroa/estado "Ativa"/links = `primary-text`.
- [ ] `tabular-nums` em CNAE, taxa de antecipação, token, contador de não-lidas do sino.
- [ ] Coluna centralizada `940px` — não largura cheia.
- [ ] Chips: filtro por busca, ativo dourado, empty "Nenhuma configuração encontrada…", "Todas" empilha as 9 seções.
- [ ] Segmenteds **sem pílula deslizante** (troca instantânea de fundo) — Aparência e Retenção.
- [ ] Aparência ↔ toggle da topbar controlam o mesmo tema; "Sistema" no real lê `prefers-color-scheme`.
- [ ] Pagamento: ajuda muda por modo; campo de taxa (bloco tracejado + sufixo %) só no modo antecipação.
- [ ] Retenção: modelos escondidos no modo Manual; card inativo a `opacity:0.66`; toggle switch com knob deslizante; estado "Ativa"/"Inativa" tintado.
- [ ] Webhooks: rotacionar gera token novo; revogar → "— revogado —"; copiar mostra "Copiado" (verde `ok`) por 1400ms, um por vez; `<code>` do header estilizado.
- [ ] Cargos: drag-reorder com feedback (opacidade 0.5 + borda dourada); plural de "usuário(s)"; ações Editar/Excluir com hovers corretos (excluir → destrutivo).
- [ ] Usuários: owner → "Acesso total" + coroa; demais → select de cargo 172px.
- [ ] Select nativo com chevron `pointer-events:none` (shadcn Select no real).
- [ ] Sino funcional (dot, shake, marcar todas, tints por tipo); busca da topbar só expand/collapse.
- [ ] Botões "Salvar" ligados a mutations com feedback inline; nunca `alert()`.
- [ ] Responsivo: grids `senno-2col`/`senno-3col` (Perfil, Clínica) colapsam em 1024px/660px.
