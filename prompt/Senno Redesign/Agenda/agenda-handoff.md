# Agenda — Handoff detalhado (item a item)

> Especificação granular da tela **Agenda** (`Agenda.dc.html`).
> Objetivo: reconstruir **cada elemento visual, medida, threshold e animação** no stack real
> (Next 16 + Tailwind v3 + shadcn/ui) sem improviso. **Nada aqui é opcional.**
>
> **Como usar este doc**
>
> 1. Leia `design.md` primeiro (tokens, regras de cor, tipografia, chrome). Este arquivo **não repete** os tokens globais — assume que já estão no `globals.css`. A única exceção é a seção 0.1, que documenta um token **novo**, introduzido por esta tela e ainda não presente no `design.md`.
> 2. Toda cor é token semântico via `hsl(var(--token))`. Onde aparece `primary/0.16`, leia `hsl(var(--primary) / 0.16)`.
> 3. Todo número (px, %, peso, threshold) é **literal do protótipo** — reproduza exatamente.
> 4. O `.dc.html` usa um runtime de protótipo próprio — **não copie a sintaxe de template**. Recrie em React/TSX. Ícones → `lucide-react`.
> 5. **Esta tela tem partes decorativas/não conectadas no protótipo** (setas de período, botão "Hoje", "Filtros", botão de ação, "Novo lead", campo de busca). Cada uma está marcada explicitamente como **[NÃO CONECTADO NO PROTÓTIPO]** com a integração esperada no real — não assuma que o clique já faz algo.

---

## 0. Índice

0.1. Token novo introduzido por esta tela (`--grid`)

1. Estrutura geral da página
2. Sidebar (236px) — item a item
3. Topbar — versão Agenda (abas substituem o `<h1>`; busca; tema; sino; Novo lead)
4. Toolbar de período + seletor de visão + ação da página
5. Grade **Dia**
6. Grade **Semana** (aba Agendamentos) — inclui a mecânica `.appt-mini`
7. Grade **Mês** (aba Calendário)
8. **Lista**
9. Legendas (Hoje / Fechado)
10. Estados (carregado / skeleton / vazio / erro) — lacuna a preencher
11. Catálogo de animações (keyframes + transições)
12. Thresholds & lógica condicional (tabela única)
13. Dados de exemplo (fonte da verdade)
14. Props do componente & integração com o App
15. Ordem de build sugerida + checklist

---

## 0.1 Token novo: `--grid`

Esta tela declara um token de cor que **não existe em `design.md`**: `--grid`, usado para as linhas finas de hora/dia dentro das grades (Dia/Semana/Mês). É mais sutil que `--border` e ligeiramente diferente de `--muted`.

| Tema  | Valor HSL    | Comparar com                                                                    |
| ----- | ------------ | ------------------------------------------------------------------------------- |
| Light | `38 16% 88%` | `--border: 38 20% 85%` · `--muted: 38 18% 90%` (próximo, mas distinto dos dois) |
| Dark  | `220 9% 16%` | **igual** a `--muted` no dark (`220 9% 16%`)                                    |

**Ação recomendada:** adicionar `--grid` ao bloco `:root`/`.dark` do `design.md` e ao `tailwind.config`, em vez de reaproveitar `--border` ou `--muted` — os valores em light são propositalmente diferentes.

---

## 1. Estrutura geral da página

### Container raiz

`.senno` com `data-theme` (`light|dark`) e `data-font="inter"`. `background:hsl(var(--background))`, `color:hsl(var(--foreground))`, `height:100vh`, `overflow:hidden`, `line-height:1.45`, `font-family:Inter`, `-webkit-font-smoothing:antialiased`.

### Moldura da app

`data-screen-label="Agenda"` — `width:100%; height:100%; display:flex; overflow:hidden; background:hsl(var(--background))`.

```
[ SIDEBAR 236px fixa ] [ MAIN flex:1 -> (TOPBAR fixo) + (BODY rolável) ]
```

- **MAIN:** `flex:1; min-width:0; min-height:0; display:flex; flex-direction:column`.
- **BODY rolável:** `flex:1; min-height:0; overflow-y:auto; padding:18px 24px; display:flex; flex-direction:column; gap:14px`. Só o body rola.

### Ordem vertical do body (gap 14px)

1. Toolbar (navegação de período + seletor de visão + ação)
2. Grade da visão ativa (Dia **ou** Semana **ou** Mês **ou** Lista — mutuamente exclusivas)
3. Legenda (só aparece nas visões **Semana** e **Mês**; Dia e Lista não têm legenda — ver §9)

### Breakpoints

Mesmas media queries globais do design system (`@media (max-width:1024px)` e `(max-width:660px)` para `.senno-2col`/`.senno-3col`) — **não usadas nesta tela**, que não tem grids `2col`/`3col`. Não há breakpoint próprio definido para as grades de agenda; abaixo de ~900px de largura as 7 colunas da semana e do mês vão espremer sem colapsar — **gap a resolver na implementação real** (ex.: `overflow-x:auto` na grade abaixo de um breakpoint, ou empilhar em Lista).

---

## 2. Sidebar — 236px (chrome padrão, idêntico às outras telas)

Ver `design.md` §4 para a especificação completa. Nesta tela, o item ativo da nav é **Agenda** (`icoCalendar`, `weight:600`, `color:hsl(var(--primary-text))`, `background:hsl(var(--accent))`); os outros 11 itens ficam inativos (`weight:500`, `color:hsl(var(--muted-foreground))`).

Ordem fixa (12 itens): Dashboard · Atividades · **Agenda** (ativo) · Funil · Pacientes · Financeiro · Metas · Insights · Procedimentos · Exportações · Notificações · Configurações. Clique em qualquer item chama `props.onNavigate(label)` (com `preventDefault` no evento).

Rodapé idêntico: avatar "HC" + "Dra. Helena Costa" / "Proprietária".

---

## 3. Topbar — versão Agenda

`header`: `flex:none; display:flex; align-items:center; gap:16px; padding:14px 24px; border-bottom:1px solid hsl(var(--border)); background:hsl(var(--card))`.

### 3.1 Esquerda — abas Agendamentos/Calendário **substituem o `<h1>`**

