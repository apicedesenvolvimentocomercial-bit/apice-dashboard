# Financeiro — Handoff detalhado (item a item)

> Especificação granular da tela **Financeiro** (`Financeiro.dc.html`) — a tela **mais complexa** do
> produto. Objetivo: reconstruir **cada elemento visual, medida, threshold e animação** no stack real
> (Next 16 + Tailwind v3 + shadcn/ui) sem improviso. **Nada aqui é opcional.**
>
> **Como usar este doc**
>
> 1. Leia `design.md` primeiro (tokens, regras de cor, tipografia, chrome). Este arquivo **não repete** os tokens — assume que já estão no `globals.css`.
> 2. Toda cor é token semântico via `hsl(var(--token))`. Onde aparece `primary/0.16`, leia `hsl(var(--primary) / 0.16)`.
> 3. Todo número (px, %, peso, threshold) é **literal do protótipo** — reproduza exatamente. Onde houver `clamp(...)`, é responsivo; mantenha a fórmula.
> 4. Os `.dc.html` usam um runtime de protótipo próprio — **não copie a sintaxe de template**. Recrie em React/TSX. Ícones → `lucide-react`. Gráfico → pode manter CSS ou migrar p/ Recharts mapeando `fill/stroke` nos tokens.
> 5. **Esta tela é feita de 6 abas.** Cada aba (Visão Geral, DRE, Receitas, Contas a Receber, Custos, Ativos) é documentada como se fosse uma tela própria (seções 5–10). O **chrome** (sidebar + topbar) e a **barra de abas** (seções 2–4) são compartilhados por todas.
>
> **Legenda de tokens usados abaixo (do `design.md`):**
> `--card` superfície · `--background` fundo app · `--foreground` texto · `--muted`/`--muted-foreground` neutro · `--border` bordas · `--accent` hover · `--primary` dourado-superfície · `--primary-foreground` texto escuro sobre dourado · `--primary-text` dourado-texto · `--ring` foco · `--destructive` erro · `--ok`/`--ok-bg` sucesso · `--warn`/`--warn-bg` aviso · `--shadow`/`--shadow-a` sombra tingida. (Financeiro **não** usa os tokens `--info-*`.)
>
> ⚠️ **Nota sobre os números de exemplo.** O tenant do protótipo é uma clínica **nova/esparsa**: o mês corrente tem
> só **R$ 200,00** de receita e **R$ 5,00** de custo (não são milhares — são reais literais). Por isso a DRE fica
> negativa (deduções de exemplo altas) e vários KPIs ficam em zero. **É intencional** — mostra a tela funcionando
> num tenant sem volume. Reproduza os valores como estão; não os "conserte".

---

## 0. Índice

1. Estrutura geral da página (esqueleto + medidas de layout + arquitetura de abas)
2. Sidebar (236px) — item a item
3. Topbar (header) — título + busca + tema + sino + Novo lead
4. Barra de abas (underline medido) — as 6 abas
5. **Aba Visão Geral** (KPIs × 8 + gráfico + 4 rankings com popover)
6. **Aba DRE** (segmented de período + Exportar CSV + tabela DRE)
7. **Aba Receitas** (contador + soma + Filtros/Importar/Nova receita + tabela)
8. **Aba Contas a Receber** (4 cards de resumo + tabela com parcelas expansíveis)
9. **Aba Custos** (contador + Exportar/Novo custo + tabela)
10. **Aba Ativos** (intangíveis + tangíveis + equipamentos alugados; filled/empty)
11. Chrome compartilhado detalhado (busca, sino, tema, tooltip)
12. Catálogo de animações (keyframes + transições)
13. Thresholds & lógica condicional (tabela única)
14. Dados de exemplo (fonte da verdade)
15. Props/callbacks + integração com o App
16. Ordem de build sugerida + checklist específico da tela

---

## 1. Estrutura geral da página

### Container raiz

- Elemento `.senno` com `data-theme` (`light|dark`) e `data-font` (`inter`).
- `background: hsl(var(--background))`, `color: hsl(var(--foreground))`, `height: 100vh`, `overflow: hidden`, `line-height: 1.45`, `font-family: Inter`, `-webkit-font-smoothing: antialiased`. Global: `*{box-sizing:border-box}`, `body{margin:0}`.

### Moldura da app (shell full-bleed)

`data-screen-label="Financeiro — {tabLabel}"` (o rótulo acompanha a aba ativa) — `width:100%; height:100%; min-height:0; display:flex; overflow:hidden; background:hsl(var(--background))`.

Layout em duas colunas via flex:

```
[ SIDEBAR 236px fixa ] [ MAIN flex:1 -> (TOPBAR fixo) + (BODY rolável) ]
```

- **MAIN**: `flex:1; min-width:0; min-height:0; display:flex; flex-direction:column`.
- **BODY rolável**: `flex:1; min-height:0; overflow-y:auto; padding:18px 24px 28px; display:flex; flex-direction:column; gap:18px`. **Só o body rola** — sidebar e topbar ficam fixos.

### Arquitetura de abas

- Uma única `<state.tab>` (`'visao' | 'dre' | 'receitas' | 'contas' | 'custos' | 'ativos'`) controla qual painel aparece. Default vem da prop `defaultTab` (default `'visao'`).
- O body sempre contém: (a) a **barra de abas** (§4) e (b) **um** dos 6 painéis (renderizado por `sc-if` conforme a aba). Trocar de aba só troca o painel — chrome e barra de abas permanecem.
- No real: rota `/financeiro` com sub-rotas ou `Tabs` do shadcn; o painel é `TabsContent`.

### Breakpoints responsivos (media queries globais)

- `@media (max-width:1024px)`: `.senno-2col { grid-template-columns:1fr }`, `.senno-3col { grid-template-columns:1fr 1fr }`.
- `@media (max-width:660px)`: `.senno-3col { grid-template-columns:1fr }`.
- As **tabelas** (Receitas/Custos/Contas/Ativos) usam grids de coluna fixa dimensionados para ~1440px; abaixo disso as colunas se sobrepõem no protótipo (não há reflow de tabela). No real, dê à tabela `overflow-x:auto` ou um layout responsivo — o protótipo não resolve isso.

---

## 2. Sidebar — 236px

`aside`: `width:236px; flex:none; background:hsl(var(--card)); border-right:1px solid hsl(var(--border)); display:flex; flex-direction:column; padding:18px 14px`.

### 2.1 Bloco de marca (topo)

- Wrapper: `display:flex; align-items:center; gap:10px; padding:6px 8px 18px`.
- **Logo**: `34×34px`, `border-radius:9px`, `background:hsl(var(--primary))`, flex center. Glifo **"B"** — `color:hsl(var(--primary-foreground))`, `font-weight:700`, `font-size:17px`.
- **Textos** (min-width:0): "Clínica Bellavie" — `14px / 600` foreground, trunca; "Plano Premium" — `11px`, `muted-foreground`.

### 2.2 Navegação

`nav`: `display:flex; flex-direction:column; gap:2px`.

Cada item = `<a href="#">` (no real `<Link>`): `display:flex; align-items:center; gap:11px; padding:8px 10px; border-radius:8px; font-size:13.5px; text-decoration:none`. Ícone `18×18px; flex:none`; label `flex:1; white-space:nowrap`. **Hover:** `background:hsl(var(--accent))`.

| Estado                 | `font-weight` | texto/ícone                    | `background`         |
| ---------------------- | ------------- | ------------------------------ | -------------------- |
| Inativo                | 500           | `hsl(var(--muted-foreground))` | `transparent`        |
| **Ativo** (Financeiro) | 600           | `hsl(var(--primary-text))`     | `hsl(var(--accent))` |

**Ordem fixa (12 itens, menu plano):** `Dashboard` · `Atividades` · `Agenda` · `Funil` · `Pacientes` · **`Financeiro` (ativo)** · `Metas` · `Insights` · `Procedimentos` · `Exportações` · `Notificações` · `Configurações`.

Ícones (set stroke-24, lucide no real): grid, activity, calendar, funnel, users, **money(rect+circle) ← ativo**, target, bulb, syringe, download, bell, settings. Clique → `onNavigate(label)`.

### 2.3 Rodapé (usuário)

