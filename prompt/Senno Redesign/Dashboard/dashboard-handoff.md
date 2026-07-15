# Dashboard — Handoff detalhado (item a item)

> Especificação granular da tela **Dashboard / "Visão geral"** (`Dashboard Clinica.dc.html`).
> Objetivo: reconstruir **cada elemento visual, medida, threshold e animação** no stack real
> (Next 16 + Tailwind v3 + shadcn/ui) sem improviso. **Nada aqui é opcional.**
>
> **Como usar este doc**
>
> 1. Leia `design.md` primeiro (tokens, regras de cor, tipografia, chrome). Este arquivo **não repete** os tokens — assume que já estão no `globals.css`.
> 2. Toda cor é token semântico via `hsl(var(--token))`. Onde aparece `primary/0.16`, leia `hsl(var(--primary) / 0.16)`.
> 3. Todo número (px, %, peso, threshold) é **literal do protótipo** — reproduza exatamente. Onde houver `clamp(...)`, é responsivo; mantenha a fórmula.
> 4. Os `.dc.html` usam um runtime de protótipo próprio — **não copie a sintaxe de template**. Recrie em React/TSX com as libs do codebase. Ícones → `lucide-react`. Gráficos CSS → pode manter CSS ou migrar p/ Recharts mapeando `fill/stroke` nos tokens.
>
> **Legenda de tokens usados abaixo (do `design.md`):**
> `--card` superfície · `--background` fundo app · `--foreground` texto · `--muted`/`--muted-foreground` neutro · `--border` bordas · `--accent` hover · `--primary` dourado-superfície · `--primary-foreground` texto escuro sobre dourado · `--primary-text` dourado-texto · `--ring` foco · `--destructive` erro · `--ok`/`--ok-bg` sucesso · `--warn`/`--warn-bg` aviso · `--info-t`/`--info-bg` info/lead · `--shadow`/`--shadow-a` sombra tingida.

---

## 0. Índice

1. Estrutura geral da página (esqueleto + medidas de layout)
2. Sidebar (236px) — item a item
3. Topbar (header) — título + busca + tema + sino + Novo lead
4. Barra de período (segmented control)
5. Setores de KPI (12 cards em 3 setores)
6. Gráfico Receita × Custos (componente `Grafico Receita`)
7. Card Metas (+ popover "Ver todas")
8. Donut "Origem dos leads"
9. Barras "Receita por procedimento" (+ popover)
10. Lista "Próximos agendamentos"
11. "Funil de conversão"
12. "Insights ativos" (+ popover + deep-link)
13. Galeria de estados (carregado / skeleton / vazio / erro)
14. Catálogo de animações (keyframes + transições)
15. Thresholds & lógica condicional (tabela única)
16. Dados de exemplo (fonte da verdade)
17. Props do componente e integração com o App
18. Ordem de build sugerida + checklist

---

## 1. Estrutura geral da página

### Container raiz

- Elemento `.senno` com `data-theme` (`light|dark`) e `data-font` (`inter`).
- `background: hsl(var(--background))`, `color: hsl(var(--foreground))`, `height: 100vh`, `overflow: hidden`, `line-height: 1.45`, `font-family: Inter`.
- `-webkit-font-smoothing: antialiased`, `box-sizing: border-box` global, `body { margin: 0 }`.

### Moldura da app (shell full-bleed)

`data-screen-label="Dashboard Clínica — Visão geral"` — `width:100%; height:100%; display:flex; overflow:hidden; background:hsl(var(--background))`.

Layout em duas colunas via flex:

```
[ SIDEBAR 236px fixa ] [ MAIN flex:1 -> (TOPBAR fixo) + (BODY rolável) ]
```

- **MAIN**: `flex:1; min-width:0; min-height:0; display:flex; flex-direction:column`.
- **BODY rolável**: `flex:1; min-height:0; overflow-y:auto; padding:22px 24px; display:flex; flex-direction:column; gap:18px`. **Só o body rola** — sidebar e topbar ficam fixos.

### Ordem vertical do body (gap 18px entre blocos)

1. Barra de período (centralizada)
2. Setores de KPI (3 setores empilhados, gap 18px)
3. Linha `senno-2col` 1.7fr / 1fr → **Gráfico Receita×Custos** + **Metas**
4. Linha `senno-2col` 1fr / 1.6fr → **Origem dos leads (donut)** + **Receita por procedimento**
5. Linha `senno-3col` 0.95fr / 0.9fr / 1.55fr → **Próximos agendamentos** + **Funil** + **Insights ativos**

> A **Galeria de estados** (seção 13) vive **fora** da moldura da app, abaixo — é vitrine de design, não faz parte da tela de produção. No produto real, use-a só como referência dos 4 estados; não renderize essa galeria na rota.

### Breakpoints responsivos (media queries globais)

- `@media (max-width:1024px)`: `.senno-2col { grid-template-columns:1fr }` e `.senno-3col { grid-template-columns:1fr 1fr }`.
- `@media (max-width:660px)`: `.senno-3col { grid-template-columns:1fr }`.

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
| **Ativo** (Dashboard) | 600 | `hsl(var(--primary-text))` | `hsl(var(--accent))` |

- **Badge opcional** (à direita do label, quando existe): pill `font-size:10.5px; font-weight:600; padding:1px 7px; border-radius:99px; background:hsl(var(--primary)/0.16); color:hsl(var(--primary-text))`. No dashboard nenhum item traz badge por padrão.

**Ordem fixa da nav (12 itens, menu plano, sem seções):**
`Dashboard` (ativo) · `Atividades` · `Agenda` · `Funil` · `Pacientes` · `Financeiro` · `Metas` · `Insights` · `Procedimentos` · `Exportações` · `Notificações` · `Configurações`.

Ícones (set stroke-24, lucide no real): grid, activity, calendar, funnel, users, money(rect+circle), target, bulb, syringe, download, bell, settings. Clique chama `onNavigate(label)`.

### 2.3 Rodapé (usuário)