⚠️ **Diferença estrutural em relação às outras telas:** nas demais telas, a esquerda do header é um `<h1>` com o título da página (`design.md` §4). Na Agenda, esse espaço é ocupado pelas **duas abas de nível superior**, renderizadas no **mesmo tamanho de fonte do `<h1>`** — elas _são_ o título da página.

Wrapper: `flex:1; min-width:0; display:flex; align-items:stretch; gap:2px; align-self:stretch; margin:-14px 0; border-bottom:1px solid hsl(var(--border))`. A margem negativa (`-14px`, igual ao padding vertical do header) estica o wrapper para cobrir toda a altura do header — o `border-bottom` do wrapper cai exatamente sobre o `border-bottom` do próprio `<header>`, então visualmente é **uma única linha contínua** (não há "corte" visível; a regra de "linha corta no fim da última aba" do `design.md` §5 não se aplica aqui, pois o wrapper é `flex:1` e ocupa todo o espaço até os controles da direita).

Cada aba é um `<button>`:

```
display:flex; align-items:center; justify-content:center; border:none; background:transparent;
cursor:pointer; font-family:inherit;
font-size:clamp(22px, 0.5vw + 18px, 27px); font-weight:600; letter-spacing:-0.01em;
padding:0 14px; margin-bottom:-1px;
transition:color .15s, border-color .15s;
```

- **Ativa:** `color:hsl(var(--foreground))`; `border-bottom:2px solid hsl(var(--primary))`.
- **Inativa:** `color:hsl(var(--muted-foreground))`; `border-bottom:2px solid transparent` (reserva o mesmo espaço — sem _layout shift_ ao trocar).
- `margin-bottom:-1px` sobrepõe o sublinhado de 2px exatamente na borda de 1px do header, evitando um degrau de espessura.

Abas: **"Agendamentos"** (`tab:'agendamentos'`) e **"Calendário"** (`tab:'calendario'`). Clique → `goAgenda`/`goCalendar`, ambos **funcionais** (`setState({tab:...})`). Trocar de aba preserva a última visão usada em cada aba (ver §4.2).

### 3.2 Direita — busca, tema, sino, Novo lead

Mesma ordem e mesmos componentes do padrão global (`design.md` §4): **Busca → Tema → Sino → Novo lead**, `display:flex; align-items:center; gap:9px`.

#### Busca "Buscar paciente…" — **[NÃO CONECTADO NO PROTÓTIPO]**

Marcação e CSS de expansão (`.senno-search`/`.senno-search-box`) são **idênticos** ao padrão documentado no `dashboard-handoff.md` §3.1 (colapsa para ícone 38px; expande para 240px right→left no hover/`:focus-within`; `transition:width .34s cubic-bezier(.4,0,.2,1)`; anel de foco `ring`). **Porém, nesta tela o campo é puramente visual**: não há `state.query`, `state.searchOpen`, popover de resultados, highlight de termo, nem empty state ligados no `Agenda.dc.html` — só o input em si. **Integração real:** reaproveitar 1:1 o popover de resultados especificado no `dashboard-handoff.md` §3.1 (avatar de iniciais, realce do termo, pill de status, empty composto, rodapé "Ver todos os pacientes").

#### Toggle de tema

Idêntico ao padrão global (`design.md` §4, `dashboard-handoff.md` §3.2): sol↔lua com `rotate + scale + opacity`, `transition:transform .5s cubic-bezier(.34,1.3,.5,1), opacity .35s`. **Funcional** — `toggleTheme` chama `props.onToggleTheme()` se existir, senão alterna `state.theme` localmente.

#### Sino de notificações

Idêntico ao padrão global (`dashboard-handoff.md` §3.3): dot de não-lidas, shake `senno-bell-ring` no clique, popover com contador + "Marcar todas como lidas" + linhas tintadas por tipo + rodapé "Ver todas as notificações". **Totalmente funcional** nesta tela (mesma implementação `_notif()`, ver §13.2 para os dados). Tints por tipo — mesma tabela do Dashboard:

| tipo     | ícone    | fundo                          | cor                            |
| -------- | -------- | ------------------------------ | ------------------------------ |
| `lead`   | users    | `hsl(var(--primary)/0.16)`     | `hsl(var(--primary-text))`     |
| `money`  | money    | `hsl(var(--ok-bg))`            | `hsl(var(--ok))`               |
| `agenda` | calendar | `hsl(var(--accent))`           | `hsl(var(--muted-foreground))` |
| `alert`  | alert    | `hsl(var(--destructive)/0.14)` | `hsl(var(--destructive))`      |

#### Botão "Novo lead" — **[NÃO CONECTADO NO PROTÓTIPO]**

Mesma marcação do padrão global: `height:38px; padding:0 15px; border-radius:9px; background:hsl(var(--primary)); color:hsl(var(--primary-foreground)); font-size:clamp(13px,0.14vw+11.2px,14.3px); font-weight:600; display:flex; align-items:center; gap:7px`; hover `filter:brightness(1.05)`; ícone `+` 15px.
⚠️ O template referencia `onClick="{{ onNewLead }}"`, mas **`renderVals()` não expõe essa chave** (nem faz _passthrough_ de `this.props.onNewLead`) — o clique não faz nada no protótipo atual. **Integração real:** ligar a `props.onNewLead()`, igual às outras telas.

---

## 4. Toolbar de período + seletor de visão + ação

Linha única: `display:flex; align-items:center; gap:14px; flex-wrap:wrap`.

### 4.1 Grupo esquerdo — navegação de período **[NÃO CONECTADO NO PROTÓTIPO]**

- **Par de setas** dentro de uma pílula: `display:flex; align-items:center; border:1px solid hsl(var(--border)); border-radius:9px; overflow:hidden`. Cada botão `34×34px`, `background:hsl(var(--card))`, ícone chevron `16px`; hover `background:hsl(var(--accent))`; a seta esquerda tem `border-right:1px solid hsl(var(--border))` como divisor.
- **Botão "Hoje":** `height:34px; padding:0 14px; border-radius:9px; border:1px solid hsl(var(--border)); background:hsl(var(--card)); font-size:clamp(13px,0.14vw+11.2px,14.3px); font-weight:600`; hover `accent`.
- Nenhum dos três botões tem `onClick` no template — **hover funciona, clique não faz nada**. `rangeTitle` e o conteúdo das grades são **strings fixas** (não há data real por trás — ver §13.1). **Integração real:** as setas devem avançar/retroceder o período de acordo com a visão ativa (dia/semana/mês) e "Hoje" deve resetar para a data atual; `rangeTitle` e os dados da grade passam a ser derivados dessa data, não mais hardcoded.