`margin-top:auto`. Card: `display:flex; align-items:center; gap:10px; padding:10px; border-radius:10px; background:hsl(var(--muted))`. Avatar "HC": `32×32px; border-radius:99px; background:hsl(var(--primary)/0.2); color:hsl(var(--primary-text)); 12.5px/600`. Nome "Dra. Helena Costa" `12.5px/600` (trunca); "Proprietária" `11px muted`.

---

## 3. Topbar (header)

`header`: `flex:none; display:flex; align-items:center; gap:16px; padding:14px 24px; border-bottom:1px solid hsl(var(--border)); background:hsl(var(--card))`.

- **Esquerda** (`flex:1; min-width:0`): `<h1>` "Financeiro" — `font-size:clamp(22px, 0.5vw + 18px, 27px); font-weight:600; letter-spacing:-0.01em; margin:0`.
- **Direita** (`display:flex; align-items:center; gap:9px`), na ordem: **Busca → Tema → Sino → Novo lead** (padrão idêntico às demais telas).

> Detalhes completos de comportamento de **Busca, Sino, Tema e Tooltip** estão na §11 (chrome compartilhado). Resumo aqui:
>
> - **Busca** "Buscar paciente…" — caixa que colapsa em ícone 38px e expande p/ 240px no hover/focus. ⚠️ **Nesta tela a busca é só o campo colapsável** — **não** abre popover de resultados (diferente do Dashboard). É o input de busca puro.
> - **Tema** — botão 38px, sol↔lua com rotação+fade.
> - **Sino** — botão 38px, dot `destructive` se há não-lidas, shake ao clicar; popover completo.
> - **Novo lead** — botão dourado 38px alt (`bg-primary` / `primary-foreground`), ícone `+`, `onClick → onNewLead`.

Botão "Novo lead": `height:38px; padding:0 15px; border-radius:9px; border:none; background:hsl(var(--primary)); color:hsl(var(--primary-foreground)); font-size:clamp(13px,0.14vw+11.2px,14.3px); font-weight:600; display:flex; align-items:center; gap:7px`; hover `filter:brightness(1.05)`; ícone `+` 15px.

---

## 4. Barra de abas (underline medido)

Fica no topo do body, `align-self:flex-start` (não ocupa a largura toda). Wrapper:
`position:relative; display:flex; align-items:center; gap:4px; align-self:flex-start; max-width:100%; border-bottom:1px solid hsl(var(--border))`.

- **Indicador deslizante** (2px dourado, medido): `position:absolute; left:0; bottom:-1px; height:2px; border-radius:2px; background:hsl(var(--primary)); width:{indWidth}; transform:translateX({indLeft}); opacity:{indOpacity}`. Transição `transform .32s cubic-bezier(.34,1.1,.5,1), width .32s cubic-bezier(.34,1.1,.5,1), opacity .2s ease`.
  - `indLeft`/`indWidth` vêm de **medição do botão ativo** (`offsetLeft`/`offsetWidth`) em `componentDidMount`/`componentDidUpdate` e após `document.fonts.ready`. `indOpacity` = 0 até a primeira medição, depois 1. **A linha fina do underline corta no fim da última aba** (a barra só tem a largura das abas), não atravessa a tela.
- **Botão de aba** (`<button>`): `position:relative; border:none; background:transparent; cursor:pointer; font-size:13.5px; font-weight:600; padding:9px 12px; margin-bottom:-1px; white-space:nowrap; border-bottom:2px solid transparent`. Cor: ativo `hsl(var(--foreground))` / inativo `hsl(var(--muted-foreground))`. O `margin-bottom:-1px` sobrepõe a borda inferior do wrapper.

**Abas (6, na ordem):** `Visão Geral` (default) · `DRE` · `Receitas` · `Contas a Receber` · `Custos` · `Ativos`. `onClick` → `setState({tab:k})`. O `tabLabel` (usado no `data-screen-label`) segue o rótulo da aba ativa.

> ⚠️ **Botão de ação da página fica DENTRO do conteúdo**, não no header (regra do design system). Cada aba coloca seus botões (Exportar CSV, Nova receita, Novo custo, Novo ativo…) na primeira linha do painel, alinhados à barra de abas — nunca no topbar.

---

## 5. Aba **Visão Geral** (`tab === 'visao'`)

Painel: `display:flex; flex-direction:column; gap:16px`. Ordem vertical: KPIs (topo) → KPIs (caixa) → gráfico → linha 2-col (Top procedimentos / Top custos) → linha 2-col (Top compradores / Top vendedores).

### 5.1 Linha de KPIs "resultado" (4 cards)

Grid: `display:grid; grid-template-columns:repeat(auto-fit, minmax(228px,1fr)); gap:14px`.

**Anatomia do card:** `background:hsl(var(--card)); border:1px solid hsl(var(--border)); border-radius:13px; padding:16px 17px; box-shadow:0 1px 2px hsl(var(--shadow)/var(--shadow-a))`; **hover** `border-color:hsl(var(--primary)/0.5)`.

- **Label:** `font-size:12.5px; color:foreground; font-weight:600`.
- **Valor:** `margin-top:11px; font-size:25px; font-weight:700; letter-spacing:-0.02em; font-variant-numeric:tabular-nums; color:{k.color}`.
- **Delta** (só se `showDelta`): `margin-top:7px; display:flex; align-items:center; gap:7px; font-size:12px`. Pill: `display:inline-flex; align-items:center; gap:3px; font-weight:600; padding:1px 7px; border-radius:99px; tabular-nums; background:{deltaBg}; color:{deltaColor}`, ícone de seta `12×12px` (só se `showDeltaIcon`, ou seja, quando a direção não é `flat`).

**Os 4 cards "resultado":**
| Label | Valor | Delta | Cor do valor |
|---|---|---|---|
| Receita do mês (competência) | R$ 200,00 | ↑ +12,4% (verde) | foreground |
| Custos do mês | R$ 5,00 | ↓ −16,7% (**verde**) | foreground |
| Lucro líquido | R$ 195,00 | ↑ +13,4% (verde) | `ok` |
| Margem líquida | 97,5% | — (sem delta) | `ok` |

> ⚠️ **Regra semântica (inversa à do Dashboard):** em "Custos do mês" a variação é **boa quando CAI** (`goodWhenUp=false`). Aqui os custos caíram (−16,7%) → pill **verde** com seta **para baixo**. Se subissem, seria vermelho. Não confundir com o Dashboard, onde o card "Custos" sobe e fica vermelho.

### 5.2 Linha de KPIs "caixa" (4 cards)

Mesmo grid e mesma anatomia da §5.1.
| Label | Valor | Delta | Cor do valor |
|---|---|---|---|
| Recebido no mês (caixa) | R$ 200,00 | ↑ +16,3% (verde) | `ok` |
| Saldo projetado (30 dias) | R$ 372,00 | — | foreground |
| Vencido | R$ 0,00 | — | foreground |
| Taxa de inadimplência | 0,0% | — | `ok` |

**Lógica dos deltas (`dPc`)** — os deltas são **calculados** dos dois últimos meses de `monthsRaw` (§14), não digitados:
`cur = jun/2026 [gerada 200, recebida 200, custos 5]`, `prev = mai/2026 [178, 172, 6]`.

- Receita: `(200−178)/178 = +12,4%` (goodUp=true, dir=up → verde).
- Custos: `(5−6)/6 = −16,7%` (goodUp=false, dir=down → **verde**, pois cair é bom).
- Lucro: `curProfit=200−5=195`, `prevProfit=178−6=172` → `(195−172)/172 = +13,4%` (verde).
- Recebido: `(200−172)/172 = +16,3%` (verde).
- **Sem delta:** Margem líquida, Saldo projetado, Vencido, Taxa de inadimplência — comparação MoM ali é ruído. Os **valores** exibidos (R$ 200 / R$ 5 / R$ 195 / 97,5% / R$ 372 / R$ 0 / 0,0%) são **literais** no protótipo; no real derive-os das agregações reais.

**Regra de cor do delta (`cardDelta`):**
| `dir` | `good` | fundo | cor | ícone |
|---|---|---|---|---|
| `up` + goodUp / `down` + !goodUp | true | `ok-bg` | `ok` | up (goodUp) / down |
| `up` + !goodUp / `down` + goodUp | false | `destructive/0.12` | `destructive` | up / down |
| `flat` (\|x\| ≤ 0,05%) | null | `muted` | `muted-foreground` | — (sem seta) |
| sem `prev` | — | `ok-bg`/`ok` | — | up + texto "novo" |