- `margin-top:auto` (empurra p/ base). Card: `display:flex; align-items:center; gap:10px; padding:10px; border-radius:10px; background:hsl(var(--muted))`.
- Avatar "HC": `32×32px; border-radius:99px; background:hsl(var(--primary)/0.2); color:hsl(var(--primary-text)); font-size:12.5px; font-weight:600`.
- Nome "Dra. Helena Costa" `12.5px / 600` (trunca); cargo "Proprietária" `11px muted`.

---

## 3. Topbar (header)

`header`: `flex:none; display:flex; align-items:center; gap:16px; padding:14px 24px; border-bottom:1px solid hsl(var(--border)); background:hsl(var(--card))`.

- **Esquerda** (`flex:1; min-width:0`): `<h1>` "Visão geral" — `font-size:clamp(22px, 0.5vw + 18px, 27px); font-weight:600; letter-spacing:-0.01em; margin:0`.
- **Direita**: `display:flex; align-items:center; gap:9px` — na ordem: **Busca → Tema → Sino → Novo lead**.

### 3.1 Busca "Buscar paciente…" (colapsável)

**Comportamento:** ícone de lupa 38px que **expande da direita para a esquerda** até 240px no hover/focus e abre um popover de resultados.

Marcação/CSS (classe `senno-search`):

- Wrapper `.senno-search`: `position:relative; width:38px; height:38px; flex:none`.
- Caixa `.senno-search-box`: `position:absolute; top:0; right:0; height:38px; width:38px` (estado colapsado) `; display:flex; align-items:center; gap:8px; padding:0 11px; border-radius:9px; border:1px solid hsl(var(--border)); background:hsl(var(--background)); color:hsl(var(--muted-foreground)); font-size:12.5px; overflow:hidden; white-space:nowrap; cursor:pointer`.
- **Transição:** `width .34s cubic-bezier(.4,0,.2,1), background .22s, border-color .22s, box-shadow .22s`.
- **Expandido** (`:hover` no wrapper **ou** `:focus-within` na caixa): `width:240px; border-color:hsl(var(--input)); cursor:text`.
- **Foco** (`:focus-within`): `border-color:hsl(var(--ring)); box-shadow:0 0 0 3px hsl(var(--ring)/0.18)` (anel de foco padrão).
- Ícone lupa `15×15px`, `flex:none`. Input: `border:none; outline:none; background:transparent; font-size:12.5px; color:foreground`, placeholder "Buscar paciente…".

**Popover de resultados** (renderiza quando `searchOpen === true`):

- Overlay de fechar: `position:fixed; inset:0; z-index:40` (clique fora fecha).
- Painel: `position:absolute; top:46px; right:0; width:344px; background:hsl(var(--popover)); border:1px solid hsl(var(--border)); border-radius:12px; box-shadow:0 16px 40px -12px hsl(var(--shadow)/calc(var(--shadow-a)*3.5)); z-index:50; overflow:hidden`.
- **Cabeçalho:** rótulo uppercase `font-size:10.5px; font-weight:600; letter-spacing:0.06em; color:muted-foreground`. Texto = `listLabel`:
  - query vazia → "Pacientes recentes";
  - com query → "N resultado(s)".
- **Linha de resultado** (`<button>`): `display:flex; align-items:center; gap:11px; width:100%; text-align:left; padding:9px 8px; border-radius:8px`; hover `background:accent`.
  - Avatar iniciais: `34×34px; border-radius:99px; background:hsl(var(--primary)/0.16); color:primary-text; font-size:12px; font-weight:600` (2 primeiras iniciais do nome).
  - Nome: `font-size:clamp(13px, 0.14vw + 11.2px, 14.3px); font-weight:500`, trunca. **Realce do termo:** o trecho casado recebe `color:primary-text; font-weight:700; background:hsl(var(--primary)/0.16); border-radius:3px; padding:0 1px`.
  - Sub: `proc · telefone`, `11.5px muted`, trunca.
  - Status pill: `10.5px / 600; padding:2px 8px; border-radius:99px`. Cores por status: **Lead** → `info-bg`/`info-t`; **Inativa** → `muted`/`muted-foreground`; qualquer outro (Ativa/Ativo) → `ok-bg`/`ok`.
- **Empty (sem resultados,** query≠"" e 0 matches**):** ícone lupa 30px muted + "Nenhum paciente encontrado" (`clamp(13…14.3)/500`) + "Tente outro nome ou telefone." (`12px muted`) + botão dourado "Cadastrar paciente" (`height:34px; padding:0 14px; radius:8px; bg-primary; primary-foreground; 12.5px/600`, ícone `+` 14px, hover `brightness(1.05)`).
- **Rodapé:** `padding:9px 14px; border-top:1px solid border; background:hsl(var(--muted)/0.4)`, à esquerda link "Ver todos os pacientes" (`12px/600 primary-text`), à direita "Esc para fechar" (`10.5px muted`).

**Lógica da busca:**

- `onInput` → `query = valor`, `searchOpen = true`. `onFocus` → abre. `Escape` → fecha. Clique no overlay → fecha. Clique numa linha → fecha.
- Normalização: minúsculas + remoção de acentos (`normalize('NFD')` sem diacríticos).
- Match: nome contém a query normalizada **OU** (se a query tiver dígitos) telefone só-dígitos contém os dígitos digitados.
- `results` = primeiros **6** matches.

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

- Wrapper `position:relative`. Botão `38×38px; border-radius:9px; border; background:background; color:foreground`; hover `accent`; `title="Notificações"`.
- Ícone sino `17×17px; transform-origin:top center`.
- **Dot de não-lidas** (se `unreadCount > 0`): `position:absolute; top:7px; right:8px; width:7px; height:7px; border-radius:99px; background:hsl(var(--destructive)); border:1.5px solid hsl(var(--card))`.
- **Animação de shake ao clicar:** aplica classe `senno-bell-ring-a` → keyframes `senno-bell-ring .7s cubic-bezier(.36,.07,.19,.97)` (ver §14). A classe é removida no `animationend`.

**Popover de notificações** (quando `notifOpen`):

- Overlay `fixed inset:0 z:40`. Painel: `top:46px; right:0; width:362px`, resto igual ao popover de busca (border/radius/shadow/z).
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
- Ícone `+` `15×15px`. Clique → `onNewLead` (abre criação de lead).