### 4.2 Centro — título do período

`flex:1; text-align:center; font-size:15.5px; font-weight:600`. Texto (`rangeTitle`) depende da visão:
| Visão | `rangeTitle` |
|---|---|
| Mês | `junho de 2026` |
| Dia | `qui. 25 de jun. de 2026` |
| Semana / Lista | `21 – 27 de jun. de 2026` |

### 4.3 Grupo direito

#### Seletor de visão (segmented dourado)

Trilho: `position:relative; display:grid; grid-auto-flow:column; grid-auto-columns:1fr; padding:3px; border-radius:9px; background:hsl(var(--muted)); border:1px solid hsl(var(--border))`. Pílula deslizante absoluta: `width:calc((100% - 6px)/4)`, `transform:translateX(idx×100%)`, `background:hsl(var(--primary))`, `border-radius:7px`, `box-shadow:0 1px 2px hsl(var(--shadow)/var(--shadow-a))`, `transition:transform .34s cubic-bezier(.34,1.1,.5,1)`. Botões (`z-index:1`, `font-size:12.5px`, `font-weight:600`, `padding:6px 13px`, `border-radius:7px`, `transition:color .25s`): ativo `color:hsl(var(--primary-foreground))`, inativo `color:hsl(var(--muted-foreground))`.

4 opções, **totalmente funcionais**: **Dia · Semana · Mês · Lista** (`onClick` chama `setState(views: {...views, [tab]: k})`).

**Persistência por aba:** `state.views = { agendamentos: 'semana', calendario: 'mes' }` — cada aba de nível superior guarda sua **própria** última visão selecionada. Trocar de "Agendamentos" para "Calendário" e voltar preserva o que cada uma estava mostrando (ex.: deixar "Calendário" em Lista e voltar a ele depois mantém Lista). Estado inicial ao carregar: aba **Agendamentos**, visão **Semana**.

#### Botão "Filtros" — **[NÃO CONECTADO NO PROTÓTIPO]**

`38×38px; border-radius:9px; border:1px solid hsl(var(--border)); background:hsl(var(--card))`; ícone `sliders` 17px; `title="Filtros"`. Sem `onClick`. **Integração real:** abrir painel/popover de filtros (por profissional, procedimento, status) — ainda não especificado; **perguntar ao design antes de inventar o conteúdo do painel**.

#### Botão de ação da página — **[NÃO CONECTADO NO PROTÓTIPO]**

`height:38px; padding:0 14px; border-radius:9px; background:hsl(var(--primary)); color:hsl(var(--primary-foreground)); font-weight:600; display:inline-flex; align-items:center; gap:7px`; hover `brightness(1.05)`. Label/ícone mudam com a visão:
| Visão | Ícone | Label |
|---|---|---|
| Mês | `icoCalPlus` (calendário com `+`) | "Novo evento" |
| Dia / Semana / Lista | `icoPlus` (`+`) | "Novo agendamento" |

Sem `onClick` no template. Segue a regra do `design.md` §4 ("botão de ação da página fica dentro do conteúdo, alinhado à barra de abas") — aqui a "barra de abas" é a própria toolbar de período/visão.

---

## 5. Grade **Dia**

Renderizada quando `isDay` (visão = "dia"). Card: `border:1px solid hsl(var(--border)); border-radius:13px; overflow:hidden; background:hsl(var(--card))`.

### 5.1 Cabeçalho do dia

`display:grid; grid-template-columns:58px 1fr; border-bottom:1px solid hsl(var(--border))`. Célula do gutter (58px) vazia com `border-right:1px solid hsl(var(--grid))`. Célula do dia: `padding:10px 14px; background:{dayHeadBg}; display:flex; align-items:baseline; gap:10px` — label `13.5px/600; color:{dayHeadColor}` + contagem `12px muted`.

Nesta tela, **o dia exibido é sempre a quinta-feira 25/06 (hoje)** — não há seleção de outro dia (consequência das setas não conectadas, §4.1). Por isso `dayHeadBg = hsl(var(--primary)/0.06)` (tom "hoje") e `dayHeadColor = hsl(var(--primary-text))` sempre. Label fixo: **"quinta-feira, 25 de junho"**. Contagem: **"5 agendamentos"**.

### 5.2 Corpo — gutter de horas + coluna do dia

`display:grid; grid-template-columns:58px 1fr`.

- **Gutter:** 13 células de `height:66px`, uma por hora de **07:00** a **19:00**; `padding:5px 8px 0; text-align:right; font-size:11px; font-variant-numeric:tabular-nums; color:hsl(var(--muted-foreground))`.
- **Coluna do dia:** `position:relative; height:858px` (13×66px); fundo = duas camadas de `background` empilhadas — linhas de hora por cima (`repeating-linear-gradient(to bottom, transparent 0 65px, hsl(var(--grid)) 65px 66px)`) e tinta de "hoje" por baixo (`linear-gradient(hsl(var(--primary)/0.06), hsl(var(--primary)/0.06))`).

### 5.3 Eventos — dois formatos por duração

Cada evento é posicionado por `top`/`height` calculados a partir do horário (`pxPerMin = 66/60 = 1.1px/min`, `dayStartMin = 7×60 = 420`): `top = (inícioMin − 420) × 1.1`, `height = duraçãoMin × 1.1`.