Threshold de direção: `x > 0,05% → up`; `x < −0,05% → down`; senão `flat`. Formatação: `(+/−)N,N%` (vírgula decimal pt-BR); a **seta up** (`icoUp`) é reutilizada como ícone genérico e a **down** (`icoDown`) só quando `dir==='down'`.

### 5.3 Gráfico "Receita × Custos" (componente `Grafico Receita`)

Embutido em wrapper `min-width:0`. Import com props:
`theme={theme}`, `months={gChartMonths}` (18 meses, §14), `window-count=12`, `default-period=12`, `step=2`, `scale-max=200`, `unit=brl`, `bar-width=24` (⚠️ **ignorado** — o componente usa `colGap`, default 16), `plot-height=220`, `show-help=true`. Altura reservada: `100% × 420px`.

Especificação completa do componente (eixo Y, barras, navegação por `translateX`, toggle Gerada/Recebida com pílula dourada, popover de amostragem + personalizado, legenda) está em **`Dashboard/dashboard-handoff.md §6`** — é o mesmo componente. Diferenças aqui: `window-count=12` (12 colunas visíveis), `plot-height=220` (mais alto), `unit=brl` (tooltip em `R$ N,00` via `toLocaleString('pt-BR')` em vez de "N mil") e `show-help=true` (mostra o "?" com tooltip nativo "Comparativo mês a mês de receita e custos lançados.").

### 5.4 Rankings "Top" (4 cards, 2 linhas `senno-2col`)

Duas linhas `class="senno-2col"` `display:grid; grid-template-columns:1fr 1fr; gap:16px; align-items:start`:

- Linha 1: **Top procedimentos do mês** · **Top categorias de custo do mês**.
- Linha 2: **Top compradores** · **Top vendedores**.

**Anatomia do card de ranking** (idêntica nos 4): `position:relative; background:card; border; border-radius:13px; padding:18px 20px; shadow`.

- **Cabeçalho:** `display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px`. `<h2>` `font-size:14px; font-weight:600` + (se há excedente) botão **"Ver todos/todas" +N**.
- **Botão "Ver todos"**: `display:inline-flex; align-items:center; gap:6px; height:30px; padding:0 8px 0 11px; border-radius:8px; border:1px solid border; background:transparent; color:primary-text; 12px/600`; hover `background:accent`. Badge "+N": `display:inline-flex; align-items:center; height:18px; padding:0 6px; border-radius:99px; background:primary; color:primary-foreground; 11px/600; tabular-nums`.
- **Linha de item** (`gap:15px` entre linhas): topo `display:flex; align-items:center; gap:12px; margin-bottom:8px`:
  - Rank chip: `22×22px; flex:none; border-radius:6px; background:muted; color:muted-foreground; 11.5px/600; flex-center; tabular-nums`.
  - Nome: `flex:1; min-width:0; 13.5px/500`, trunca.
  - Meta (à direita do nome): `12px muted; tabular-nums`.
  - Total: `flex:none; min-width:96px (104px em vendedores); text-align:right; 13.5px/600; tabular-nums`.
  - **Barra:** trilho `height:6px; border-radius:99px; background:muted; overflow:hidden; margin-left:34px` (alinha sob o nome, pulando o rank chip). Fill `height:100%; width:{w}; border-radius:99px`.
    - **Cor do fill:** Top compradores usa `hsl(var(--primary))` (sólido); os outros três (procedimentos, custos, vendedores) usam `hsl(var(--primary)/0.7)`.
- **Visíveis:** 5 (`TOP_VIS = 5`). O "Ver todos" só aparece se `total > 5`.

**Popover "Ver todos"** (por card, `state.pop` exclusivo — `'proc' | 'custo' | 'buyers' | 'sellers'`; abrir um fecha o outro):

- Overlay `position:fixed; inset:0; z-index:40` (clique fora → `closePop`). Painel sobreposto ao card: `position:absolute; top:0; left:0; right:0; z-index:50; background:card; border:1px solid hsl(var(--primary)/0.35); border-radius:13px; padding:18px 20px; box-shadow:0 20px 44px -14px hsl(var(--shadow)/calc(var(--shadow-a)*4))`.
- Cabeçalho: `<h2>` + pill de contagem total (`11.5px/600; color:primary-text; background:accent; border:1px solid border; border-radius:99px; padding:2px 9px; tabular-nums`) à esquerda; botão **"Ver menos"** (chevron-up 13px + texto, mesmo estilo do "Ver todos" porém `padding:0 10px`) à direita.
- Corpo: lista completa, `max-height:min(60vh, 560px); overflow-y:auto`, mesmas linhas.

**Dados dos 4 rankings** (5 visíveis; total entre parênteses):

- **Top procedimentos** (6 → +1). Escala `w = valor / max`. `max = 9600`.
  | # | Procedimento | meta | total |
  |---|---|---|---|
  | 1 | Drenagem linfática - PO | 9× | R$ 1.980,00 |
  | 2 | Limpeza de pele profunda | 14× | R$ 1.820,00 |
  | 3 | Toxina botulínica | 6× | R$ 9.600,00 |
  | 4 | Preenchimento labial | 5× | R$ 7.250,00 |
  | 5 | Peeling de diamante | 11× | R$ 1.540,00 |
  | 6 | Microagulhamento | 7× | R$ 2.380,00 |
  > Nota: a lista **não** está ordenada por valor (o rank é a ordem do array, não do total). Reproduza a ordem como está.
- **Top categorias de custo** (6 → +1). `max = 4120`. Meta = classificação Fixo/Variável.
  | # | Categoria | meta | total |
  |---|---|---|---|
  | 1 | Produtos e insumos | Variável | R$ 4.120,00 |
  | 2 | Folha / comissões | Fixo | R$ 3.850,00 |
  | 3 | Aluguel | Fixo | R$ 2.600,00 |
  | 4 | Marketing | Variável | R$ 1.480,00 |
  | 5 | Energia e água | Fixo | R$ 720,00 |
  | 6 | Manutenção de equipamentos | Variável | R$ 540,00 |
- **Top compradores** (10 → +5). `max = 9860` (1º item). Meta = "N atend." Fill **sólido**.
  Janaina Yeva 14 / R$ 9.860 · Patrícia Mendonça 12 / R$ 8.420 · Renata Albuquerque 11 / R$ 7.150 · Camila Furtado 9 / R$ 6.030 · Beatriz Nogueira 8 / R$ 5.480 · (+5) Larissa Sampaio 7 / R$ 4.260 · Vanessa Coêlho 6 / R$ 3.910 · Tatiane Bourbon 5 / R$ 3.140 · Aline Quintela 5 / R$ 2.620 · Fernanda Wachowski 4 / R$ 2.080.
- **Top vendedores** (5 → sem excedente, "Ver todos" **não aparece**). `max = 28940`. Meta = "N vendas". Total `min-width:104px`.
  Dra. Helena Costa 38 / R$ 28.940 · Mariana Tavares 31 / R$ 22.100 · Júlia Bernardes 27 / R$ 18.760 · Carolina Penteado 22 / R$ 14.300 · Rafael Siqueira 16 / R$ 9.880.

---

## 6. Aba **DRE** (`tab === 'dre'`)

Painel `display:flex; flex-direction:column; gap:16px`.

### 6.1 Toolbar (segmented de período + Exportar CSV)

Linha `display:flex; align-items:center; justify-content:space-between; gap:16px`.

- **Segmented dourado** (esquerda, `flex:none`): trilho `position:relative; display:grid; grid-auto-flow:column; grid-auto-columns:1fr; padding:3px; border-radius:9px; background:muted; border:1px solid border`.
  - **Pílula deslizante** (`segPill`): `position:absolute; top:3px; left:3px; bottom:3px; width:calc((100% - 6px)/3); transform:translateX(idx*100%); background:hsl(var(--primary)); border-radius:7px; box-shadow:0 1px 2px hsl(var(--shadow)/var(--shadow-a)); transition:transform .34s cubic-bezier(.34,1.1,.5,1)`.
  - **Botões** (`segBtn`): `position:relative; z-index:1; border:none; font-size:12.5px; font-weight:600; padding:6px 14px; border-radius:7px; background:transparent; transition:color .25s`; ativo `primary-foreground` / inativo `muted-foreground`. Abas: **Mês** (default) · **Trimestre** · **Ano**.
  - ⚠️ No protótipo trocar o período **não altera os dados** da DRE (é decorativo — os valores são fixos). No real, ligue ao recorte temporal.