---

## 4. Barra de período (segmented control)

- Wrapper: `display:flex; align-items:center; justify-content:center; gap:12px` (centralizado no body).
- Trilho: `position:relative; display:grid; grid-auto-flow:column; grid-auto-columns:1fr; padding:3px; border-radius:9px; background:hsl(var(--muted)); border:1px solid hsl(var(--border))`.
- **Pílula deslizante** (`segPill`): `position:absolute; top:3px; left:3px; bottom:3px; width:calc((100% - 6px)/N); transform:translateX(idx*100%); background:hsl(var(--primary)); border-radius:7px; box-shadow:0 1px 2px hsl(var(--shadow)/var(--shadow-a)); pointer-events:none; z-index:0; transition:transform .34s cubic-bezier(.34,1.1,.5,1)`.
- **Botões** (`segBtn`): `position:relative; z-index:1; border:none; font-size:12.5px; font-weight:600; padding:6px 14px; border-radius:7px; background:transparent; white-space:nowrap; transition:color .25s`. Cor: ativo `primary-foreground` / inativo `muted-foreground`.
- Abas (N=4): **Hoje · Semana · Mês · Trimestre**. Padrão selecionado = **Mês** (`period:'mes'`).

> Este é o padrão **switch/segmented dourado** reutilizado também no toggle Gerada/Recebida do gráfico e nas abas da galeria de estados (lá com pílula `bg-card` em vez de `bg-primary`).

---

## 5. Setores de KPI

Container: `display:flex; flex-direction:column; gap:18px`. **3 setores**, cada um:

- **Overline** do setor: `font-size:11px; font-weight:600; letter-spacing:0.07em; text-transform:uppercase; color:muted-foreground; margin:0 0 10px 2px`.
- **Grid de cards:** `display:grid; grid-template-columns:repeat(auto-fit, minmax(228px,1fr)); gap:14px` (4 cards por setor no desktop; reflui sozinho).

Nomes dos setores (exatos): **"Financeiro"**, **"Comercial · aquisição"**, **"Operação · atendimento"**.

### 5.1 Anatomia do KPI card

- `background:card; border:1px solid border; border-radius:13px; padding:18px 18px 16px; box-shadow:0 1px 2px hsl(var(--shadow)/var(--shadow-a)); display:flex; flex-direction:column; gap:9px`. **Hover:** `border-color:hsl(var(--primary)/0.5)`.
- **Linha 1 (label):** ícone `14×14px` `muted-foreground` + label `12.5px / 600` foreground, `gap:7px`.
- **Linha 2 (valor):** `font-size:clamp(27px, 0.6vw + 21px, 33px); font-weight:700; letter-spacing:-0.02em; font-variant-numeric:tabular-nums; line-height:1; white-space:nowrap`.
- **Linha 3 (delta + sub):** `font-size:11.5px; gap:7px`.
  - **Pill de delta** (só se o KPI tem `delta`): `display:inline-flex; align-items:center; gap:2px; font-weight:600; padding:1px 6px; border-radius:99px`, ícone de seta `11×11px` + texto. Cores por regra "bom/ruim":
    - `good:true` → `background:hsl(var(--ok-bg)); color:hsl(var(--ok))`, seta **up** (`icoUp`).
    - `good:false` → `background:hsl(var(--destructive)/0.12); color:hsl(var(--destructive))`.
    - ⚠️ **Regra semântica:** em "Custos", a variação sobe **mas é ruim** → marcado `good:false` (vermelho) mesmo com seta pra cima. Não confundir direção da seta com cor.
  - **Sub:** `color:muted-foreground; white-space:nowrap; overflow:hidden; text-overflow:ellipsis`.

### 5.2 Os 12 KPIs (valores exatos)

**Setor "Financeiro"** (ícones: money, trend, wallet, chart):
| Label | Valor | Delta | Sub |
|---|---|---|---|
| Faturamento | R$ 184.320 | ↑ 12,4% (verde) | vs. período anterior |
| Lucro líquido | R$ 142.880 | ↑ 9,1% (verde) | líquido no período |
| Custos | R$ 41.440 | ↑ 3,2% (**vermelho**) | no período |
| Margem líquida | 77,5% | — (sem delta) | sobre o faturamento |

**Setor "Comercial · aquisição"** (ícones: funnel, target, tag, spark):
| Label | Valor | Sub |
|---|---|---|
| Leads totais | 142 | 11 hoje |
| Conversão | 34,2% | meta 38% |
| CAC | R$ 86 | custo por novo paciente |
| ROI marketing | 4,2× | retorno sobre invest. |

**Setor "Operação · atendimento"** (ícones: calendar, user-x, receipt, heart):
| Label | Valor | Delta | Sub |
|---|---|---|---|
| Agendamentos | 318 | — | 24 hoje |
| No-show | 8,4% | — | comparecimento 91,6% |
| Ticket médio | R$ 1.298 | ↑ 5,6% (verde) | por paciente |
| Health Score | 82 | — | de 100 · saudável |

---

## 6. Gráfico Receita × Custos

Componente isolado `Grafico Receita.dc.html`, embutido na coluna esquerda da linha `senno-2col` (1.7fr). Props passadas pelo dashboard: `theme`, `months=chartMonths` (18 meses, §16), `window-count=8`, `default-period=12`, `step=2`, `scale-max=200`. Altura reservada: `100% × 388px`.

### 6.1 Card e cabeçalho

- Card padrão: `bg-card; border; border-radius:13px; padding:20px; shadow; position:relative`.
- **Título:** `<h2>` `15px / 600`, texto "Receita {gerada|recebida} × Custos" (a palavra muda com o toggle). Ícone de ajuda `?` (`15×15px muted`, `cursor:help`) só se `showHelp` (padrão **off** no dashboard). Subtítulo opcional `12.5px muted` (vazio quando não passado).
- **Controles à direita** (`display:flex; gap:8px`): toggle Gerada/Recebida + botão de período.

### 6.2 Toggle "Gerada / Recebida" (segmented dourado)

