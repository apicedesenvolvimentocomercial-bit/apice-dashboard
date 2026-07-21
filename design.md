# Senno — Design System & Padrões de UI

> Referência de design para **Senno**, SaaS multi-tenant de gestão de clínicas de estética (pt-BR).
> Marca: **dourado sobre off-white/grafite** — sóbrio, premium, operacional.
> Stack-alvo: **Next 16 + Tailwind v3 + shadcn/ui**. Este doc traduz os protótipos (`.dc.html`) para o produto real.
> Regra de ouro: **nunca use `white`/`black`/`gray-*` literais em chrome** — só tokens semânticos. Dark mode e contraste WCAG AA dependem disso.

---

## 1. Fundação de cor (tokens)

Todos os tokens são armazenados como **canais HSL sem `hsl()`** (`H S% L%`) e consumidos via `hsl(var(--token))` — o padrão shadcn. Light no `:root`/`.senno`, dark em `.dark`/`.senno[data-theme="dark"]`.

### Light (padrão)

| Token                  | Valor HSL    | Uso                                                                             |
| ---------------------- | ------------ | ------------------------------------------------------------------------------- |
| `--background`         | `38 14% 97%` | fundo da app (off-white morno)                                                  |
| `--foreground`         | `220 9% 12%` | texto principal (grafite)                                                       |
| `--card`               | `0 0% 100%`  | superfícies: cards, sidebar, topbar, popover                                    |
| `--card-foreground`    | `220 9% 12%` | texto sobre card                                                                |
| `--popover`            | `0 0% 100%`  | dropdowns, menus                                                                |
| `--primary`            | `42 53% 42%` | **dourado de superfície** — botões, fills, switch ativo                         |
| `--primary-foreground` | `225 11% 7%` | texto **escuro** sobre dourado (não é branco!)                                  |
| `--primary-text`       | `42 53% 33%` | **dourado de texto** (mais escuro, p/ AA): links, ícones-texto, nav ativo, logo |
| `--secondary`          | `38 18% 90%` | superfície secundária                                                           |
| `--muted`              | `38 18% 90%` | trilhos, chips neutros, fundos sutis                                            |
| `--muted-foreground`   | `25 15% 38%` | texto secundário                                                                |
| `--accent`             | `38 18% 90%` | hover de itens de nav/lista, nav ativo bg                                       |
| `--border`             | `38 20% 85%` | todas as bordas 1px                                                             |
| `--input`              | `38 20% 85%` | borda de inputs                                                                 |
| `--ring`               | `42 65% 52%` | anel de foco                                                                    |
| `--destructive`        | `0 72% 48%`  | erro, exclusão, badge não-lido                                                  |

### Dark

| Token                                  | Valor HSL                                 |
| -------------------------------------- | ----------------------------------------- |
| `--background`                         | `225 11% 7%`                              |
| `--foreground`                         | `38 33% 96%`                              |
| `--card` / `--popover`                 | `220 9% 11%`                              |
| `--primary`                            | `42 65% 58%`                              |
| `--primary-foreground`                 | `225 11% 7%` (continua escuro)            |
| `--primary-text`                       | `42 65% 58%` (no dark = mesmo do primary) |
| `--secondary` / `--muted` / `--accent` | `220 9% 16%`                              |
| `--muted-foreground`                   | `38 15% 65%`                              |
| `--border` / `--input`                 | `220 9% 18%`                              |
| `--ring`                               | `42 65% 58%`                              |
| `--destructive`                        | `0 63% 50%`                               |

### Cores de status (semânticas)

Cada uma tem par **texto + fundo** (bg claríssimo em light, escuro dessaturado em dark). Sempre use como par.