- **Botão "Exportar CSV"** (direita): `height:38px; padding:0 16px; border-radius:9px; border:1px solid border; background:card; color:foreground; font-size:clamp(13px,0.14vw+11.2px,14.3px); font-weight:600; display:inline-flex; align-items:center; gap:8px`; hover `background:accent`; ícone download 16px.

### 6.2 Tabela DRE (cascata contábil)

Card único: `background:card; border; border-radius:13px; shadow; overflow:hidden`. Cada linha é um grid de 3 colunas via flex:
`[ label flex:1 ] [ pct 64px right ] [ value 150px right ]`, `gap:12px` — na verdade cada linha é `display:flex; align-items:center; gap:12px` com: label (`flex:1`), pct (`width:64px; flex:none; text-align:right; 12px; muted; tabular-nums`) e value (`width:150px` no protótipo os `valSec/valSub` usam `width:150px`; o slot de pct fica em `64px`).

Dois tipos de linha:

- **Linha de seção** (`sec:true`): `padding:14px 18px; background:hsl(var(--muted)/0.45); border-top:1px solid border`. Label `13.5px/600 foreground`; value `150px; right; 13.5px/600 foreground; tabular-nums`.
- **Linha de subitem**: `padding:11px 18px 11px 30px` (indentada); `border-top:1px solid border`. Label `12.5px muted-foreground`; value `150px; right; 12.5px foreground; tabular-nums`.
- Coluna **pct** só preenchida em Lucro Bruto / EBITDA / Lucro Líquido (todas `0,00%` no protótipo, por causa do tenant esparso). Demais linhas: pct vazio.

**Linhas na ordem (17):** valores via `fmtSigned` (negativos com `−`):
| Linha | Tipo | Valor | pct |
|---|---|---|---|
| Receita Bruta | seção | R$ 200,00 | |
| Procedimentos | sub | R$ 200,00 | |
| (–) Deduções | sub | −R$ 26.077,50 | |
| Inadimplência | sub | −R$ 26.077,50 | |
| Receita Líquida | seção | −R$ 25.877,50 | |
| (–) Custo dos serviços (CSP) | sub | −R$ 5,00 | |
| Custo de produtos/procedimentos | sub | −R$ 5,00 | |
| Lucro Bruto | seção | −R$ 25.882,50 | 0,00% |
| (–) Despesas Operacionais | sub | −R$ 0,00 | |
| EBITDA | seção | −R$ 25.882,50 | 0,00% |
| (–) Depreciação e Amortização | sub | −R$ 0,00 | |
| EBIT (resultado operacional) | seção | −R$ 25.882,50 | |
| Resultado Financeiro | sub | R$ 0,00 | |
| LAIR (lucro antes do IR) | seção | −R$ 25.882,50 | |
| (–) IR / CSLL | sub | −R$ 0,00 | |
| Lucro Líquido | seção | −R$ 25.882,50 | 0,00% |

> Todos os valores são **literais** no protótipo (não recalculados a partir da cascata). No real, a DRE deve derivar cada linha; os subtotais de seção herdam a soma dos subitens acima. Mantenha os rótulos e a hierarquia exatamente (incluindo o "(–)" nos redutores).

---

## 7. Aba **Receitas** (`tab === 'receitas'`)

Painel `display:flex; flex-direction:column; gap:16px`.

### 7.1 Header da aba

Linha `display:flex; align-items:flex-end; justify-content:space-between; gap:16px`.

- **Esquerda:** contador `{N} receita(s)` (`clamp(13…14.3)/500`) + linha "Soma: **R$ …**" (`12.5px muted`; o valor em `color:ok; font-weight:600`). Soma = Σ dos valores da lista.
- **Direita** (`gap:9px`): **Filtros** (com popover), **Importar CSV**, **Nova receita**.
  - **Botão Filtros** (`recFilterBtnStyle`): `height:38px; padding:0 14px; border-radius:9px; 14.3px/600; display:inline-flex; align-items:center; gap:8px`, ícone sliders 16px. **Fechado:** `border:1px solid border; background:card; color:foreground`. **Aberto:** `border:1px solid ring; background:accent; color:primary-text`. Hover `background:accent`.
  - **Importar CSV**: `height:38px; padding:0 14px; border:1px solid border; background:card; color:foreground; radius:9px; 14.3px/600; gap:8px`, ícone file-up 16px; hover `accent`.
  - **Nova receita**: `height:38px; padding:0 16px; border:none; background:primary; color:primary-foreground; radius:9px; 14.3px/600; gap:7px`, ícone `+` 15px; hover `brightness(1.05)`.

### 7.2 Popover de filtros (`recFiltersOpen`)

Ancorado no botão Filtros (`position:relative` no wrapper): `position:absolute; top:calc(100% + 8px); right:0; z-index:30; width:264px; background:card; border:1px solid border; border-radius:13px; padding:14px; box-shadow:0 10px 28px hsl(var(--shadow)/calc(var(--shadow-a)*3)); display:flex; flex-direction:column; gap:12px`.

- **Cabeçalho:** "Filtrar receitas" (`12.5px/600`) + botão fechar `26×26px; radius:7px; border:none; background:transparent; color:muted-foreground`; hover `background:accent; color:foreground`; ícone close 15px.
- **Datas** (grid `1fr 1fr; gap:10px`): campos "De" e "Até", cada um label `12px/600 margin-bottom:6px` + `<input type=text placeholder="DD/MM/AAAA">` `width:100%; height:36px; padding:0 10px; radius:9px; border:1px solid input; background:background; 12.5px`; focus `border-color:ring; box-shadow:0 0 0 3px hsl(var(--ring)/0.18)`.
- **3 selects** (`recFilters` → Pagamento, Procedimento, Paciente): cada um label `12px/600` + `<select>` custom `appearance:none; width:100%; height:36px; padding:0 34px 0 10px; radius:9px; border:1px solid input; background:background; 12.5px; cursor:pointer` com chevron-down 14px muted posicionado `right:10px; top:50%; translateY(-50%)`. Única opção no protótipo: "Todos".
- **Rodapé:** `display:flex; justify-content:space-between; gap:8px`. "Limpar" (ghost `height:34px; padding:0 12px; radius:8px; border:none; background:transparent; color:muted-foreground; 12.5px/600`; hover `color:foreground`) + "Aplicar" (`height:34px; padding:0 16px; radius:8px; background:primary; color:primary-foreground; 12.5px/600`; hover `brightness(1.05)`). Ambos `onClick → onToggleRecFilters` (fecham). ⚠️ Filtro é **decorativo** no protótipo.

### 7.3 Tabela de receitas

Card `background:card; border; radius:13px; shadow; overflow:hidden`.

- **Grid de colunas** (header e linhas idênticos): `grid-template-columns:108px minmax(0,1.1fr) minmax(0,1.2fr) minmax(0,1.6fr) 96px 120px 110px; align-items:center; gap:14px`.
- **Header:** `padding:11px 18px; background:hsl(var(--muted)/0.4); border-bottom:1px solid border; font-size:11.5px; font-weight:600; letter-spacing:0.02em; text-transform:uppercase; color:muted-foreground`. Colunas: `Data` · `Descrição` · `Paciente` · `Procedimento` · `Pagamento` · `Valor` (right) · (vazia, ações).
- **Linha:** `padding:13px 18px; border-top:1px solid border`; hover `background:hsl(var(--accent)/0.5)`.
  - Data `12.5px; tabular-nums`.
  - Descrição `12.5px muted`, trunca.
  - Paciente `clamp(13…14.3)/500`, trunca.
  - Procedimento `12.5px foreground`, trunca.
  - Pagamento: pill `display:inline-flex; 11px/600; padding:3px 10px; border-radius:99px; background:muted; color:foreground`.
  - Valor: `text-align:right; clamp(13…14.3)/600; color:ok; tabular-nums`.
  - **Ações** (`display:flex; justify-content:flex-end; gap:6px`): 3 botões `30×30px; radius:8px; border:none; background:transparent; color:muted-foreground`, cada um `title`. **Editar** (ícone edit) e **Estornar** (ícone ban) → hover `background:accent; color:foreground`. **Excluir** (ícone trash) → hover `background:hsl(var(--destructive)/0.12); color:destructive`.