- **Completo** (`full`, duração ≥ 45 min): `position:absolute; left:8px; right:16px; border-radius:8px; background:linear-gradient(hsl(var(--primary)/0.14),hsl(var(--primary)/0.14)),hsl(var(--card)); border:1px solid hsl(var(--primary)/0.28); box-shadow:0 1px 3px hsl(var(--shadow)/calc(var(--shadow-a)*2)); padding:7px 12px; display:flex; flex-direction:column; gap:2px`. Conteúdo: linha topo (horário `12px/700 primary-text tabular` + duração "N min" `11px muted`), nome `clamp(13px,0.14vw+11.2px,14.3px)/600`, procedimento `11.5px muted`. Hover: `background:linear-gradient(hsl(var(--primary)/0.2),hsl(var(--primary)/0.2)),hsl(var(--card)); border-color:hsl(var(--primary)/0.5)`.
- **Compacto** (`compact`, duração < 45 min): mesmo card, mas `padding:0 12px; display:flex; align-items:center; gap:10px`, mostrando **só** horário (`11.5px/700 primary-text tabular`) + nome (`12px/600`, truncado) numa linha; sem procedimento, sem duração.

### 5.4 Rodapé

`display:flex; align-items:center; justify-content:center; gap:8px; padding:9px; background:hsl(var(--muted)/0.5); border-top:1px solid hsl(var(--border)); font-size:12px; color:hsl(var(--muted-foreground))` + bolinha 6px. Texto fixo: **"Fim de expediente — 20:00"**.

**A visão Dia não tem legenda** (a legenda de Hoje/Fechado só aparece em Semana e Mês — ver §9).

### 5.5 Eventos do dia 25/06 (dados computados)

| Horário       | Paciente       | Procedimento      | Duração | Formato  | `top` | `height` |
| ------------- | -------------- | ----------------- | ------- | -------- | ----- | -------- |
| 08:30 – 09:10 | Larissa Campos | Toxina botulínica | 40 min  | compacto | 99px  | 44px     |
| 10:00 – 10:40 | Camila Ribeiro | Microagulhamento  | 40 min  | compacto | 198px | 44px     |
| 13:00 – 14:30 | Beatriz Lima   | Peeling químico   | 90 min  | completo | 396px | 99px     |
| 16:00 – 16:30 | Rafael Souza   | Avaliação         | 30 min  | compacto | 594px | 33px     |
| 17:30 – 18:30 | Vanessa Rocha  | Preenchimento     | 60 min  | completo | 693px | 66px     |

---

## 6. Grade **Semana** (aba Agendamentos, visão padrão)

Renderizada quando `isWeek`. Mesmo card padrão (`border/radius:13px/overflow:hidden/bg-card`).

### 6.1 Cabeçalho — 7 dias

`display:grid; grid-template-columns:58px repeat(7,1fr); border-bottom:1px solid hsl(var(--border))`. Gutter vazio com `border-right hsl(var(--grid))`. Cada célula de dia: `padding:9px 4px; text-align:center; border-right:1px solid hsl(var(--grid)); background:{headBg}`.

- Label `12px/600; color:{headColor}`.
- **Hoje** (quinta 25/06): `headBg:hsl(var(--primary)/0.06)`, `headColor:hsl(var(--primary-text))`.
- **Fechado** (domingo 21/06): `headBg` = hachura diagonal (`repeating-linear-gradient(45deg, hsl(var(--muted-foreground)/0.10) 0 6px, hsl(var(--muted)/0.5) 6px 12px)`); abaixo do label, badge extra **"Fechado"** `10px/600 muted; margin-top:1px`.
- Demais dias: `headBg:transparent`, `headColor:hsl(var(--foreground))`.

Os 7 dias (fixos, sempre a mesma semana — 21 a 27/06/2026): dom. 21/06 (fechado) · seg. 22/06 · ter. 23/06 · qua. 24/06 · qui. 25/06 (hoje) · sex. 26/06 · sáb. 27/06.

### 6.2 Corpo — gutter + 7 colunas

Gutter: mesmas 13 células de hora do §5.2. Colunas: `display:grid; grid-template-columns:repeat(7,1fr)`; cada coluna `position:relative; height:858px; border-right:1px solid hsl(var(--grid)); background:{col.bg}`, onde `col.bg` empilha as linhas de hora por cima de uma tinta condicional: **hoje** → tinta dourada 0.06; **fechado** → hachura diagonal; outro dia → sem tinta.

### 6.3 Eventos — três formatos

Cada evento posicionado por `top`/`height` (mesma fórmula do §5.3), mas com `left:3px; right:3px` (colunas mais estreitas que a grade de Dia) e `border-radius:7px`.

- **Completo** (`full`, duração ≥ 55 min): `padding:5px 8px`; horário `11px/700 primary-text tabular`, nome `11.5px/600` (truncado), e — **só quando `duração ≥ 55min`** (sempre verdadeiro quando `full`) — procedimento `10.5px muted` (truncado).
- **Mini** (`mini`, duração < 55 min) — classe CSS `.appt-mini`, com **interação só-CSS de expandir no hover** (ver §6.4).

> ⚠️ O limiar de "completo vs. mini" na Semana é **55 min**, diferente do limiar "completo vs. compacto" da Dia, que é **45 min**. Não unifique os dois — são intencionalmente diferentes (a coluna da Semana é mais estreita e precisa de um corte mais agressivo).

### 6.4 Mecânica `.appt-mini` — expandir no hover (só CSS)

Compromisso de espaço: um agendamento curto (< 55 min) tem altura real pequena (ex.: 33px para 30 min) — não cabe mostrar o nome do procedimento sem cortar. Em vez de esconder a informação, o card **colapsa para a altura real** e **expande para uma altura fixa de 1h ao passar o mouse**, revelando a linha de procedimento, ficando "acima" dos vizinhos.

```css
.appt-mini {
  height: var(--mh, 33px);
  border-radius: 7px;
  background:
    linear-gradient(hsl(var(--primary) / 0.14), hsl(var(--primary) / 0.14)), hsl(var(--card));
  border: 1px solid hsl(var(--primary) / 0.28);
  box-shadow: 0 1px 3px hsl(var(--shadow) / calc(var(--shadow-a) * 2));
  overflow: hidden;
  cursor: pointer;
  padding: 3px 8px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  transition:
    height 0.12s ease,
    box-shadow 0.12s ease;
}
.appt-mini-proc {
  display: none;
}
.appt-mini:hover {
  height: 66px;
  z-index: 50;
  padding: 5px 8px;
  background:
    linear-gradient(hsl(var(--primary) / 0.2), hsl(var(--primary) / 0.2)), hsl(var(--card));
  border-color: hsl(var(--primary) / 0.5);
  box-shadow: 0 10px 22px -8px hsl(var(--shadow) / calc(var(--shadow-a) * 5));
}
.appt-mini:hover .appt-mini-proc {
  display: block;
}
```