Mesmo padrão do §4 (pílula `bg-primary`, transição `.34s cubic-bezier(.34,1.1,.5,1)`), 2 opções, fonte `12px`. Padrão = **Gerada**. Alterna qual série de receita as barras usam.

### 6.3 Botão + popover de período (amostragem)

- **Botão:** `display:inline-flex; align-items:center; gap:6px; height:30px; padding:0 11px; border-radius:8px; border:1px solid border; background:card; color:foreground; font-size:12.5px; font-weight:600`; hover `border-color:primary/0.5`. Conteúdo: ícone calendar `14px primary-text` + label "N meses" (ou "1 mês") + chevron-down `13px muted`.
- **Popover** (`togglePopup`): overlay `fixed inset:0 z:30`; painel `position:absolute; top:38px; right:0; z:31; width:194px; background:card; border; border-radius:11px; box-shadow:0 10px 28px hsl(var(--shadow)/0.20); padding:7px`.
  - Rótulo uppercase `10px/600; letter-spacing:0.05em; muted; padding:5px 8px 7px` = "Amostragem por período".
  - **Opções fixas:** 1 mês · 3 meses · 6 meses · 12 meses. Cada `<button>` `display:flex; justify-content:space-between; padding:8px 9px; border-radius:7px; font-size:13px`; ativo `font-weight:600; color:primary-text` + check `15px primary-text`; hover `bg-accent`.
  - Divisória `height:1px; background:border; margin:6px 4px`.
  - **Linha "Personalizado":** label `13px` + `<input type=number min=1 max={totalDisponível}>` (`width:52px; height:28px; border:1px solid input; border-radius:7px; background:background; text-align:center; tabular-nums`) + sufixo "m". Quando ativo, a linha ganha `background:accent`.
  - Selecionar período reseta o offset de navegação (volta aos meses mais recentes) e fecha o popover (exceto o input personalizado, que mantém aberto).

### 6.4 Área de plotagem (barras)

Layout: `[ eixo Y 46px ] [ seta ‹ ] [ plot flex:1 ] [ seta › ]`, `gap:10px`, `align-items:stretch`.

- **Eixo Y** (`width:46px; text-align:right; font-size:10px; tabular-nums; muted`): 5 ticks `R$ {scaleMax×f}` para f = 1, .75, .5, .25, 0 → com `scaleMax=200`: **R$ 200 / 150 / 100 / 50 / 0**. `padding-top:22px` (gutter, headroom pros rótulos de topo).
- **Setas ‹ ›** (`goPrev`/`goNext`): `align-self:center; width:30px; height:30px; border-radius:50%; border:1px solid border; background:card`; hover `border-color:primary/0.5`. Desabilitada: `opacity:0.32; pointer-events:none`. Ícone chevron `16px`.
- **Plot** (`position:relative; height:180px; border-bottom:1px solid border; overflow:hidden`):
  - **Altura das barras (útil):** `plotHeight − gutter = 180 − 22 = 158px`.
  - **Gridlines tracejadas** (`border-top:1px dashed border`), posicionadas por `bottom` em px calculado sobre a área útil: 100% (topo), 75%, 50%, 25% → `158, 118.5, 79, 39.5px` (arredondado).
  - **Fileira de barras:** `display:flex; align-items:flex-end; gap:{colGap=16}px; transform:translateX(...); transition:transform 460ms cubic-bezier(0.22,1,0.36,1)`. Cada mês é um "slot"; dentro, duas barras (Receita + Custos) com `gap:3px`.
  - **Largura de coluna:** `calc((100% − gapsPx)/d)`, onde `d = max(visíveis, 6)`. Ou seja, a **coluna tem largura fixa a partir de 6 meses**; com menos, divide por 6 e centraliza (`justify-content:center`) para não virar uma barra gigante.
  - **Navegação:** só translada (`translateX = -offset × (100%+gap)/d`); nunca muda o tamanho do gráfico. `window-count=8` = colunas visíveis; `step=2` = quantos meses cada clique de seta avança.
  - **Barra Receita:** `background:hsl(var(--primary))`; altura `min(rev/scaleMax,1)×100%`. Valor compacto acima (`9px/600 primary-text tabular`).
  - **Barra Custos:** `background:hsl(var(--destructive)/0.85)`; altura `min(custos/scaleMax,1)×100%`. Valor acima (`9px/600 destructive`).
  - **Cantos:** a barra mais alta arredonda os dois cantos de topo (`4px 4px 0 0`); a mais baixa só o canto externo (Receita à esquerda → `4px 0 0 0`; Custos à direita → `0 4px 0 0`).
  - **Tooltip** (`title` nativo): "Receita gerada · {mês}: R$ {v} mil" / "Custos · {mês}: R$ {v} mil".
- **Rótulos de mês** abaixo do plot: `font-size:10.5px; muted; text-align:center`, alinhados aos slots (mesmo `translateX`).

### 6.5 Legenda

Centralizada, `gap:22px; margin-top:14px; font-size:11.5px muted`: swatch `11×11 radius:3` `bg-primary` "Receita gerada" · swatch `bg-destructive/0.85` "Custos".

---

## 7. Card "Metas"

Coluna direita da 1ª `senno-2col` (1fr). Card padrão `padding:20px; position:relative; display:flex; flex-direction:column`.

### 7.1 Cabeçalho

- `display:flex; align-items:center; justify-content:space-between; gap:10px`.
- Esquerda: `<h2>` "Metas" `clamp(15px, 0.2vw + 12.4px, 16.5px)/600` + **pill de contagem** ("6 metas"): `11.5px/600; color:primary-text; background:accent; border:1px solid border; border-radius:99px; padding:2px 9px; tabular-nums`.
- Direita (se há mais que o visível): botão "Ver todas" `height:30px; padding:0 8px 0 11px; border-radius:8px; border:1px solid border; background:transparent; color:primary-text; 12px/600`; hover `accent`. Traz badge "+N": `height:18px; padding:0 6px; radius:99px; background:primary; color:primary-foreground; 11px/600 tabular`. Aqui **+2** (6 metas, 4 visíveis).