| Papel                           | Token texto | Token fundo | Light (texto / fundo)         | Dark (texto / fundo)          |
| ------------------------------- | ----------- | ----------- | ----------------------------- | ----------------------------- |
| Sucesso / confirmado / positivo | `--ok`      | `--ok-bg`   | `142 55% 30%` / `142 50% 91%` | `142 58% 64%` / `142 45% 15%` |
| Aviso / pendente / atrasado     | `--warn`    | `--warn-bg` | `32 80% 32%` / `38 88% 90%`   | `38 85% 66%` / `36 55% 15%`   |
| Info / lead / neutro-frio       | `--info-t`  | `--info-bg` | `217 65% 40%` / `214 90% 93%` | `214 85% 72%` / `217 50% 17%` |

### Sombra tingida

Sombras usam um token de cor + alpha, nunca preto puro no light:

```
--shadow: 220 28% 22%;  --shadow-a: 0.07;   /* light: azul-grafite bem sutil */
--shadow: 0 0% 0%;      --shadow-a: 0.4;    /* dark: preto */
```

Aplicação: `box-shadow: 0 1px 2px hsl(var(--shadow)/var(--shadow-a))` (cards). Elevação maior multiplica o alpha: `hsl(var(--shadow)/calc(var(--shadow-a) * 4))` (moldura da app), `* 3.5` (popovers).

### Bloco `:root` pronto (Tailwind/shadcn `globals.css`)

```css
:root {
  --background: 38 14% 97%;
  --foreground: 220 9% 12%;
  --card: 0 0% 100%;
  --card-foreground: 220 9% 12%;
  --popover: 0 0% 100%;
  --popover-foreground: 220 9% 12%;
  --primary: 42 53% 42%;
  --primary-foreground: 225 11% 7%;
  --primary-text: 42 53% 33%;
  --secondary: 38 18% 90%;
  --secondary-foreground: 25 47% 18%;
  --muted: 38 18% 90%;
  --muted-foreground: 25 15% 38%;
  --accent: 38 18% 90%;
  --accent-foreground: 25 47% 18%;
  --destructive: 0 72% 48%;
  --destructive-foreground: 0 0% 100%;
  --border: 38 20% 85%;
  --input: 38 20% 85%;
  --ring: 42 65% 52%;
  --ok: 142 55% 30%;
  --ok-bg: 142 50% 91%;
  --warn: 32 80% 32%;
  --warn-bg: 38 88% 90%;
  --info-t: 217 65% 40%;
  --info-bg: 214 90% 93%;
  --shadow: 220 28% 22%;
  --shadow-a: 0.07;
  --radius: 0.75rem;
}
.dark {
  --background: 225 11% 7%;
  --foreground: 38 33% 96%;
  --card: 220 9% 11%;
  --card-foreground: 38 33% 96%;
  --popover: 220 9% 11%;
  --popover-foreground: 38 33% 96%;
  --primary: 42 65% 58%;
  --primary-foreground: 225 11% 7%;
  --primary-text: 42 65% 58%;
  --secondary: 220 9% 16%;
  --secondary-foreground: 38 33% 96%;
  --muted: 220 9% 16%;
  --muted-foreground: 38 15% 65%;
  --accent: 220 9% 16%;
  --accent-foreground: 38 33% 96%;
  --destructive: 0 63% 50%;
  --border: 220 9% 18%;
  --input: 220 9% 18%;
  --ring: 42 65% 58%;
  --ok: 142 58% 64%;
  --ok-bg: 142 45% 15%;
  --warn: 38 85% 66%;
  --warn-bg: 36 55% 15%;
  --info-t: 214 85% 72%;
  --info-bg: 217 50% 17%;
  --shadow: 0 0% 0%;
  --shadow-a: 0.4;
}
```

No `tailwind.config`, estenda `colors` mapeando cada um para `hsl(var(--token) / <alpha-value>)`, incluindo os extras (`primary-text`, `ok`, `ok-bg`, `warn`, `warn-bg`, `info`, `info-bg`).

---

## 2. Regras de cor (não quebrar)