- `--mh` é a altura real do card (`duração × 1.1px`), passada inline por evento.
- No hover, a altura fixa **66px** equivale a 1h cheia — sempre a mesma, independente da duração real.
- `z-index:50` levanta o card sobre eventos vizinhos abaixo dele (a expansão cresce para baixo e pode sobrepor o próximo agendamento — intencional, mitigado pela sombra elevada sinalizando "flutuando").
- `transition` só em `height`/`box-shadow`, **.12s ease** — rápida, sem _easing_ com overshoot (diferente das pílulas segmentadas).
- Conteúdo interno: horário (`11px/700 primary-text tabular`), nome (`11.5px/600`, truncado), procedimento (`.appt-mini-proc`, `10.5px muted`, truncado, **oculto por padrão, `display:block` só no hover**).

### 6.5 Rodapé + legenda

Mesmo rodapé "Fim de expediente — 20:00" do §5.4. **Abaixo do card** (fora dele), a legenda aparece (única visão, junto com Mês, que tem legenda — ver §9).

### 6.6 Eventos da semana (dados computados)

`pxPerMin = 1.1`, `dayStartMin = 420`. Limiar completo/mini: **55 min**.

| Dia               | Horário       | Paciente       | Procedimento         | Duração | Formato  | `top` | `height` |
| ----------------- | ------------- | -------------- | -------------------- | ------- | -------- | ----- | -------- |
| seg. 22/06        | 09:00 – 09:30 | Mariana Costa  | Limpeza de pele      | 30 min  | mini     | 132px | 33px     |
| seg. 22/06        | 14:30 – 15:40 | Letícia Moraes | Drenagem linfática   | 70 min  | completo | 495px | 77px     |
| ter. 23/06        | 09:00 – 09:40 | Gabriel Pinto  | Toxina botulínica    | 40 min  | mini     | 132px | 44px     |
| ter. 23/06        | 11:00 – 12:30 | Bruno Almeida  | Botox full face      | 90 min  | completo | 264px | 99px     |
| qua. 24/06        | 10:30 – 11:40 | Patrícia Nunes | Preenchimento        | 70 min  | completo | 231px | 77px     |
| qui. 25/06 (hoje) | 08:30 – 09:10 | Larissa Campos | Toxina botulínica    | 40 min  | mini     | 99px  | 44px     |
| qui. 25/06 (hoje) | 10:00 – 10:40 | Camila Ribeiro | Microagulhamento     | 40 min  | mini     | 198px | 44px     |
| qui. 25/06 (hoje) | 13:00 – 14:30 | Beatriz Lima   | Peeling químico      | 90 min  | completo | 396px | 99px     |
| qui. 25/06 (hoje) | 16:00 – 16:30 | Rafael Souza   | Avaliação            | 30 min  | mini     | 594px | 33px     |
| qui. 25/06 (hoje) | 17:30 – 18:30 | Vanessa Rocha  | Preenchimento        | 60 min  | completo | 693px | 66px     |
| sex. 26/06        | 09:30 – 10:40 | Sofia Andrade  | Preenchimento labial | 70 min  | completo | 165px | 77px     |
| sex. 26/06        | 14:00 – 15:30 | Helena Martins | Bioestimulador       | 90 min  | completo | 462px | 99px     |
| sáb. 27/06        | 10:00 – 10:40 | Diego Fonseca  | Toxina — testa       | 40 min  | mini     | 198px | 44px     |

Domingo 21/06 (fechado): 0 eventos.

---

## 7. Grade **Mês** (aba Calendário, visão padrão)

Renderizada quando `isMonth`. Mesmo card padrão.

### 7.1 Cabeçalho de dias da semana

`display:grid; grid-template-columns:repeat(7,1fr); border-bottom:1px solid hsl(var(--border))`. 7 células: `padding:9px 4px; text-align:center; font-size:12px; font-weight:600; color:hsl(var(--muted-foreground)); border-right:1px solid hsl(var(--grid))`. Labels: **dom. · seg. · ter. · qua. · qui. · sex. · sáb.**

### 7.2 Semanas (6 linhas × 7 colunas)

Cada linha: `display:grid; grid-template-columns:repeat(7,1fr); border-bottom:1px solid hsl(var(--grid))`. Cada célula de dia: `min-height:96px; padding:7px 8px; border-right:1px solid hsl(var(--grid)); background:{bg}; display:flex; flex-direction:column; gap:4px`.

- **Número do dia** (topo, alinhado à direita): pill `22×22px; border-radius:99px; font-size:12px; font-weight:600; font-variant-numeric:tabular-nums; display:flex; align-items:center; justify-content:center`.
  - **Hoje** (25/06): `background:hsl(var(--primary)); color:hsl(var(--primary-foreground))`.
  - **Dia fora do mês** (mês anterior/seguinte): `background:transparent; color:hsl(var(--muted-foreground)/0.5)`.
  - **Dia normal:** `background:transparent; color:hsl(var(--foreground))`.
- **Fundo da célula:** hoje → `hsl(var(--primary)/0.06)`; **domingo dentro do mês** (1ª coluna, não "fora do mês") → hachura diagonal (mesma do §6.1); demais → `transparent`.
- **Chips de agendamento** (0 a N por dia, só em dias dentro do mês): `display:flex; align-items:center; gap:5px; padding:2px 7px; border-radius:6px; background:hsl(var(--primary)/0.14); overflow:hidden` — horário `10.5px/700 primary-text tabular` + título `10.5px foreground` (truncado).

### 7.3 Legenda

Mesmo par Hoje/Fechado do §6.5, mas com o texto **"Fechado: domingos"** (plural — diferente do texto da Semana, que usa **"Fechado: Dom"**, singular/abreviado). Reproduza cada tela com o texto exato, não normalize.