### 7.2 Lista de metas (4 visíveis)

`margin-top:18px; flex-direction:column; gap:13px`. Cada meta:

- Linha topo: label `clamp(13…14.3)/500` + detalhe `12px muted tabular` (à direita).
- Linha prazo: ícone calendar `13px` + "N dias restantes" (`11.5px muted tabular`).
- **Barra de progresso:** trilho `height:8px; border-radius:99px; background:muted; overflow:hidden`; fill `height:100%; width:{pct}; border-radius:99px`.
  - **Threshold de cor:** `pct ≥ 85` → `background:hsl(var(--ok))` (verde); senão `background:hsl(var(--primary))` (dourado).

**Cálculo de prazo:** `dias = round((dataMeta − hoje)/86400000)` com `hoje = 2026-06-28`; texto "1 dia restante" (singular) ou "N dias restantes".

Dados (6 metas — as 4 primeiras visíveis):
| Meta | pct | detalhe | prazo (ISO) |
|---|---|---|---|
| Receita | 78% | R$ 184k / 235k | 2026-06-30 |
| Novos pacientes | 64% | 32 / 50 | 2026-06-30 |
| Procedimentos | **91%** (verde) | 218 / 240 | 2026-07-15 |
| Ticket médio | 82% | R$ 1.298 / 1.580 | 2026-07-31 |
| Taxa de retorno | 56% | 28% / 50% | 2026-08-15 |
| Reativação de inativos | 41% | 11 / 27 | 2026-08-31 |

### 7.3 Popover "Ver todas" (dentro do card)

Ao clicar "Ver todas", abre painel **sobreposto ao próprio card** (`state.pop === 'metas'`):

- Overlay `fixed inset:0 z:40`. Painel `position:absolute; top:0; left:0; right:0; z:50; background:card; border:1px solid hsl(var(--primary)/0.35); border-radius:13px; padding:20px; box-shadow:0 20px 44px -14px hsl(var(--shadow)/calc(var(--shadow-a)*4))`.
- Cabeçalho igual + botão "Ver menos" (chevron-up `13px` + texto), mesmo estilo do "Ver todas".
- Corpo: `margin-top:18px; gap:13px; max-height:min(62vh, 620px); overflow-y:auto` — mostra as **6** metas.
- Apenas um popover por vez (metas/proc/insights compartilham `state.pop`; abrir um fecha o outro). `closePop` no overlay.

---

## 8. Donut "Origem dos leads"

Coluna esquerda da 2ª `senno-2col` (1fr). Card padrão `padding:20px; display:flex; flex-direction:column`.

- `<h2>` "Origem dos leads" `clamp(15…16.5)/600`.
- Corpo `margin-top:16px; display:flex; align-items:center; gap:22px`.

### 8.1 Donut (SVG)

- Wrapper `position:relative; width:140px; height:140px; flex:none`.
- SVG `viewBox 0 0 140 140`. Geometria: centro `(70,70)`, **raio externo 70**, **raio interno 41** (anel de 29px). Fatias = `<path>` de arco (setores) em sentido horário a partir do topo.
- **Miolo (overlay central, `pointer-events:none`):**
  - Número grande `22px/700; letter-spacing:-0.02em; tabular-nums; line-height:1.05` = total **142** (ou a contagem da fatia sob hover).
  - Texto pequeno `10.5px muted; max-width:86px; line-height:1.15` = "leads" (ou o nome da fonte sob hover).
  - Sub `10px/600 primary-text tabular` = só aparece no hover, mostra o "%" da fatia.
- **Hover:** ao passar numa fatia (ou na legenda), as **outras fatias caem para `opacity:0.28`** (`transition:opacity .16s`), e o miolo troca para `{contagem} / {nome} / {pct}%`. Sair → volta ao total.
  - Contagem da fatia = `round(pct/100 × 142)`.

### 8.2 Legenda

`flex:1; flex-direction:column; gap:9px`. Cada linha: swatch `10×10; border-radius:3; background:{fill}` + label `12.5px foreground` + pct `12.5px/600 muted tabular` (à direita).

**Fontes (7) — pct e cor (escala de dourado do escuro→claro):**
| Fonte | % | fill |
|---|---|---|
| Meta Ads | 28% | `hsl(33 70% 31%)` |
| Google Ads | 20% | `hsl(37 66% 42%)` |
| Orgânico | 16% | `hsl(41 63% 52%)` |
| Indicação | 14% | `hsl(43 64% 61%)` |
| WhatsApp | 10% | `hsl(45 62% 70%)` |
| Presencial | 7% | `hsl(47 56% 79%)` |
| Outro | 5% | `hsl(49 50% 88%)` |

> Estas 7 cores da série são **valores HSL fixos** (degradê do dourado), não tokens — mantenha os literais. Total = 142 leads.

---

## 9. Barras "Receita por procedimento"

Coluna direita da 2ª `senno-2col` (1.6fr). Card padrão `padding:20px; position:relative`.

### 9.1 Cabeçalho

`<h2>` "Receita por procedimento" `clamp(15…16.5)/600` + botão "Ver todos" +N (mesmo componente do §7.1). Aqui **+3** (8 itens, 5 visíveis).

### 9.2 Barras (5 visíveis)

`margin-top:18px; gap:13px`. Cada linha: `display:flex; align-items:center; gap:12px`.

- Label: `width:128px; flex:none; font-size:12px; foreground`, trunca.
- Trilho: `flex:1; height:20px; border-radius:6px; background:muted; overflow:hidden`; fill `height:100%; width:{w}; border-radius:6px`.
  - **Cor do fill:** o **1º item** (maior) = `hsl(var(--primary))`; **os demais** = `hsl(var(--primary)/0.62)`.
- Valor: `width:64px; flex:none; text-align:right; font-size:12px; font-weight:600; tabular-nums`.