- **Dados (1 linha):** `17/06/2026 · — · Janaina Yeva · Drenagem linfatica - PO · Pix · R$ 200,00`. Contador "1 receita", Soma "R$ 200,00".

---

## 8. Aba **Contas a Receber** (`tab === 'contas'`)

Painel `display:flex; flex-direction:column; gap:16px`.

### 8.1 Cards de resumo (4)

Grid `repeat(auto-fit, minmax(228px,1fr)); gap:14px`. Card: `background:card; border; radius:13px; padding:15px 17px; shadow`.

- Label `12px muted/500`; valor `margin-top:7px; 20px/700; letter-spacing:-0.01em; tabular-nums; color:{s.color}`; count `margin-top:2px; 11.5px muted`.

| Card       | Valor        | count      | cor do valor       |
| ---------- | ------------ | ---------- | ------------------ |
| Em aberto  | R$ 0,00      | 0 títulos  | foreground         |
| Vencido    | R$ 0,00      | 0 títulos  | foreground         |
| Perdido    | R$ 18.487,50 | 11 títulos | `destructive`      |
| Encerradas | R$ 4.130,00  | 2 títulos  | `muted-foreground` |

Totais **calculados** de `contasData`: Perdido = Σ dos `kind:'perdido'` (11 itens); Encerradas = Σ dos `kind:'encerrada'` (2 itens). Em aberto/Vencido fixos em 0 (não há títulos `aberto`/`vencido` no dataset).

### 8.2 Tabela de títulos (com parcelas expansíveis)

Card `background:card; border; radius:13px; shadow; overflow:hidden`.

- **Grid** (header + linha): `grid-template-columns:minmax(0,1.8fr) minmax(0,1.3fr) 120px 150px 110px 110px; align-items:center; gap:14px`.
- **Header:** `padding:11px 18px; background:hsl(var(--muted)/0.4); border-bottom:1px solid border; 11.5px/600 uppercase; letter-spacing:0.02em; color:muted-foreground`. Colunas: `Cliente / Descrição` · `Parcelas` · `Vencimento` · `Valor` (right) · `Status` · `Ações` (right).
- **Linha** (`padding:13px 18px; border-top:1px solid border`; hover `background:hsl(var(--accent)/0.4)`):
  - **Cliente/Descrição** (`display:flex; align-items:center; gap:9px; min-width:0`): se `expandable`, chevron-toggle `22×22px; border:none; background:transparent; color:muted-foreground; transition:transform .15s; transform:rotate(0|90deg)` (ícone chevron-right 15px, `title="Ver parcelas"`). Nome `clamp(13…14.3)/600`, trunca; descrição opcional `11.5px muted`, trunca.
  - Parcelas `12.5px muted; tabular-nums`.
  - Vencimento `12.5px foreground; tabular-nums`.
  - Valor (`text-align:right; tabular-nums`): valor `clamp(13…14.3)/600`; se `hasReceived`, sub "{recebido} recebido" `11px muted`.
  - Status: badge (ver kinds abaixo).
  - Ações (`text-align:right`): botão-texto `background:none; border:none; padding:0; 12.5px/600; color:{actionColor}`; hover `text-decoration:underline`.
    - `kind:'perdido'` → texto "Reverter", cor `primary-text`.
    - `kind:'encerrada'` → texto "ver parcelas", cor `muted-foreground`, `onClick` **expande/colapsa** as parcelas (mesma ação do chevron).
- **Sub-linha de parcelas** (`c.open`): `background:hsl(var(--muted)/0.35); border-top:1px solid border; padding:6px 18px 12px 49px` (indentada sob o nome). Cada parcela: grid `minmax(0,1fr) 150px 150px 110px; align-items:center; gap:14px; padding:9px 0; border-bottom:1px dashed border`. Colunas: label da parcela (`12.5px foreground`) · vencimento (`12px muted; tabular-nums`) · valor (`right; 12.5px/600; tabular-nums`) · badge de status.

**Badges (`badge(kind)`)** — base `display:inline-flex; align-items:center; font-size:11px; font-weight:600; line-height:1; padding:4px 11px; border-radius:99px; white-space:nowrap`:
| kind | fundo | cor | usado por |
|---|---|---|---|
| `perdido` | `destructive/0.16` | `destructive` | status "Perdido" |
| `encerrada` | `muted` | `muted-foreground` | status "Encerrada" / parcela "Não paga" |
| `aberto` | `warn-bg` | `warn` | (definido, sem dados no protótipo) |
| _default_ | `muted` | `muted-foreground` | fallback |

**Dados (15 títulos; 11 perdidos + 2 encerrados com parcelas + 2 perdidos extras):** ver §14. Os dois títulos `encerrada` são expansíveis: "Cliente teste" (2x, parcelas de R$ 1.065 em 02/06 e 02/07) e "Klaus" (5x, parcelas de R$ 400 mensais 02/06→02/10). Parcela = `expandable:true`, `received:0` → sub "R$ 0,00 recebido".

---

## 9. Aba **Custos** (`tab === 'custos'`)

Painel `display:flex; flex-direction:column; gap:16px`.

### 9.1 Header da aba

Linha `display:flex; align-items:center; justify-content:space-between; gap:16px`.

- Esquerda: contador `{N} custo(s)` (`clamp(13…14.3)/500`).
- Direita (`gap:9px`): **Exportar CSV** (secundário, igual §6.1 — `border:1px solid border; background:card`, ícone download) + **Novo custo** (primário `bg-primary`, ícone `+` 15px).

### 9.2 Tabela de custos

Card `background:card; border; radius:13px; shadow; overflow:hidden`.

- **Grid:** `grid-template-columns:108px 110px minmax(0,1.1fr) minmax(0,1.6fr) 120px 110px 76px; align-items:center; gap:14px`.
- **Header** (mesmo estilo dos demais): `Data` · `Tipo` · `Categoria` · `Descrição` · `Recorrente` · `Valor` (right) · (ações).
- **Linha** (`padding:13px 18px; border-top`; hover `hsl(var(--accent)/0.5)`):
  - Data `12.5px; tabular-nums`.
  - Tipo: pill `11px/600; padding:3px 10px; radius:99px; background:muted; color:foreground` (ex.: "Variável").
  - Categoria `12.5px`.
  - Descrição `12.5px foreground`, trunca.
  - Recorrente `12.5px muted`.
  - Valor: `right; clamp(13…14.3)/600; color:destructive; tabular-nums`.
  - **Ações** (`gap:6px; justify-content:flex-end`): 2 botões `30×30px` — **Editar** (hover `accent`) e **Excluir** (hover `destructive/0.12` + `destructive`).
- **Dados (1 linha):** `17/06/2026 · Variável · Procedimento · Drenagem linfatica - PO · — · R$ 5,00`. Contador "1 custo".

---

## 10. Aba **Ativos** (`tab === 'ativos'`)

Painel `display:flex; flex-direction:column; gap:28px` — **três seções** empilhadas: **Ativos intangíveis**, **Ativos tangíveis (comprados)**, **Equipamentos alugados**. Cada seção tem estado **filled** (tabela + rodapé de total) ou **empty** (card tracejado), controlado pela prop `ativosState` (`'filled'` default / `'empty'`) — **as três alternam juntas**.

### 10.1 Cabeçalho de seção (padrão nas 3)

`display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:14px`.

- Esquerda: `<h2>` `clamp(15px, 0.2vw + 12.4px, 16.5px)/600` + **ícone de ajuda com tooltip** (`.senno-tip`): ícone help `15×15px; color:muted-foreground; cursor:help` que revela um bubble no hover (ver §11.4). Textos dos tooltips:
  - Intangíveis: "Software, licenças e marcas — geram amortização na DRE."
  - Tangíveis: "Equipamentos e bens adquiridos — preço de compra e manutenção recorrente."
  - Equipamentos alugados: "Aluguel mensal recorrente — entra na DRE como despesa fixa (sem depreciação)."
- Direita: botão primário **"Novo ativo"** (intangíveis/tangíveis) / **"Novo aluguel"** (equipamentos): `height:38px; padding:0 16px; bg-primary; primary-foreground; radius:9px; 14.3px/600; gap:7px`, ícone `+` 15px.

### 10.2 Ativos intangíveis (filled)

Card `background:card; border; radius:13px; shadow; overflow:hidden`. Grid: `minmax(0,1.7fr) 110px 120px 100px 130px 130px 76px; align-items:center; gap:14px`.