**A visão Mês não tem o rodapé "Fim de expediente"** (esse rodapé só existe em Dia e Semana).

### 7.4 Calendário de junho de 2026 (dados)

|       | dom.             | seg.            | ter.            | qua.                               | qui.                                                              | sex.                                                       | sáb.             |
| ----- | ---------------- | --------------- | --------------- | ---------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------- | ---------------- |
| Sem 1 | 31 _(mai, fora)_ | 1               | 2               | 3 · chip "10:00 Avaliação inicial" | 4                                                                 | 5 · chips "12:00 Mensagem de recuperação", "15:00 Retorno" | 6                |
| Sem 2 | 7                | 8               | 9               | 10                                 | 11                                                                | 12                                                         | 13               |
| Sem 3 | 14               | 15              | 16              | 17                                 | 18 · chip "16:00 Retorno — Mariana"                               | 19                                                         | 20               |
| Sem 4 | 21               | 22              | 23              | 24                                 | **25 (hoje)** · chips "09:00 Microagulhamento", "16:00 Avaliação" | 26                                                         | 27               |
| Sem 5 | 28               | 29              | 30              | 1 _(jul, fora)_                    | 2 _(jul, fora)_                                                   | 3 _(jul, fora)_                                            | 4 _(jul, fora)_  |
| Sem 6 | 5 _(jul, fora)_  | 6 _(jul, fora)_ | 7 _(jul, fora)_ | 8 _(jul, fora)_                    | 9 _(jul, fora)_                                                   | 10 _(jul, fora)_                                           | 11 _(jul, fora)_ |

Colunas "fora do mês" nunca recebem hachura de fechado nem chips, mesmo quando cairiam num domingo.

---

## 8. **Lista**

Renderizada quando `isList`. **Sem card único** — é uma pilha de grupos, cada grupo já é seu próprio card: `display:flex; flex-direction:column; gap:14px`.

### 8.1 Grupo (por dia)

Card: `border:1px solid hsl(var(--border)); border-radius:13px; overflow:hidden; background:hsl(var(--card))`.

- **Cabeçalho do grupo:** `display:flex; align-items:center; gap:10px; padding:11px 16px; border-bottom:1px solid hsl(var(--border)); background:{headBg}`. Label de data `13.5px/600; color:{headColor}` + (se hoje) badge **"Hoje"** (`10.5px/600; color:hsl(var(--primary-foreground)); background:hsl(var(--primary)); padding:1px 8px; border-radius:99px`) + contagem à direita (`margin-left:auto; font-size:12px; color:muted; tabular-nums`, ex. "2 agendamentos").
- **Linhas do grupo** (uma por agendamento): `display:flex; align-items:center; gap:16px; padding:12px 16px; border-top:1px solid hsl(var(--grid)); cursor:pointer`; hover `background:hsl(var(--accent)/0.5)`.
  - Horário: `width:104px; flex:none; font-size:12.5px; font-weight:600; tabular-nums; color:hsl(var(--primary-text))` — formato **"HH:MM – HH:MM"**.
  - Divisor vertical: `width:3px; align-self:stretch; border-radius:99px; background:hsl(var(--primary)/0.4); flex:none`.
  - Centro (`flex:1; min-width:0`): nome `clamp(13px,0.14vw+11.2px,14.3px)/600` + procedimento `11.5px muted`.
  - Duração à direita: `11.5px muted tabular`, ex. "70 min".

### 8.2 Grupos (só dias seg–sáb com eventos; domingo nunca aparece)

| Grupo      | Badge    | Itens          |
| ---------- | -------- | -------------- |
| seg. 22/06 | —        | 2 agendamentos |
| ter. 23/06 | —        | 2 agendamentos |
| qua. 24/06 | —        | 1 agendamento  |
| qui. 25/06 | **Hoje** | 5 agendamentos |
| sex. 26/06 | —        | 2 agendamentos |
| sáb. 27/06 | —        | 1 agendamento  |

Itens de cada grupo = mesmos agendamentos da tabela §6.6, ordenados por horário. **A Lista não tem rodapé nem legenda.**

---

## 9. Legendas (Hoje / Fechado)

Aparecem **só** nas visões **Semana** e **Mês** (não em Dia, não em Lista), fora do card da grade: `display:flex; align-items:center; gap:20px; font-size:12px; color:hsl(var(--muted-foreground))`. Cada item: `display:inline-flex; align-items:center; gap:7px` + swatch `14×14px; border-radius:4px`.

| Swatch  | Estilo                                                                                                                                           | Texto                                               | Onde         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ------------ |
| Hoje    | `background:hsl(var(--primary)/0.18); border:1px solid hsl(var(--primary)/0.4)`                                                                  | "Hoje"                                              | Semana e Mês |
| Fechado | `background:repeating-linear-gradient(45deg, hsl(var(--muted-foreground)/0.28) 0 3px, transparent 3px 6px); border:1px solid hsl(var(--border))` | "Fechado: Dom" (Semana) / "Fechado: domingos" (Mês) | Semana e Mês |

⚠️ **O padrão da hachura do swatch da legenda não é idêntico ao padrão realmente aplicado no fundo das células fechadas.** A legenda usa `muted-foreground/0.28`, repetição de 3px, sem cor de base (`transparent`). O fundo real da célula fechada (§6.1/§7.2) usa `muted-foreground/0.10` + `muted/0.5`, repetição de 6px. São dois gradientes hachurados **diferentes por design** — reproduza cada um com seus valores exatos, não unifique.

---

## 10. Estados (carregado / skeleton / vazio / erro) — lacuna a preencher

O `Agenda.dc.html` implementa **só o estado "carregado"**, sempre com os mesmos dados fixos (§13). Diferente do Dashboard (que tem uma galeria dedicada aos 4 estados), esta tela **não especifica** skeleton, vazio ou erro — é uma lacuna real do protótipo, não uma omissão deste handoff. Pela regra geral do `design.md` §5 ("Estados: todos obrigatórios por tela") e §9 (checklist item 6), a implementação real precisa cobrir os 4 estados nas 4 grades. Recomendação de aplicação (a validar com design antes de implementar):