**Escala:** `procMax = 260` → `w = v/260 × 100%`. Dados (8, ordenados desc — 5 primeiros visíveis):
| Procedimento | valor | w |
|---|---|---|
| Botox | R$ 232k | 89,2% |
| Preenchimento | R$ 198k | 76,2% |
| Microagulhamento | R$ 156k | 60,0% |
| Limpeza de pele | R$ 124k | 47,7% |
| Peeling químico | R$ 98k | 37,7% |
| Drenagem linfática | R$ 76k | 29,2% |
| Depilação a laser | R$ 64k | 24,6% |
| Skinbooster | R$ 52k | 20,0% |

### 9.3 Popover "Ver todos"

Igual ao §7.3 (`state.pop === 'proc'`): painel sobreposto com os **8** procedimentos, `max-height:min(62vh,620px)` rolável, "Ver menos" no topo, contador "8 procedimentos".

---

## 10. Lista "Próximos agendamentos"

1ª coluna da `senno-3col` (0.95fr). Card padrão `overflow:hidden` (sem padding no card — o padding vive nas linhas).

- **Cabeçalho:** `padding:16px 18px 12px; display:flex; justify-content:space-between; align-items:center`. `<h2>` "Próximos agendamentos" `clamp(15…16.5)/600` + link "Ver agenda" `12px/600 primary-text` (→ `onNavigate('Agenda')`).
- **Linhas** (5): `display:flex; align-items:center; gap:12px; padding:11px 18px; border-top:1px solid border`.
  - Hora: `width:42px; flex:none; font-size:12.5px; font-weight:600; tabular-nums`.
  - Centro (`flex:1; min-width:0`): nome `clamp(13…14.3)/500` (trunca) + procedimento `11.5px muted` (trunca).
  - Status pill: `font-size:11px; font-weight:600; padding:2px 9px; border-radius:99px`. **confirmado** → `ok-bg`/`ok`; qualquer outro (pendente) → `warn-bg`/`warn`.

Dados (5):
| Hora | Paciente | Procedimento | Status |
|---|---|---|---|
| 09:00 | Mariana Costa | Limpeza de pele | confirmado |
| 10:30 | Bruno Almeida | Botox — full face | confirmado |
| 13:00 | Patrícia Nunes | Preenchimento labial | pendente |
| 15:30 | Camila Ribeiro | Microagulhamento | confirmado |
| 17:00 | Rafael Souza | Avaliação | pendente |

---

## 11. "Funil de conversão"

2ª coluna da `senno-3col` (0.9fr). Card padrão `padding:16px 18px`.

- `<h2>` "Funil de conversão" `clamp(15…16.5)/600; margin:0 0 14px`.
- Lista `flex-direction:column; gap:10px`. Cada etapa:
  - Linha topo: nome `12.5px/500` + contagem `12px muted tabular` (à direita).
  - Barra: trilho `height:22px; border-radius:6px; background:muted; overflow:hidden`; fill `height:100%; width:{pct}; border-radius:6px; background:hsl(var(--primary)/{alpha})`, `display:flex; align-items:center; justify-content:flex-end; padding-right:8px`; dentro o `%` em `10.5px/600 primary-foreground`.
  - **Alpha por etapa:** `alpha = 0.35 + (pct/100)×0.65` → dá opacidade crescente com a proporção (topo do funil mais opaco).

Dados (5 etapas):
| Etapa | count | pct | alpha (calc) |
|---|---|---|---|
| Leads | 142 | 100% | 1.00 |
| Contato | 98 | 69% | 0.80 |
| Agendado | 61 | 43% | 0.63 |
| Compareceu | 49 | 35% | 0.58 |
| Fechado | 38 | 27% | 0.53 |

---

## 12. "Insights ativos"

3ª coluna da `senno-3col` (1.55fr). Card padrão `padding:16px 18px; position:relative`.

### 12.1 Cabeçalho

`display:flex; justify-content:space-between; align-items:center; margin-bottom:6px`. Esquerda: `<h2>` "Insights ativos" + pill de contagem "6 ativos" (mesmo estilo §7.1). Direita: "Ver todos" +**1** (6 itens, 5 visíveis).

### 12.2 Itens (5 visíveis)

Cada = `<button>` `display:flex; align-items:center; gap:11px; padding:11px 10px; border-top:1px solid border; background:transparent; text-align:left; width:100%; border-radius:8px; transition:transform .16s, box-shadow .16s, background .16s`.

- **Hover:** `background:card; transform:translateY(-2px); box-shadow:0 9px 20px -8px hsl(var(--shadow)/calc(var(--shadow-a)*5))` (levanta o item).
- Ícone tile `30×30px; border-radius:8px`, cor por severidade. Ícone interno `16×16px`.
- Centro: título `12.5px/500; line-height:1.35` (trunca no card, completo no popover) + categoria `11px muted; margin-top:1px`.
- Pill de severidade (à direita): `10.5px/600; padding:2px 8px; border-radius:99px`.

**Severidades** (`tint`/`tintBg` do tile e `pillBg`/`pillColor`):
| Sev | rótulo | ícone | cor tile/pill | fundo tile/pill |
|---|---|---|---|---|
| `critico` | Crítico | alert | `destructive` | `destructive/0.12` |
| `aviso` | Aviso | alert | `warn` | `warn-bg` |
| `info` | Info | activity | `ok` | `ok-bg` |

Dados (6 — 5 visíveis):
| Sev | Categoria | Título |
|---|---|---|
| Crítico | Agenda | Queda de 28% nos agendamentos da próxima semana |
| Crítico | Retenção | 14 pacientes sem retorno há mais de 90 dias |
| Aviso | Funil | Conversão do funil caiu para 31% |
| Aviso | Estoque | Estoque de toxina botulínica baixo |
| Aviso | Financeiro | Ticket médio 7% abaixo da meta |
| Info | Operação | Quinta é o dia de maior movimento |

**Deep-link:** clicar num insight grava `localStorage['senno-insight-focus'] = título` e chama `onNavigate('Insights')` (a página de Insights foca o item correspondente).

### 12.3 Popover "Ver todos"

Igual §7.3 (`state.pop === 'insights'`): 6 itens, título sem truncar, `max-height:min(62vh,620px)` rolável, hover-lift mantido.

---

## 13. Galeria de estados (referência dos 4 estados)