- Header: `Ativo` · `Tipo` · `Valor` (right) · `Vida útil` · `Amort./mês` (right) · `Acumulada` (right) · (ações).
- Linha (`padding:13px 18px; border-top`; hover `accent/0.5`):
  - Ativo: nome `clamp(13…14.3)/600` (trunca) + sub `11.5px muted` (trunca).
  - Tipo: pill muted (Software/Licença/Marca).
  - Valor: `right; 12.5px/600; tabular-nums`.
  - Vida útil: `12.5px muted; tabular-nums` — `Math.round(lifeMonths/12)` + `" ano"`/`" anos"` (≥24 meses → "anos").
  - Amort./mês: `right; 12.5px/600; color:destructive; tabular-nums` = `-fmt(value / lifeMonths)`.
  - Acumulada: `right; 12.5px muted; tabular-nums`.
  - Ações: Editar + Excluir (`30×30px`, como §9.2).
- **Rodapé de total:** `display:flex; justify-content:space-between; padding:12px 18px; border-top:1px solid border; background:hsl(var(--muted)/0.4)`. Label "Amortização total no mês" (`12.5px muted`) + valor `clamp(13…14.3)/700; color:destructive; tabular-nums` = `-Σ(value/lifeMonths)`.

**Dados (3):** Sistema de gestão (Senno) / "Assinatura anual capitalizada" / Software / R$ 7.200,00 / 36 m (→ "3 anos") / −R$ 200,00 · acumulada R$ 1.800,00 — Licença Photoshop / "Pacote criativo — marketing" / Licença / R$ 2.400,00 / 24 m (→ "2 anos") / −R$ 100,00 · R$ 900,00 — Marca registrada Bellavie / "Registro INPI + honorários" / Marca / R$ 9.000,00 / 120 m (→ "10 anos") / −R$ 75,00 · R$ 1.500,00. **Total amort./mês = −R$ 375,00.**

### 10.3 Ativos tangíveis (comprados) (filled)

Grid: `minmax(0,1.7fr) 116px 130px 116px 124px 116px 76px`.

- Header: `Ativo` · `Comprado em` · `Preço de compra` (right) · `Manutenção` · `Custo/manut.` (right) · `Próxima` · (ações).
- Linha: Ativo (nome + sub) · Comprado em (`12.5px foreground; tabular-nums`) · Preço (`right; 12.5px/600; tabular-nums`) · Manutenção (pill muted: Mensal/Trimestral/Semestral/Anual) · Custo/manut. (`right; 12.5px/600; color:destructive; tabular-nums`) · Próxima (`12.5px muted; tabular-nums`) · Ações (Editar + Excluir).
- **Rodapé:** "Manutenção recorrente prevista (equiv./mês)" + valor destructive `700` = `-Σ(maintCost / periodMonths[maint])`, onde `periodMonths = {Mensal:1, Trimestral:3, Semestral:6, Anual:12}`.

**Dados (3):** Aparelho de radiofrequência / "Equipamento corporal — Sala 1" / comprado 12/01/2026 / R$ 18.500,00 / Trimestral / −R$ 480,00 / próxima 12/07/2026 — Maca elétrica 3 motores / "Sala 2" / 03/11/2025 / R$ 6.200,00 / Anual / −R$ 350,00 / 03/11/2026 — Autoclave 21L / "Esterilização" / 20/02/2026 / R$ 4.300,00 / Semestral / −R$ 260,00 / 20/08/2026. **Total equiv./mês = −R$ 232,50** (480/3 + 350/12 + 260/6 = 160 + 29,17 + 43,33).

### 10.4 Equipamentos alugados (filled)

Grid: `minmax(0,1.6fr) minmax(0,1.1fr) 110px 140px 110px 76px`.

- Header: `Equipamento` · `Fornecedor` · `Início` · `Aluguel/mês` (right) · `Status` · (ações).
- Linha: Equipamento (`clamp(13…14.3)/600`, trunca) · Fornecedor (`12.5px muted`, trunca) · Início (`12.5px foreground; tabular-nums`) · Aluguel/mês (`right; 12.5px/600; color:destructive; tabular-nums`) · Status badge **`ok`** (`display:inline-flex; 11px/600; padding:4px 11px; radius:99px; background:ok-bg; color:ok`, texto "Ativo") · Ações (Editar + Excluir).
- **Rodapé:** "Despesa fixa de aluguel no mês" + valor destructive `700` = `-Σ(rent)`.

**Dados (2):** Laser CO2 fracionado / MedRent Equipamentos / início 01/03/2026 / −R$ 1.850,00 / Ativo — Cadeira de procedimentos elétrica / EstéticaLoc / 15/04/2026 / −R$ 640,00 / Ativo. **Total = −R$ 2.490,00.**

### 10.5 Estado vazio (por seção, `ativosState === 'empty'`)

Card composto: `background:card; border:1px dashed border; border-radius:13px; padding:46px 24px; display:flex; flex-direction:column; align-items:center; text-align:center; gap:11px`.

- Tile de ícone `40×40px; border-radius:11px; background:muted; color:muted-foreground` (ícone interno 20px): **box** (intangíveis e tangíveis) · **monitor** (equipamentos alugados).
- Título `14px/600`; subtítulo `12.5px muted; margin-top:-4px; max-width:420px`.
- Textos:
  - Intangíveis: "Nenhum ativo intangível cadastrado" / "Cadastre software, licenças ou marcas para a amortização entrar na DRE."
  - Tangíveis: "Nenhum ativo tangível cadastrado" / "Cadastre equipamentos e bens comprados com preço de compra e periodicidade de manutenção."
  - Equipamentos: "Nenhum equipamento alugado" / "Cadastre o primeiro aluguel para vê-lo somar como despesa fixa."
    > ⚠️ No protótipo `ativosState` é único e afeta as 3 seções juntas. No real, cada seção deve ter seu próprio estado vazio (independente).

---

## 11. Chrome compartilhado — comportamento detalhado

### 11.1 Busca "Buscar paciente…" (colapsável)

- Wrapper `.senno-search`: `position:relative; width:38px; height:38px; flex:none`.
- Caixa `.senno-search-box` (colapsada): `position:absolute; top:0; right:0; height:38px; width:38px; display:flex; align-items:center; gap:8px; padding:0 11px; border-radius:9px; border:1px solid border; background:background; color:muted-foreground; 12.5px; overflow:hidden; white-space:nowrap; cursor:pointer`.
- **Transição:** `width .34s cubic-bezier(.4,0,.2,1), background .22s, border-color .22s, box-shadow .22s`.
- **Expandida** (`.senno-search:hover .senno-search-box` **ou** `:focus-within`): `width:240px; border-color:input; cursor:text`. **Foco:** `border-color:ring; box-shadow:0 0 0 3px hsl(var(--ring)/0.18)`.
- Ícone lupa `15×15px; flex:none`. Input: `border:none; outline:none; background:transparent; 12.5px; color:foreground`, placeholder "Buscar paciente…".
- ⚠️ **Nesta tela a busca NÃO abre popover de resultados** (ao contrário do Dashboard). É o campo colapsável puro — expande no hover/focus e recebe digitação, sem painel de resultados no protótipo. No real, você pode reusar o popover de busca do Dashboard aqui; o protótipo do Financeiro só não o materializa.

### 11.2 Toggle de tema (sol/lua)

- Botão `.senno-theme-btn`: `38×38px; border-radius:9px; border:1px solid border; background:background; color:foreground; position:relative; overflow:hidden`; hover `background:accent`. `title` = "Modo escuro"/"Modo claro" (segue o tema atual).
- Dois ícones sobrepostos `.senno-theme-ico` (`position:absolute; top/left 50%; 17×17px; margin:-8.5px 0 0 -8.5px`), `transition: transform .5s cubic-bezier(.34,1.3,.5,1), opacity .35s`. Estados: **Light** → sol `rotate(0) scale(1) opacity:1`, lua `rotate(-90deg) scale(.35) opacity:0`; **Dark** → sol `rotate(90deg) scale(.35) opacity:0`, lua `rotate(0) scale(1) opacity:1`.
- Clique → `onToggleTheme` do App (ou toggle local `theme`).

### 11.3 Sino + popover de notificações