- **Skeleton:** substituir os cards de evento por blocos com shimmer (`design.md` §5 "Estados") nas posições onde normalmente ficam os eventos; manter a grade de horas/dias visível (ela é estrutura, não dado).
- **Vazio** (dia/semana/período sem nenhum agendamento): empty state composto dentro do card da grade — ícone `calendar` 34px muted + "Nenhum agendamento neste período" + texto de apoio + botão dourado "Novo agendamento" (mesmo padrão do §13.3 do `dashboard-handoff.md`).
- **Erro:** caixa inline `background:hsl(var(--destructive)/0.1); border:1px solid hsl(var(--destructive)/0.3); border-radius:10px` no lugar da grade, com ícone de alerta, título "Erro ao carregar a agenda" e botão "Recarregar" — nunca `alert()`.

---

## 11. Catálogo de animações

### Keyframes

| Nome              | Definição                                | Uso nesta tela          |
| ----------------- | ---------------------------------------- | ----------------------- |
| `senno-bell-ring` | rotação amortecida `0→11deg→-9→6→-4→2→0` | shake do sino ao clicar |

(`sennoShimmer` do design system aplicaria ao skeleton — ver §10, ainda não implementado aqui.)

### Transições

| Elemento                                          | Propriedade / timing                                                                                                                                                                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Abas Agendamentos/Calendário (topo)               | `color .15s, border-color .15s`                                                                                                                                                                                                    |
| Pílula do seletor de visão (Dia/Semana/Mês/Lista) | `transform .34s cubic-bezier(.34,1.1,.5,1)`                                                                                                                                                                                        |
| Texto dos botões do seletor de visão              | `color .25s`                                                                                                                                                                                                                       |
| Busca (expand/collapse)                           | `width .34s cubic-bezier(.4,0,.2,1)`; bg/border/shadow `.22s`                                                                                                                                                                      |
| Toggle de tema (sol↔lua)                          | `transform .5s cubic-bezier(.34,1.3,.5,1)`, `opacity .35s`                                                                                                                                                                         |
| Sino (shake)                                      | `senno-bell-ring .7s cubic-bezier(.36,.07,.19,.97)` (classe removida no `animationend`)                                                                                                                                            |
| Cards de evento (hover)                           | `background`/`border-color` sem timing explícito — herdam a transição _default_ do navegador (nenhuma declarada). **Recomendação:** adicionar `transition:background .15s, border-color .15s` na implementação real para suavizar. |
| `.appt-mini` (expandir no hover)                  | `height .12s ease, box-shadow .12s ease`                                                                                                                                                                                           |

> Tom **operacional/premium**: nada de animação longa ou chamativa — mesma diretriz do resto do produto.

---

## 12. Thresholds & lógica condicional (tabela única)

| Onde                            | Regra                                                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Formato de evento — **Dia**     | `duração ≥ 45min` → completo (horário+duração+nome+proc); `< 45min` → compacto (só horário+nome, 1 linha)                                    |
| Formato de evento — **Semana**  | `duração ≥ 55min` → completo (com proc); `< 55min` → `.appt-mini` (colapsa, expande no hover) — limiar **diferente** do da Dia, não unificar |
| `.appt-mini` hover              | altura real (`duração×1.1px`) → **66px** fixo (1h) no hover; `z-index:50`; linha de procedimento só aparece no hover                         |
| Posição de evento               | `top = (inícioMin − 420) × 1.1px`; `height = duraçãoMin × 1.1px` (`420min` = 07:00, início do expediente)                                    |
| Altura da grade (Dia/Semana)    | `13 horas × 66px = 858px` (07:00–19:00 inclusive)                                                                                            |
| Coluna "fechada" — Semana       | só domingo (índice 0 dos 7 dias)                                                                                                             |
| Coluna "fechada" — Mês          | só domingo (1ª coluna) **e** dentro do mês atual (dias de fora nunca recebem hachura)                                                        |
| Chip do Mês                     | só aparece em dias que **não** são de fora do mês (`!d.o`)                                                                                   |
| Número do dia — Mês             | hoje → `bg:primary`/`fg:primary-foreground`; fora do mês → `color:muted-foreground/0.5`; normal → `color:foreground`                         |
| Legenda                         | só aparece nas visões Semana e Mês; ausente em Dia e Lista                                                                                   |
| Rodapé "Fim de expediente"      | aparece em Dia e Semana; ausente em Mês e Lista                                                                                              |
| Persistência de visão por aba   | `state.views` é um dicionário `{agendamentos, calendario}` — cada aba lembra sua última visão independentemente                              |
| Visão padrão                    | Agendamentos → Semana; Calendário → Mês                                                                                                      |
| Dot do sino                     | aparece se `unreadCount > 0`                                                                                                                 |
| Notificação — linha             | lida `bg:transparent`/peso 500; não-lida `bg:primary/0.05`/peso 600 + dot                                                                    |
| Ordem de grupos na Lista        | dias 1–6 (seg–sáb) que têm eventos; domingo nunca aparece (loop começa em `di=1`)                                                            |
| Rótulo de contagem (Lista, Dia) | singular "1 agendamento" vs. plural "N agendamentos"                                                                                         |

---

## 13. Dados de exemplo (fonte da verdade)

### 13.1 Nota sobre a natureza dos dados

Todos os dados desta tela — semana exibida (21–27/06/2026), dia exibido (25/06), mês exibido (junho/2026), eventos, chips — são **literais fixos no código**, não derivados de uma data real (`new Date()`) nem de navegação. Isso é consequência direta das setas de período e do botão "Hoje" não estarem conectados (§4.1). Na implementação real, `rangeTitle` e o conteúdo de cada grade devem ser **calculados a partir de um estado de data real**, não hardcoded.

### 13.2 Eventos-base (`rawEv`, fonte única para Dia/Semana/Lista)