1. **Sempre token semântico** para chrome. Nunca `white`/`black`/`gray-*` em texto, fundo ou borda.
2. **Dois tons de dourado, papéis distintos:**
   - **Superfície** (`bg-primary` + `text-primary-foreground` escuro): botões preenchidos, fills de gráfico/funil, switch ativo, avatar, logo.
   - **Texto** (`text-primary-text`, dourado escuro): links, ícones-texto, item de nav ativo, "Ver tudo", contadores dourados.
   - ⚠️ Nunca use `--primary` em texto pequeno sobre fundo claro — não passa AA. Use `--primary-text`.
3. Texto secundário → `muted-foreground`. Bordas → `border`. Foco → `ring` (anel `0 0 0 3px hsl(var(--ring)/0.18)`).
4. Status sempre em par texto+fundo (`ok`/`ok-bg`, etc.). Badge de exclusão/erro/não-lido → `destructive`.
5. Tints translúcidos do dourado para hierarquia sutil: `hsl(var(--primary)/0.16)` (badge), `/0.2` (avatar), `/0.05` (linha não-lida), degraus de `0.24–0.66` para séries de dados.

---

## 3. Tipografia

- **Família:** `Inter` (Google Fonts, pesos 400/500/600/700). Fallback `system-ui, -apple-system, sans-serif`. _(Ranade foi descartada.)_
- **Pesos:** 500 (corpo/labels), 600 (títulos, ênfase, nav, botões), 700 (valores KPI grandes).
- **`font-variant-numeric: tabular-nums`** obrigatório em KPIs, horários, contadores, valores R$ e tabelas — números não "dançam".
- `-webkit-font-smoothing: antialiased` no container raiz.
- **Escala observada:** h1 topbar 22px/600/`-0.01em`; título de card 15px/600; label de KPI 12.5px/600; valor de KPI 27px/700/`-0.02em`; corpo 12.5–13.5px; meta/caption 11–11.5px; overline de seção 11px/600/`0.07em`/uppercase.
- Copy em **sentence case**. Sem "Oops!". Português-BR, tom profissional.

---

## 4. Chrome compartilhado (idêntico em todas as telas)

Layout: moldura arredondada (`max-width:1376px`, `border-radius:16px`, `border`, sombra grande) contendo **sidebar fixa + coluna principal (topbar + corpo rolável)**. App usa `height:100vh`, `overflow:hidden`, padding externo `28px 32px`.

### Sidebar — 236px

- `bg-card`, `border-right`, padding `18px 14px`, coluna flex.
- **Topo:** logo "B" (34px, `bg-primary`, `text-primary-foreground`, radius 9px) + "Clínica Bellavie" (14/600) / "Plano Premium" (11px muted).
- **Nav (menu plano, sem seções), ordem fixa:** Dashboard · Atividades · Agenda · Funil · Pacientes · Financeiro · Metas · Insights · Procedimentos · Exportações · Notificações · Configurações.
  - Item: `<a>` flex, gap 11px, padding `8px 10px`, radius 8px, 13.5px.
  - Inativo: `text-muted-foreground` weight 500; hover `bg-accent`.
  - **Ativo:** `text-primary-text` + `bg-accent` + weight 600 (ícone também `primary-text`).
  - Badge opcional: pill `bg-primary/0.16` + `text-primary-text`.
- **Rodapé (mt-auto):** card `bg-muted` radius 10px com avatar "HC" (`bg-primary/0.2`, `text-primary-text`) + "Dra. Helena Costa" / "Proprietária".

### Topbar

- `bg-card`, `border-bottom`, padding `14px 24px`, flex align-center gap 16px.
- **Esquerda:** título da página `<h1>` 22px/600.
- **Direita (gap 9px), em TODAS as telas exceto Funil** (que tem busca própria):
  1. **Busca** "Buscar paciente…" — colapsa para ícone 38px, expande p/ 240px no hover/focus (right→left), abre popover de resultados com highlight do termo, avatar de iniciais, badge de status, empty state e rodapé "Ver todos".
  2. **Toggle de tema** — botão 38px; **sol no claro / lua no escuro** (swap com rotação+fade).
  3. **Sino de notificações** — 38px, dot `destructive` se há não-lidas, shake ao clicar; popover com contador, "Marcar todas como lidas", linhas tintadas por tipo, rodapé "Ver todas".
  4. **Botão dourado "Novo lead"** — 38px alt, `bg-primary` + `text-primary-foreground`, ícone `+`, hover `brightness(1.05)`.