- Wrapper `.senno-notif` `position:relative`. Botão `38×38px; radius:9px; border; background:background; color:foreground`; hover `accent`; `title="Notificações"`. Ícone sino `17×17px; transform-origin:top center`.
- **Dot** (se `unreadCount > 0`): `position:absolute; top:7px; right:8px; 7×7px; border-radius:99px; background:destructive; border:1.5px solid card`.
- **Shake ao clicar:** adiciona `senno-bell-ring-a` → `@keyframes senno-bell-ring .7s cubic-bezier(.36,.07,.19,.97)` (rotação amortecida 0→11→−9→6→−4→2→0). Removida no `onAnimationEnd` (`bellRing:false`). Clicar também alterna o popover.
- **Popover** (`notifOpen`): overlay `position:fixed; inset:0; z-index:40`; painel `position:absolute; top:46px; right:0; width:362px; background:popover; border:1px solid border; border-radius:12px; box-shadow:0 16px 40px -12px hsl(var(--shadow)/calc(var(--shadow-a)*3.5)); z-index:50; overflow:hidden`.
  - **Cabeçalho:** "Notificações" (`clamp(13…14.3)/600`) + pill de não-lidas (`11px/600; padding:1px 7px; radius:99px; background:hsl(var(--primary)/0.16); color:primary-text; tabular-nums`). "Marcar todas como lidas" (`11.5px/600 primary-text`; hover underline) — só se há não-lidas.
  - **Lista:** `padding:0 6px 6px; max-height:344px; overflow-y:auto`. Item (`<button>`): `display:flex; align-items:flex-start; gap:11px; padding:10px 8px; border-radius:8px; background:{rowBg}` (lida `transparent` / não-lida `hsl(var(--primary)/0.05)`); hover `accent`. Ícone tile `32×32px; border-radius:99px` (cor por tipo) + ícone interno 15px. Título `12.5px` (não-lida 600 / lida 500) + sub `11.5px muted` (trunca). À direita: hora `10.5px muted` + dot `7×7px; background:primary` se não-lida.
  - **Rodapé:** "Ver todas as notificações" centralizado (`12px/600 primary-text`), `border-top; background:hsl(var(--muted)/0.4)`.
  - **Tints por tipo:** `lead` users → `primary/0.16` / `primary-text`; `money` money → `ok-bg` / `ok`; `agenda` calendar → `accent` / `muted-foreground`; `alert` alert → `destructive/0.14` / `destructive`.
  - Clique num item → marca lido; "Marcar todas" → todas lidas. Dados: 5 notificações (§14).

### 11.4 Tooltip (`.senno-tip`) — usado na aba Ativos

Wrapper `.senno-tip`: `position:relative; display:inline-flex`. Bubble `.senno-tip-bubble`: `position:absolute; bottom:calc(100% + 8px); left:50%; transform:translateX(-50%) translateY(3px); width:max-content; max-width:240px; padding:8px 11px; border-radius:8px; background:popover; color:foreground; border:1px solid border; box-shadow:0 8px 24px -8px hsl(var(--shadow)/calc(var(--shadow-a)*3)); 12px/500; line-height:1.4; text-align:left; z-index:40; opacity:0; pointer-events:none; transition:opacity .14s, transform .14s`. Seta `::after` triangular apontando para baixo (`border-top-color:border`). No hover do wrapper: `opacity:1; transform:translateX(-50%) translateY(0)`. No real, use o `Tooltip` do shadcn.

---

## 12. Catálogo de animações

### Keyframes (no `<style>`)

| Nome              | Definição                              | Uso                                                         |
| ----------------- | -------------------------------------- | ----------------------------------------------------------- |
| `senno-bell-ring` | rotação amortecida `0→11°→−9→6→−4→2→0` | shake do sino ao clicar (`.7s`, removida no `animationend`) |

### Transições

| Elemento                                                    | Propriedade / timing                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------- |
| Indicador de aba (underline medido)                         | `transform/width .32s cubic-bezier(.34,1.1,.5,1)`, `opacity .2s` |
| Pílula segmentada (período DRE, Gerada/Recebida do gráfico) | `transform .34s cubic-bezier(.34,1.1,.5,1)`                      |
| Texto do botão segmentado                                   | `color .25s`                                                     |
| Busca (expand/collapse)                                     | `width .34s cubic-bezier(.4,0,.2,1)`, bg/border/shadow `.22s`    |
| Toggle de tema (sol↔lua)                                    | `transform .5s cubic-bezier(.34,1.3,.5,1)`, `opacity .35s`       |
| Sino (shake)                                                | `senno-bell-ring .7s cubic-bezier(.36,.07,.19,.97)`              |
| Chevron de expandir (Contas a Receber)                      | `transform .15s` (rotate 0↔90deg)                                |
| Barras do gráfico (navegação)                               | `transform 460ms cubic-bezier(0.22,1,0.36,1)`                    |
| Tooltip de ajuda (Ativos)                                   | `opacity/transform .14s`                                         |
| Card (hover)                                                | `border-color` → `hsl(var(--primary)/0.5)`                       |
| Linha de tabela (hover)                                     | `background` → `hsl(var(--accent)/0.4–0.5)`                      |

> Tom **operacional/premium**: transições curtas, leve overshoot. Nada de animação longa ou chamativa.

---

## 13. Thresholds & lógica condicional (resumo)

| Onde                               | Regra                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| KPI delta (Receita/Recebido/Lucro) | `goodUp=true`: subir é bom → verde `ok-bg`/`ok`; cair → `destructive/0.12`                                  |
| KPI delta (**Custos**)             | `goodUp=false`: **cair é bom** → verde com seta pra baixo; subir → vermelho                                 |
| KPI delta — direção                | `x > 0,05% → up`; `x < −0,05% → down`; senão `flat` (pill `muted`, sem seta)                                |
| KPI delta — sem `prev`             | pill verde, texto "novo", seta up                                                                           |
| KPIs sem delta                     | Margem líquida, Saldo projetado, Vencido, Taxa de inadimplência (razões/projeções)                          |
| Ranking — fill                     | Top compradores `primary` sólido; procedimentos/custos/vendedores `primary/0.7`; `w = valor / max(valores)` |
| Ranking — "Ver todos"              | aparece só se `total > 5`; badge "+{total−5}"; popover mostra o total                                       |
| Popover de ranking                 | `state.pop` único (`proc`/`custo`/`buyers`/`sellers`); abrir um fecha o outro; fecha no overlay             |
| DRE — linha                        | `sec:true` → linha de seção (fundo `muted/0.45`, 13.5px/600); senão subitem indentado (30px, 12.5px muted)  |
| DRE — pct                          | só Lucro Bruto / EBITDA / Lucro Líquido (todas `0,00%` no tenant esparso)                                   |
| DRE — período                      | Mês/Trimestre/Ano; decorativo no protótipo (dados fixos)                                                    |
| Contas — badge                     | `perdido`→`destructive/0.16`; `encerrada`→`muted`; `aberto`→`warn-bg`/`warn`; default `muted`               |
| Contas — ação                      | `perdido`→"Reverter" (`primary-text`); `encerrada`→"ver parcelas" (`muted`, expande)                        |
| Contas — expandir                  | só `expandable:true`; chevron rotate 0↔90°; sub-linha de parcelas com bordas tracejadas                     |
| Contas — resumo                    | Perdido = Σ `kind==='perdido'` (11); Encerradas = Σ `kind==='encerrada'` (2); Em aberto/Vencido = 0         |
| Ativos — estado                    | `ativosState` (`filled`/`empty`) alterna as 3 seções juntas (no real, separar)                              |
| Ativos intangíveis — amort./mês    | `value / lifeMonths` (negativo); total = Σ                                                                  |
| Ativos intangíveis — vida útil     | `round(lifeMonths/12)` + `" ano"`(<24m) / `" anos"`(≥24m)                                                   |
| Ativos tangíveis — equiv./mês      | `maintCost / periodMonths[maint]`; `{Mensal:1,Trimestral:3,Semestral:6,Anual:12}`                           |
| Ativos equipamentos — total        | Σ `rent` (despesa fixa mensal); status badge sempre `ok`                                                    |
| Receitas/Custos — valor            | receita `color:ok`; custo `color:destructive`; ambos `tabular-nums`                                         |
| Filtros de receita                 | popover decorativo; botão muda de estilo quando aberto (borda `ring`, texto `primary-text`)                 |
| Contador (receita/custo)           | singular/plural: "1 receita" vs "N receitas"                                                                |
| Busca                              | colapsa→ícone; expande no hover/focus (right→left); **sem popover de resultados nesta tela**                |
| Sino                               | dot se `unreadCount>0`; shake no clique; "Marcar todas como lidas" só se há não-lidas                       |