```
dia1 (seg) 09:00 Mariana Costa    · Limpeza de pele        · 30min
dia1 (seg) 14:30 Letícia Moraes   · Drenagem linfática     · 70min
dia2 (ter) 09:00 Gabriel Pinto    · Toxina botulínica      · 40min
dia2 (ter) 11:00 Bruno Almeida    · Botox full face        · 90min
dia3 (qua) 10:30 Patrícia Nunes   · Preenchimento          · 70min
dia4 (qui, hoje) 08:30 Larissa Campos · Toxina botulínica   · 40min
dia4 (qui, hoje) 10:00 Camila Ribeiro · Microagulhamento    · 40min
dia4 (qui, hoje) 13:00 Beatriz Lima   · Peeling químico     · 90min
dia4 (qui, hoje) 16:00 Rafael Souza   · Avaliação           · 30min
dia4 (qui, hoje) 17:30 Vanessa Rocha  · Preenchimento       · 60min
dia5 (sex) 09:30 Sofia Andrade    · Preenchimento labial   · 70min
dia5 (sex) 14:00 Helena Martins   · Bioestimulador         · 90min
dia6 (sáb) 10:00 Diego Fonseca    · Toxina — testa         · 40min
```

(13 eventos no total; ver tabelas computadas em §5.5 e §6.6.)

### 13.3 Chips do mês (`monthChips`, por dia-do-mês)

```
dia 3  → 10:00 Avaliação inicial
dia 5  → 12:00 Mensagem de recuperação · 15:00 Retorno
dia 18 → 16:00 Retorno — Mariana
dia 25 (hoje) → 09:00 Microagulhamento · 16:00 Avaliação
```

### 13.4 Notificações (5) — mesmo conjunto de dados do Dashboard

```
1 lead    "Novo lead"                — Mariana Alves · Instagram            — agora  — não-lida
2 money   "Pagamento confirmado"     — R$ 1.200 · Botox · Camila Souza      — 8 min  — não-lida
3 agenda  "Agendamento confirmado"   — Patrícia Lima · amanhã às 14h        — 40 min — não-lida
4 alert   "Tarefa atrasada"          — Retornar ligação · Rafael Dias       — 1 h    — lida
5 agenda  "Novo agendamento online"  — Beatriz Ramos · Limpeza de pele      — 3 h    — lida
```

Reaproveitar a mesma fonte de dados do Dashboard (`dashboard-handoff.md` §16) em vez de duplicar — em produção isso é uma única API de notificações, não dado por tela.

---

## 14. Props do componente & integração com o App

**Props do Agenda** (`data-props`, `$preview` 1440×980):

- `defaultTheme`: enum `light | dark` (default `light`).

**Callbacks/props que o App injeta** (integração real):

- `theme` (controlado externamente), `onToggleTheme()` — **já lidos** pelo componente.
- `onNavigate(labelDaRota)` — **já lido**, usado pela nav da sidebar.
- `onNewLead()` — **referenciado no template, mas não lido em `renderVals()`** — adicionar o _passthrough_ (`this.props.onNewLead`) na implementação real.
- Não há nenhuma prop/callback para busca, filtros, navegação de período ou criação de agendamento/evento — tudo isso precisa ser especificado e ligado na integração real (ver itens **[NÃO CONECTADO NO PROTÓTIPO]** ao longo do documento).

---

## 15. Ordem de build sugerida + checklist

**Ordem:**

1. Tokens no `globals.css` (incluindo o novo `--grid`, §0.1) + Inter + `tabular-nums`.
2. **Chrome** (sidebar 236px) — reaproveitar exatamente do Dashboard/Atividades.
3. **Topbar Agenda** — abas Agendamentos/Calendário no lugar do `<h1>` (§3.1), depois busca/tema/sino/Novo lead (reaproveitar primitivos já construídos nas outras telas).
4. Primitivo do **seletor de visão** (segmented dourado, 4 opções) — reaproveita o mesmo primitivo do período do Dashboard.
5. **Toolbar de período** (setas + Hoje + título + Filtros + ação) — construir como visual primeiro; a lógica de data real vem depois.
6. Grade **Semana** (visão padrão) → grade **Dia** → grade **Mês** → **Lista** — nessa ordem, pois Semana introduz a mecânica `.appt-mini` que as outras reaproveitam parcialmente.
7. Legendas (§9) e rodapé "Fim de expediente" — condicionais por visão.
8. Ligar callbacks reais: navegação de período, "Hoje", "Novo lead", ação da página, Filtros, busca (reaproveitando o popover do Dashboard).
9. Cobrir os 4 estados (§10) nas 4 grades.
10. Rodar o checklist do `design.md` §9 na tela.

**Checklist específico da Agenda:**

- [ ] Só tokens semânticos; **adicionar `--grid`** ao `globals.css`/`tailwind.config` (não existia antes desta tela).
- [ ] Abas Agendamentos/Calendário renderizadas no tamanho do `<h1>` (`clamp(22px,0.5vw+18px,27px)/600`), não um `<h1>` separado.
- [ ] Limiar completo/compacto da **Dia é 45min**; limiar completo/mini da **Semana é 55min** — não unificar.
- [ ] `.appt-mini`: colapsa para a altura real, expande para 66px fixos no hover, revela a linha de procedimento, `z-index:50`.
- [ ] Seletor de visão com persistência **por aba** (`views.agendamentos` ≠ `views.calendario`).
- [ ] Legenda só em Semana/Mês; textos exatos "Fechado: Dom" (Semana) vs. "Fechado: domingos" (Mês); hachura da legenda é um gradiente **diferente** da hachura real da célula — não unificar.
- [ ] Rodapé "Fim de expediente — 20:00" só em Dia/Semana.
- [ ] Dias fora do mês nunca recebem hachura de fechado nem chips, mesmo em domingos.
- [ ] Ligar de fato: setas de período, "Hoje", "Filtros", botão de ação da toolbar, "Novo lead", campo de busca (todos decorativos no protótipo — ver marcações **[NÃO CONECTADO NO PROTÓTIPO]**).
- [ ] Busca ganha o popover completo de resultados (reaproveitar do Dashboard) em vez do input solto atual.
- [ ] Sino e toggle de tema já funcionam no protótipo — manter o comportamento 1:1 (shake, dot, popover, sol/lua).
- [ ] Cobrir os 4 estados (skeleton/vazio/erro) nas 4 grades — não existiam no protótipo.
- [ ] `tabular-nums` em todo horário, contagem e duração.