- **Botão de ação da página fica DENTRO do conteúdo** (alinhado à barra de abas), nunca no header.

---

## 5. Componentes & padrões recorrentes

### Card

`bg-card` + `1px border` + `border-radius: 11–13px` + sombra tingida sutil (`0 1px 2px hsl(var(--shadow)/var(--shadow-a))`). Hover eleva a borda p/ `hsl(var(--primary)/0.5)`. Padding típico 16–20px.

### Botões

- **Primário:** `bg-primary` / `text-primary-foreground`, radius 9px, altura 38px (32px em contexto compacto), weight 600, ícone opcional 14–15px, hover `filter:brightness(1.05)`.
- **Secundário/ghost:** `bg-background` + `border-input`, `text-foreground`, hover `bg-accent`.
- **Destrutivo inline:** borda/texto `destructive`, fundo transparente ou `destructive/0.1`.

### Switch / segmented control (dourado)

Trilho `bg-muted` + `border`, padding 3px, radius 9px. **Pílula deslizante** (`position:absolute`, `transform:translateX(idx*100%)`, transição `.34s cubic-bezier(.34,1.1,.5,1)`). Item ativo = `bg-primary` + `text-primary-foreground`; inativo `text-muted-foreground`. Variante "card" usa pílula `bg-card` + texto `foreground` (ex.: tabs de estado).

### Abas de conteúdo (underline)

Barra flex com `border-bottom:1px`. **Indicador de 2px dourado** (`bg-primary`, radius 2px) posicionado/dimensionado por medição do tab ativo (`offsetLeft`/`offsetWidth`), animado. **A linha corta no fim da última aba — não atravessa a largura toda.** Aba pode ter badge-contador (pill): ativo `primary/0.16`+`primary-text`, atrasadas `destructive/0.15`+`destructive`, neutro `muted`.

### Chips / filtros

Pills `bg-muted`/`border`, texto `muted-foreground`; selecionado ganha `bg-accent` + `primary-text`. Botão de filtros usa ícone "sliders".

### KPI card

Ícone 14px muted + label 12.5/600; valor 27px/700 tabular; linha de delta = pill de status (`↑` verde `ok-bg`/`ok`, custo que sobe é ruim → `destructive/0.12`+`destructive`) + sub em muted. Agrupados por setor com overline uppercase.

### Gráficos (sem libs pesadas nos protótipos — CSS puro)

- **Barras:** trilho `bg-muted` radius 6px, fill `bg-primary` (1º item) ou `primary/0.62` (demais).
- **Donut:** `conic-gradient` com degraus de alpha do dourado (`1 → 0.66 → 0.42 → 0.24`); miolo `bg-card` com total.
- **Funil:** barras com alpha crescente conforme a etapa; % em `primary-foreground` alinhado à direita.
- **Progresso de meta:** trilho `bg-muted` 8px; fill `bg-primary`, vira `bg-ok` quando ≥85%.
- No produto real, use **Recharts** (ou similar) mapeando `stroke/fill` para os tokens.

### Estados (todos obrigatórios por tela)

- **Hover / active / focus** em tudo interativo.
- **Empty state composto:** ícone + título + texto de apoio + ação (nunca só "vazio").
- **Skeleton** no lugar de spinner: blocos `border-radius` com shimmer `linear-gradient(90deg, muted 25%, accent 37%, muted 63%)` + `background-size:220%` + animação 1.5s.
- **Erro inline** (nunca `alert()`): caixa `destructive/0.1` + borda `destructive/0.3`, ícone de alerta, botão "Recarregar".

### Calendário / seletor de data (`components/ui/calendar.tsx`)