---

## 14. Dados de exemplo (fonte da verdade)

### Gráfico Receita × Custos — 18 meses (`gChartMonths`, valores em **reais literais**)

`[label, gerada, recebida, custos]`:

```
jan/2025 82/78/3 · fev/2025 88/83/3 · mar/2025 90/85/3 · abr/2025 100/94/3 · mai/2025 94/89/3 · jun/2025 102/97/3
jul/2025 96/90/3 · ago/2025 110/104/3 · set/2025 104/100/3 · out/2025 128/120/4 · nov/2025 142/138/4 · dez/2025 120/116/4
jan/2026 150/144/4 · fev/2026 168/160/5 · mar/2026 158/150/4 · abr/2026 176/170/5 · mai/2026 178/172/6 · jun/2026 200/200/5
```

(Últimos 12 entram por padrão; janela visível = 12. Deltas dos KPIs usam os 2 últimos meses.)

### KPIs Visão Geral (valores literais)

Resultado: Receita R$ 200,00 (+12,4%) · Custos R$ 5,00 (−16,7%) · Lucro líquido R$ 195,00 (+13,4%) · Margem líquida 97,5%.
Caixa: Recebido R$ 200,00 (+16,3%) · Saldo projetado (30d) R$ 372,00 · Vencido R$ 0,00 · Inadimplência 0,0%.

### Rankings (§5.4) · DRE (§6.2) · Receitas (§7.3) · Custos (§9.2) · Ativos (§10)

Ver as tabelas nas respectivas seções.

### Contas a Receber (15 títulos)

Perdidos (11, "À vista", ação "Reverter"): Klaus 23/05 R$ 1.900 · Klaus 28/05 R$ 500 · Lead teste 29/05 R$ 1.500 · Terceiro Lead Teste 30/05 R$ 1.500 · Segundo Lead Teste 30/05 R$ 500 · Quarto Lead Teste 30/05 R$ 1.500 · Segundo Lead Teste 01/06 R$ 500 · Segundo Lead Teste 02/06 R$ 2.000 · Quarto Lead Teste 02/06 R$ 4.037,50 · Quinto Lead Teste 02/06 R$ 4.000 · Sexto Lead Teste 08/06 R$ 550.
Encerrados (2, expansíveis, "ver parcelas", 0 recebido):

- Cliente teste — 2x · 0/2 pagas — R$ 2.130 → Parcela 1/2 02/06/2026 R$ 1.065 (Não paga), Parcela 2/2 02/07/2026 R$ 1.065 (Não paga).
- Klaus — 5x · 0/5 pagas — R$ 2.000 → 5 parcelas de R$ 400, vencimentos mensais 02/06 → 02/10/2026 (Não paga).
  Totais: Perdido R$ 18.487,50 · Encerradas R$ 4.130,00.

### Notificações (5) — idênticas ao Dashboard

```
1 lead   "Novo lead"               — Mariana Alves · Instagram          — agora  — não-lida
2 money  "Pagamento confirmado"    — R$ 1.200 · Botox · Camila Souza     — 8 min  — não-lida
3 agenda "Agendamento confirmado"  — Patrícia Lima · amanhã às 14h       — 40 min — não-lida
4 alert  "Tarefa atrasada"         — Retornar ligação · Rafael Dias      — 1 h    — lida
5 agenda "Novo agendamento online" — Beatriz Ramos · Limpeza de pele     — 3 h    — lida
```

---

## 15. Props/callbacks & integração com o App

**Props do Financeiro** (`data-props`, `$preview` 1440×1080):

- `defaultTheme`: enum `light | dark` (default `light`).
- `defaultTab`: enum `visao | dre | receitas | contas | custos | ativos` (default `visao`) — aba inicial.
- `ativosState`: enum `filled | empty` (default `filled`, seção "Conteúdo") — alterna as 3 seções da aba Ativos entre tabela e estado vazio.

**Callbacks/props que o App injeta:**

- `theme` (controlado externamente), `onToggleTheme()`, `onSetTheme('light'|'dark')`.
- `onNavigate(labelDaRota)` — nav da sidebar.
- `onNewLead()` — botão "Novo lead" do topbar.

**Estado interno relevante** (recriar como state/URL no real): `tab` (aba ativa), `revMode` (gráfico), `drePeriod`, `openRows` (parcelas expandidas em Contas), `pop` (popover de ranking ativo), `recFiltersOpen`, `notifOpen`/`notifs`, `bellRing`, `indLeft`/`indWidth` (medição do underline). A medição do underline roda em `componentDidMount`, `componentDidUpdate` e após `document.fonts.ready`.

**Componente importado:** `Grafico Receita.dc.html` (mesmo do Dashboard). Props passadas em §5.3. Spec do componente em `Dashboard/dashboard-handoff.md §6`.

**Ações ainda decorativas no protótipo** (ligar no real): Exportar/Importar CSV, Nova receita/Novo custo/Novo ativo/Novo aluguel, Editar/Estornar/Excluir nas tabelas, Reverter em Contas, filtros de Receitas, período da DRE, campo de busca.

---

## 16. Ordem de build sugerida + checklist

**Ordem:**

1. Tokens no `globals.css` + Inter + `tabular-nums` (ver `design.md`). _(Financeiro não usa `--info-_`.)\*
2. **Chrome** (sidebar 236px + topbar) — copie da tela já feita mais próxima.
3. **Barra de abas** com indicador medido (`offsetLeft`/`offsetWidth`, remedir em resize e `fonts.ready`).
4. Primitivos reutilizados: card, botão primário/secundário/ghost, **segmented dourado com pílula**, pill de status, **popover** (overlay + painel), tabela (header + linhas grid), tooltip, empty state composto.
5. Aba a aba, na ordem: Visão Geral → DRE → Receitas → Contas a Receber → Custos → Ativos.
6. Ligar callbacks (`onNavigate`, `onToggleTheme`, `onNewLead`) e trocar as ações decorativas por lógica real.
7. Rodar o checklist do `design.md` §9 na tela.

**Checklist específico do Financeiro:**

- [ ] Só tokens semânticos; conferir dark mode em **todas** as superfícies e nas 6 abas.
- [ ] Dois dourados nos papéis certos (`primary` superfície / `primary-text` texto/links/nav-ativo/contadores/"Ver todos").
- [ ] `tabular-nums` em: valores de KPI, R$ de tabelas, datas, parcelas, %, ticks do eixo, contadores, ranks.
- [ ] Delta de **Custos** verde ao **cair** (regra inversa ao Dashboard); `flat` cinza sem seta.
- [ ] Underline de aba **medido** e cortando no fim da última aba (não atravessa a tela).
- [ ] Botões de ação **dentro do conteúdo**, alinhados à barra de abas (nunca no topbar).
- [ ] Rankings: fill sólido só em Top compradores; demais `primary/0.7`; "Ver todos" só com excedente; popover exclusivo (um por vez) e fecha no overlay.
- [ ] Top vendedores **sem** "Ver todos" (5 itens = sem excedente).
- [ ] DRE: linhas de seção vs subitens (indentação + fundo); "(–)" preservado; pct só nos 3 subtotais.
- [ ] Receitas: valor verde (`ok`); Filtros com popover (estado do botão muda ao abrir); ações Editar/Estornar/Excluir.
- [ ] Contas: badges por kind; "Reverter" (perdido) vs "ver parcelas" (encerrada); expandir com chevron rotate + sub-linha tracejada; resumo somando os kinds.
- [ ] Custos: valor vermelho (`destructive`); ações Editar/Excluir.
- [ ] Ativos: 3 seções com tooltip de ajuda; rodapés de total (amort./mês, equiv./mês, aluguel/mês) com as fórmulas certas; estado vazio composto por seção (separar do prop único do protótipo).
- [ ] Busca: expand right→left; **sem popover de resultados** nesta tela (ou reusar o do Dashboard, à sua escolha).
- [ ] Sino: dot se não-lidas, shake no clique, "Marcar todas como lidas", linhas tintadas por tipo.
- [ ] Toggle de tema: sol no claro / lua no escuro, swap rotação+fade.
- [ ] Tabelas: dar tratamento responsivo real (o protótipo não reflui abaixo de ~1440px).
- [ ] Nunca `alert()`; erros inline; empty states com ação.