> **Fora da moldura da app** — vitrine para o dev. Não é rota. Serve para especificar os 4 estados que **toda** superfície de dados precisa cobrir. `max-width:1376px; margin:40px auto 0`.

- Cabeçalho: "Estados" `16px/600` + legenda "carregado · skeleton · vazio · erro" `12.5px muted`. À direita, segmented **variante card** (pílula `bg-card` em vez de `bg-primary`), 4 abas: **Carregado · Skeleton · Vazio · Erro** (fonte `12px`, padding `5px 12px`).
- Grid `1fr 1.2fr; gap:18px`: card de **KPI** e card de **lista**.

### 13.1 Estado Carregado

- KPI: label "Receita do mês" `12.5px muted/500` + tile de ícone `30×30; radius:8; background:primary/0.12; color:primary-text`; valor "R$ 184.320" `25px/700 tabular`; delta "↑ 12,4%" pill `ok-bg`/`ok` + "vs. mês anterior" muted.
- Lista: "Próximos agendamentos" com 3 linhas (mesmo padrão do §10).

### 13.2 Skeleton (nunca spinner)

- Blocos com `border-radius` + **shimmer**: `background:linear-gradient(90deg, hsl(var(--muted)) 25%, hsl(var(--accent)) 37%, hsl(var(--muted)) 63%); background-size:220% 100%; animation:sennoShimmer 1.5s ease-in-out infinite`.
- KPI: barra label 13×90, tile 30×30, valor 28×140, delta 13×120 — todos com shimmer.
- Lista: 3 linhas de placeholder (hora 13×38, título 13×60%, sub 11×40%, pill 18×64).

### 13.3 Vazio (composto — ícone + título + texto + ação)

- KPI: ícone money `34px muted` + "Sem receita registrada" `clamp(13…14.3)/500` + "Os lançamentos do mês aparecerão aqui." `12px muted`.
- Lista: ícone calendar `34px muted` + "Nenhum agendamento hoje" + botão dourado "Agendar paciente" (`32px; bg-primary`).

### 13.4 Erro (inline — nunca `alert()`)

- KPI: ícone alert `30px destructive` + "Não foi possível carregar" + botão ghost "Tentar novamente" (`32px; border-input; bg-background`).
- Lista: caixa `background:hsl(var(--destructive)/0.1); border:1px solid hsl(var(--destructive)/0.3); border-radius:10px; padding:13px`, ícone alert `18px`, título "Erro ao carregar a agenda" `destructive/600`, sub "Verifique a conexão e tente novamente." + botão "Recarregar" (`30px; border:1px solid destructive/0.4; color:destructive`).

---

## 14. Catálogo de animações

### Keyframes (no `<style>`)

| Nome              | Definição                                                                | Uso                         |
| ----------------- | ------------------------------------------------------------------------ | --------------------------- |
| `sennoShimmer`    | `0% { background-position:-180% 0 } 100% { background-position:180% 0 }` | skeletons                   |
| `sennoGrow`       | `from { transform:scaleY(0) } to { transform:scaleY(1) }`                | crescer barras (disponível) |
| `senno-bell-ring` | rotação amortecida: `0→11deg→-9→6→-4→2→0`                                | shake do sino ao clicar     |

### Transições

| Elemento                                              | Propriedade / timing                                                             |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| Pílula segmentada (período, Gerada/Recebida, estados) | `transform .34s cubic-bezier(.34,1.1,.5,1)`                                      |
| Texto do botão segmentado                             | `color .25s`                                                                     |
| Busca (expand/collapse)                               | `width .34s cubic-bezier(.4,0,.2,1)`, bg/border/shadow `.22s`                    |
| Toggle de tema (sol↔lua)                              | `transform .5s cubic-bezier(.34,1.3,.5,1)`, `opacity .35s`                       |
| Sino (shake)                                          | `senno-bell-ring .7s cubic-bezier(.36,.07,.19,.97)` (removida no `animationend`) |
| Skeleton shimmer                                      | `1.5s ease-in-out infinite`                                                      |
| Barras do gráfico (navegação)                         | `transform 460ms cubic-bezier(0.22,1,0.36,1)`                                    |
| Fatias do donut (dim no hover)                        | `opacity .16s`                                                                   |
| Item de insight (hover-lift)                          | `transform/box-shadow/background .16s`                                           |
| Card (hover)                                          | `border-color` → `hsl(var(--primary)/0.5)`                                       |

> Tom **operacional/premium**: transições curtas, leve overshoot. Nada de animação longa ou chamativa.

---

## 15. Thresholds & lógica condicional (resumo)

| Onde                                                         | Regra                                                                                         |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| KPI delta "Custos"                                           | sobe **é ruim** → `good:false` (vermelho `destructive/0.12`), seta up mesmo assim             |
| KPI delta genérico                                           | `good:true` → verde `ok-bg`/`ok` + seta up; `good:false` → `destructive/0.12` + `destructive` |
| Barra de meta                                                | `pct ≥ 85` → fill `ok` (verde); senão `primary` (dourado)                                     |
| Prazo de meta                                                | `dias = round((prazo − 2026-06-28)/86400000)`; "1 dia restante" vs "N dias restantes"         |
| Fill de procedimento                                         | 1º item (maior) `primary`; demais `primary/0.62`                                              |
| Alpha do funil                                               | `0.35 + (pct/100)×0.65`                                                                       |
| Contagem da fatia do donut                                   | `round(pct/100 × 142)`                                                                        |
| Busca — match                                                | nome (sem acento, minúsculo) contém query **OU** telefone-só-dígitos contém dígitos da query  |
| Busca — `results`                                            | primeiros **6** matches                                                                       |
| Busca — `listLabel`                                          | vazio → "Pacientes recentes"; senão "N resultado(s)"                                          |
| Notificação — linha                                          | lida `bg:transparent` / não-lida `bg:primary/0.05`, título 500/600, dot se não-lida           |
| Dot do sino                                                  | aparece se `unreadCount > 0`                                                                  |
| "Ver todas/todos"                                            | aparece só se `total > visível`; badge "+{total − visível}"                                   |
| Visíveis: metas 4 (de 6) · proc 5 (de 8) · insights 5 (de 6) | popover mostra o total                                                                        |
| Popover exclusivo                                            | `state.pop` é único (`metas`/`proc`/`insights`); abrir um fecha o outro                       |
| Gráfico — coluna                                             | largura fixa a partir de 6 meses (`d = max(visíveis, 6)`); <6 centraliza                      |
| Gráfico — barra                                              | altura `min(valor/scaleMax, 1) × 100%`; `scaleMax=200`                                        |
| Gráfico — período custom                                     | clamp entre 1 e total disponível (18)                                                         |