Componente **próprio** — o popup nativo do `input[type="date"]` não é estilizável
(fim-de-semana em vermelho, tipografia do SO, `<select>` de mês fora do chrome) e por
isso foi abandonado. Sem dependência nova: a grade é calculada no componente.

- **Popover** `bg-popover` + radius 12px + `shadow-pop`, largura 276px, **altura fixa** —
  trocar de painel ou de mês não redimensiona o balão.
- **Cabeçalho:** `‹ julho de 2026 ›` (13.5/600). O rótulo é botão e cicla os painéis
  **dias → meses → anos**; as setas mudam a unidade do painel visível (mês / ano / página
  de 12 anos). Salto rápido a anos distantes sem N cliques — importante p/ nascimento.
- **Grade:** cabeçalho de semana em overline (11px/600/`0.07em`/uppercase, `muted-foreground`);
  células 36px radius 8px, `tabular-nums`; **sempre 6 semanas** (altura estável).
- **Cores — só dois papéis ganham cor** (mesma regra da Agenda): **selecionado** =
  `bg-primary` + `text-primary-foreground`; **hoje** = `bg-primary/10` + `text-primary-text`.
  Dias de fora do mês `muted-foreground/45`, fora da faixa min/max `muted-foreground/35`.
  **Fim de semana não é colorido** — era invenção do nativo.
- **Rodapé:** "Hoje" (`primary-text`) e "Limpar" (`muted-foreground`), separados por `border-t`.
- **Teclado (roving tabindex, padrão APG):** setas = ±1 dia / ±1 semana, Home/End = extremos
  da semana, PageUp/Down = ±1 mês, Enter = seleciona, Esc = fecha. Ao abrir, o foco vai no
  dia selecionado (não na seta de navegação).
- Consumido pelo `DateInput`, onde o picker é **ligado por padrão** — todo campo de data do
  sistema oferece o calendário e um campo novo já nasce com ele (`withPicker={false}` só onde
  o ícone não couber). A máscara digitável segue sendo a via principal; o ícone é o atalho de
  apontar-e-clicar. `min`/`max` desabilitam dias e setas.
- ⚠️ Com o picker ligado o input ganha um **wrapper `relative`**, e é ele que participa do
  layout: **largura/flex vão em `containerClassName`**, não no `className` do input (que fica
  `w-full`). Nenhum `input[type="date"]` cru deve voltar ao código — ele traz o popup do SO.

### Campo de data e hora (`components/ui/date-time-input.tsx`)

Substitui o `<input type="datetime-local">` (mesmo popup do SO). **UM campo com borda única
contendo DOIS controles**: `DateInput` (com o calendário) + divisor `w-px bg-border` +
`TimeInput`, dentro de uma caixa `h-9` com `focus-within:ring-1`. A borda é da CAIXA — o
estado de erro (`invalid`) pinta ela de `destructive`, nunca um vermelho literal.

- `value`/`onChange` seguem no formato do `datetime-local` (`"YYYY-MM-DDTHH:mm"`) — a troca
  é drop-in para quem lê `e.target.value`.
- **Metade preenchida emite `''`** (data sem hora não é um datetime), mas isso NÃO apaga o
  que o usuário já digitou: o componente guarda o último valor emitido para distinguir esse
  eco de um reset externo de verdade (diálogo reabrindo), que aí sim limpa os dois lados.
- A hora fica desabilitada enquanto não há data. `min`/`max` recebem datetime; só a parte de
  DATA chega ao calendário (o limite de hora segue nas validações do próprio formulário).
- Usado em: nova consulta e remarcar (Agenda), agendar e remarcar lead (Funil).
- ⚠️ **Precisa de ~260px.** São dois campos e dois ícones: a hora ocupa 104px fixos e a data
  fica com o resto, do qual 60px são padding (`px-3` + a bitola do ícone). Num `grid-cols-2`
  de um diálogo `sm:max-w-md` a caixa fica com 193px e o placeholder da data é cortado
  ("DD/M"). Nesses diálogos o padrão é **`grid-cols-3` com o campo em `col-span-2`** (a
  "Duração (min)" ao lado vive bem com 1 coluna) → caixa de 261px. Em container de largura
  cheia (ex.: o painel de reagendar) não há problema.

### Popovers / dropdowns

`bg-popover` + `border` + radius 12px + sombra `hsl(var(--shadow)/calc(var(--shadow-a)*3.5))`. Overlay `fixed inset-0` para fechar ao clicar fora; "Esc para fechar". Rodapé com link `primary-text` "Ver todos".

### Padrões por tela (já construídas)

- **Funil (kanban):** abas Comercial/Retenção em switch dourado; colunas em container fluido; card vazio tracejado; "+" só na 1ª etapa (Lead).
- **Atividades:** chips de pastas/cargos + abas Hoje/Semana/Atrasadas/Todas/Feitas com contadores; banner de atrasada; ícone por tipo de tarefa (ícone padrão p/ tipo personalizado).
- **Agenda:** sub-abas Agendamentos (grade semanal) e Calendário (mês). **Cor reservada só para HOJE (dourado suave) e dias FECHADOS (hachura cinza diagonal)**; eventos num único tratamento dourado calmo. Toolbar com botão de filtros.

---

## 6. Ícones

- **SVG stroke inline**, `viewBox="0 0 24 24"`, `fill:none`, `stroke:currentColor`, `stroke-width:2`, `linecap/linejoin:round`. Herdam cor via `currentColor`.
- Tamanhos: 18px (nav), 14–17px (topbar/labels), 11px (delta). Cor por contexto (muted, primary-text, status).
- **Set já existente — reutilize, não invente:** grid, activity, calendar, funnel, users, money, target, bulb (ideia/Insights), syringe, download, bell, settings, search (lupa=busca), plus, chevron L/R/down, phone, message, check, check-square, folder, alert, sun, moon, sliders (filtros), user-plus, user-x, clock, receipt, wallet, chart, tag, heart, trend, spark.
- **Convenção:** lupa = busca; lâmpada = Insights/ideia.
- No produto real: **lucide-react** cobre esse set 1:1 (mesmo estilo stroke-24).

---

## 7. Movimento

- Transições curtas, `cubic-bezier` com leve overshoot: pílula segmentada `.34s cubic-bezier(.34,1.1,.5,1)`; underline de aba idem; busca `.34s cubic-bezier(.4,0,.2,1)`.
- Toggle de tema: rotação+escala+fade `.5s`. Sino: shake `senno-bell-ring .7s` ao clicar.
- Skeleton shimmer 1.5s ease-in-out infinite.
- Hover de card: transição sutil de `border-color` p/ dourado.
- Sem animações longas ou chamativas — tom operacional/premium.

---

## 8. Conteúdo & dados

- Dados de exemplo **brasileiros realistas**: nomes (Mariana Costa, Bruno Almeida…), R$ com ponto de milhar, telefones `(11) 9xxxx-xxxx`, procedimentos reais (Botox, preenchimento, microagulhamento, limpeza de pele, peeling, drenagem).
- Sentence case; sem emoji (não faz parte da marca).
- KPIs com % comparativa vs. período anterior; setores Financeiro / Comercial / Operação.

---

## 9. Checklist ao criar uma tela nova

1. Reaproveite o **chrome** (sidebar + topbar) exatamente — copie da tela mais parecida.
2. Só **tokens semânticos**; verifique dark mode.
3. Dois dourados nos papéis certos (`primary` superfície / `primary-text` texto).
4. `tabular-nums` em todo número.
5. Botão de ação **dentro do conteúdo**, alinhado às abas.
6. Cubra os 4 estados: carregado, skeleton, vazio (composto), erro (inline).
7. hover/active/focus em tudo; anel de foco `ring`.
8. Ícones do set existente (lucide no real).
9. Abas: underline 2px que corta no fim da última aba.
10. Empty states com ação; nunca `alert()`.