---

## 16. Dados de exemplo (fonte da verdade)

### Receita × Custos — 18 meses (`chartMonths`, valores em milhares de R$)

`{ label, gerada, recebida, custos }`:

```
jan 121/114/34 · fev 118/110/33 · mar 129/121/36 · abr 134/126/37 · mai 128/120/35 · jun 141/133/38
jul 139/131/38 · ago 144/136/39 · set 151/142/41 · out 146/138/40 · nov 148/140/40 · dez 163/152/46
jan 158/149/42 · fev 160/151/41 · mar 166/157/43 · abr 171/162/42 · mai 179/169/45 · jun 184/174/41
```

(Os 12 mais recentes entram por padrão; janela visível = 8.)

### Notificações (5)

```
1 lead    "Novo lead"                — Mariana Alves · Instagram            — agora  — não-lida
2 money   "Pagamento confirmado"     — R$ 1.200 · Botox · Camila Souza      — 8 min  — não-lida
3 agenda  "Agendamento confirmado"   — Patrícia Lima · amanhã às 14h        — 40 min — não-lida
4 alert   "Tarefa atrasada"          — Retornar ligação · Rafael Dias       — 1 h    — lida
5 agenda  "Novo agendamento online"  — Beatriz Ramos · Limpeza de pele      — 3 h    — lida
```

### Pacientes (para a busca — 10)

```
Mariana Costa    (11) 98472-1130  Limpeza de pele      Ativa
Bruno Almeida    (11) 99021-4456  Botox — full face    Ativo
Patrícia Nunes   (21) 98123-7788  Preenchimento labial Ativa
Camila Ribeiro   (11) 97654-3321  Microagulhamento     Ativa
Rafael Souza     (11) 98800-1290  Avaliação            Lead
Helena Martins   (31) 99110-2034  Peeling químico      Ativa
Carla Mendes     (11) 98345-6677  Drenagem linfática   Inativa
Marcos Vinícius  (11) 99887-1234  Depilação a laser    Ativo
Beatriz Lima     (11) 98222-7654  Botox                Ativa
Anderson Pereira (11) 97001-8899  Avaliação            Lead
```

(KPIs, metas, funil, agenda, procedimentos, insights, leads: ver seções 5, 7, 8, 9, 10, 11, 12.)

---

## 17. Props do componente & integração com o App

**Props do Dashboard** (`data-props`, `$preview` 1440×1180):

- `defaultTheme`: enum `light | dark` (default `light`).
- `defaultFont`: enum `inter | ranade` (default `inter` — Ranade foi descartada; manter só Inter no real).

**Callbacks/props que o App injeta** (usados na integração real):

- `theme` (controlado externamente), `onToggleTheme()`, `onSetTheme('light'|'dark')`.
- `onNavigate(labelDaRota)` — usado por: nav da sidebar, "Ver agenda", deep-link de insight.
- `onNewLead()` — botão "Novo lead".

**Props do `Grafico Receita`** (passadas pelo dashboard):
`theme`, `months` (array), `windowCount=8`, `defaultPeriod=12`, `step=2`, `scaleMax=200`, `unit='mil'`, `subtitle=''`, `showHelp=false`, `colGap=16`, `plotHeight=180`.

---

## 18. Ordem de build sugerida + checklist

**Ordem:**

1. Tokens no `globals.css` + Inter + `tabular-nums` (ver `design.md`).
2. **Chrome** (sidebar 236px + topbar) — idêntico a todas as telas.
3. Primitivos reutilizados: card, botão primário/ghost, **segmented dourado com pílula deslizante**, pill de status, **popover** (overlay + painel), skeleton shimmer, empty state composto, erro inline.
4. Barra de período → setores de KPI → gráfico → metas → donut → barras → agenda → funil → insights.
5. Ligar callbacks (`onNavigate`, `onToggleTheme`, `onNewLead`) e o deep-link de insight (localStorage).
6. Rodar o checklist do `design.md` §9 na tela.

**Checklist específico do dashboard:**

- [ ] Só tokens semânticos; conferir dark mode em **todas** as superfícies (donut usa HSL fixo — ok, é série de dados).
- [ ] Dois dourados nos papéis certos (`primary` superfície / `primary-text` texto/links/nav-ativo/contadores).
- [ ] `tabular-nums` em: valores de KPI, horários, contadores, R$, ticks do eixo, pcts.
- [ ] Custos com delta **vermelho** apesar da seta pra cima.
- [ ] Barra de meta vira verde só em `≥85%` (Procedimentos 91%).
- [ ] Fill do 1º procedimento sólido, demais a `0.62`.
- [ ] Alpha do funil crescente do topo pra base.
- [ ] Busca: expand right→left, realce do termo, empty composto, "Esc para fechar".
- [ ] Sino: dot se não-lidas, shake no clique, "Marcar todas como lidas", linhas tintadas.
- [ ] Toggle de tema: sol no claro / lua no escuro, swap com rotação+fade.
- [ ] "Ver todas/todos" só quando há excedente; popover sobreposto ao card; um por vez; fecha no overlay/Esc.
- [ ] Gráfico: coluna fixa a partir de 6 meses, navegação por translateX (não redimensiona), toggle Gerada/Recebida, popover de amostragem + personalizado.
- [ ] Insights com hover-lift e deep-link para a rota Insights.
- [ ] 4 estados por superfície de dados (carregado/skeleton/vazio/erro) — nunca `alert()`.
- [ ] Responsivo: `senno-2col`/`senno-3col` colapsam em 1024px e 660px.
