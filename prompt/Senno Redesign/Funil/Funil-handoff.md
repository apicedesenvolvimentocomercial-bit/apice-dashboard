# Funil — Handoff detalhado (item a item)

> Especificação granular da tela **Funil** (kanban de leads/pacientes), `Funil.dc.html`.
> Objetivo: reconstruir **cada elemento visual, medida, threshold e animação** no stack real
> (Next 16 + Tailwind v3 + shadcn/ui) sem improviso. **Nada aqui é opcional.**
>
> **Como usar este doc**
>
> 1. Leia `design.md` primeiro (tokens, regras de cor, tipografia, chrome). Este arquivo **não repete** os tokens — assume que já estão no `globals.css`.
> 2. Toda cor é token semântico via `hsl(var(--token))`, **exceto** onde marcado explicitamente como "cor literal de categoria" (cores de etapa/tipo/prioridade — ver §7.2, §12.2, §12.3). Onde aparece `primary/0.16`, leia `hsl(var(--primary) / 0.16)`.
> 3. Todo número (px, %, peso, threshold) é **literal do protótipo** — reproduza exatamente.
> 4. O `.dc.html` usa um runtime de protótipo próprio — **não copie a sintaxe de template**. Recrie em React/TSX. Ícones → `lucide-react`.
> 5. Este documento também lista, de forma explícita, **lacunas do protótipo** (ações sem handler, animações com nome não definido, inconsistências de padrão) encontradas na leitura linha a linha do arquivo — cada uma está marcada com **⚠️ Gap do protótipo**. Trate-as como itens a resolver durante a implementação, não como comportamento a reproduzir literalmente.
>
> **Nota de escopo importante:** o pedido original menciona abas "Hoje/Semana/Atrasadas/Todas/Feitas" e "banner de atrasada" — esse é o padrão da tela **Atividades** (ver `Atividades/atividades-handoff.md`), não do Funil. O Funil **não tem** essas abas nem esse banner; ele tem abas de **funil** (Comercial/Retenção) sobre um **quadro kanban**, e uma aba "Atividades" **dentro do painel do lead** (drawer lateral) sem sub-filtros de data. Este doc documenta fielmente o que existe em `Funil.dc.html`.
>
> **Legenda de tokens usados abaixo (do `design.md`):**
> `--card` superfície · `--background` fundo app · `--foreground` texto · `--muted`/`--muted-foreground` neutro · `--border` bordas · `--accent` hover · `--primary` dourado-superfície · `--primary-foreground` texto escuro sobre dourado · `--primary-text` dourado-texto · `--secondary`/`--secondary-foreground` badge neutro · `--ring` foco · `--destructive` erro · `--shadow`/`--shadow-a` sombra tingida.

---

## 0. Índice

1. Estrutura geral da página (esqueleto + medidas de layout)
2. Sidebar (236px) — idêntica ao chrome padrão
3. Topbar — título + duas buscas + tema + sino + Novo lead
4. Popover de notificações — reaproveitado do chrome
5. Corpo — barra de busca ampla "Buscar em todos os funis"
6. Abas de funil (Comercial/Retenção) + novo funil + ajuda + Editar etapas
7. Quadro Kanban — colunas e cards
8. Modal "Adicionar paciente" (picker)
9. Drawer do lead — estrutura, header, abas
10. Drawer → aba Info
11. Drawer → aba Atividades
12. Drawer → aba Anotações
13. Drawer → aba Documentos
14. Catálogo de animações (keyframes + transições)
15. Thresholds & lógica condicional (tabela única)
16. Ações sem handler / lacunas do protótipo (tabela única)
17. Dados de exemplo (fonte da verdade)
18. Props do componente & integração com o App
19. Ordem de build sugerida + checklist

---

## 1. Estrutura geral da página

### Container raiz

Elemento `.senno` com `data-theme` (`light|dark`) e `data-font="inter"`. `background:hsl(var(--background))`, `color:hsl(var(--foreground))`, `height:100vh`, `overflow:hidden`, `line-height:1.45`, `font-family:Inter`, `-webkit-font-smoothing:antialiased`.

### Moldura da tela

`data-screen-label="Funil — Kanban"` — `width:100%; height:100%; display:flex; overflow:hidden; background:hsl(var(--background))`.

Layout em duas colunas via flex:

```
[ SIDEBAR 236px fixa ] [ MAIN flex:1 -> (TOPBAR fixo) + (BODY) ]
```

- **MAIN:** `flex:1; min-width:0; min-height:0; display:flex; flex-direction:column`.
- **BODY:** `flex:1; min-height:0; overflow:hidden; padding:20px 24px; display:flex; flex-direction:column; gap:16px; min-width:0`.

> **Diferença importante vs. Dashboard:** o body do Funil é `overflow:hidden` (não `overflow-y:auto`). A página inteira não rola — apenas o **quadro kanban** (dentro do body) tem seu próprio scroll horizontal (`overflow:auto`, §7). Isso é intencional: mantém a barra de busca e as abas de funil sempre visíveis, e o kanban rola independente, como um board Trello/Linear.

### Ordem vertical do body (gap 16px entre blocos)

1. Barra de busca ampla "Buscar em todos os funis…" (§5)
2. Linha abas de funil + "Editar etapas" (§6)
3. Quadro Kanban (flex:1, rolável) (§7)

### Breakpoints responsivos

As media queries globais `.senno-2col`/`.senno-3col` (herdadas do chrome compartilhado) estão declaradas no `<style>` do arquivo, mas **nenhum elemento desta tela usa essas classes** — o kanban não é uma grade responsiva, é uma fileira de colunas de largura fixa com scroll horizontal. Não há breakpoint específico do Funil: em telas estreitas, o usuário rola o board lateralmente.

---

## 2. Sidebar — 236px

Idêntica ao chrome padrão (ver `design.md` §4 e `Dashboard/dashboard-handoff.md` §2) — mesma estrutura, mesmos tokens, mesma ordem de nav. Único diferencial: o item ativo é **Funil** (`weight:600`, `color:hsl(var(--primary-text))`, `background:hsl(var(--accent))`, ícone `funnel`).

---

## 3. Topbar

`header`: `flex:none; display:flex; align-items:center; gap:16px; padding:14px 24px; border-bottom:1px solid hsl(var(--border)); background:hsl(var(--card))`.

- **Esquerda** (`flex:1; min-width:0`): `<h1>` "Funil" — `font-size:clamp(22px, 0.5vw + 18px, 27px); font-weight:600; letter-spacing:-0.01em; margin:0`.
- **Direita** (`display:flex; align-items:center; gap:9px`): **Busca (colapsável) → Tema → Sino → Novo lead**.

### 3.1 Busca colapsável do topbar (`senno-search`)

Mesma mecânica visual do chrome padrão (ver `design.md` / dashboard §3.1): ícone-lupa 38×38px que expande para 240px da direita para a esquerda no hover/focus (`transition:width .34s cubic-bezier(.4,0,.2,1)`), placeholder "Buscar paciente…".

> ⚠️ **Gap do protótipo:** ao contrário do Dashboard, aqui a busca **não tem estado nem popover de resultados** — é só o input com a mecânica de expandir/colapsar (sem `value`/`onInput`, sem lista de resultados, sem highlight). A busca _funcional_ desta tela é a barra ampla do corpo (§5). Antes de implementar, **confirme com o time** se a intenção é: (a) remover esta busca duplicada do topbar nesta tela (como o `design.md` §4 já sugere — "em TODAS as telas exceto Funil, que tem busca própria" — texto que hoje descreve uma exceção só parcialmente refletida no protótipo), ou (b) ligá-la ao mesmo popover de resultados do Dashboard. Recomendação: manter só a busca do corpo (§5) e remover a do topbar aqui, para não haver duas buscas de pacientes na mesma tela.

### 3.2 Toggle de tema (sol/lua)

Idêntico ao chrome padrão — botão 38×38px, ícones sobrepostos com `transition:transform .5s cubic-bezier(.34,1.3,.5,1), opacity .35s`. Ver dashboard-handoff §3.2 para os 4 estados exatos (sol/lua × claro/escuro).

### 3.3 Sino de notificações

Idêntico ao chrome padrão, **mesmos 5 itens de exemplo** que o Dashboard (mesma fonte de dados — ver §17). Ver dashboard-handoff §3.3 para popover, tints por tipo e shake de clique. Em produção, isso deve vir de um serviço/hook de notificações compartilhado — não duplicar a lista por tela.

### 3.4 Botão "Novo lead"

Idêntico ao chrome padrão: `height:38px; padding:0 15px; border-radius:9px; background:hsl(var(--primary)); color:hsl(var(--primary-foreground)); font-weight:600; gap:7px`, ícone `+` 15px, hover `brightness(1.05)`. Clique → `props.onNewLead()` (o App monta o modal "Novo lead" por cima de qualquer tela — ver §18).

---

## 4. Popover de notificações

Reaproveitado 1:1 do chrome padrão — ver `Dashboard/dashboard-handoff.md` §3.3 para overlay, painel (`width:362px`), tints por tipo (`lead`/`money`/`agenda`/`alert`), badge de contagem e "Marcar todas como lidas". Não repetido aqui para evitar duplicação; os tokens e medidas são idênticos.

---

## 5. Corpo — busca ampla "Buscar em todos os funis"

Linha isolada acima das abas de funil:

- `display:flex; align-items:center; gap:8px; height:40px; padding:0 13px; border-radius:10px; border:1px solid hsl(var(--input)); background:hsl(var(--card)); width:380px; max-width:100%`.
- Foco (`:focus-within`): `border-color:hsl(var(--ring)); box-shadow:0 0 0 3px hsl(var(--ring)/0.18)`.
- Ícone lupa `16×16px`, `color:hsl(var(--muted-foreground))`, `flex:none`.
- Input: `flex:1; min-width:0; border:none; outline:none; background:transparent; font-size:clamp(13px, 0.14vw + 11.2px, 14.3px); color:hsl(var(--foreground))`. Placeholder: **"Buscar em todos os funis (nome, telefone, e-mail)…"**.

> ⚠️ **Gap do protótipo:** este input também não tem `value`/`onInput` — é decorativo no protótipo atual (mesma observação do §3.1). O placeholder promete busca por **nome, telefone e e-mail** cruzando **as duas abas de funil**. Em produção, implemente: normalizar (minúsculo, sem acento — igual à busca do Dashboard, ver dashboard-handoff §3.1) e filtrar os cards visíveis em todas as colunas da aba de funil ativa (ou, se fizer sentido de produto, cruzar as duas abas e mostrar contagem de resultados por aba). Ao digitar, cada coluna deve exibir só os cards que casam, e o "vazio" de coluna deve trocar de texto ("Nenhum lead" → algo como "Nenhum resultado nesta etapa") quando há um filtro ativo.

---

## 6. Abas de funil + novo funil + ajuda + Editar etapas

Linha: `display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap`.

### 6.1 Grupo esquerdo — switch Comercial/Retenção

- Wrapper externo: `display:flex; align-items:center; gap:8px`.
- **Trilho do switch:** `display:flex; align-items:center; gap:2px; padding:3px; border-radius:10px; background:hsl(var(--muted)); border:1px solid hsl(var(--border))`.
  - Dentro, um sub-wrapper **sem padding próprio** (`position:relative; display:grid; grid-auto-flow:column; grid-auto-columns:1fr`) contém a pílula deslizante + os 2 botões — o padding de 3px já foi aplicado no trilho externo, por isso a pílula usa **inset:0** (não 3, diferente do padrão default da função `segPill`).
  - **Pílula (`segPill(idx, 2, {inset:0})`):** `position:absolute; top:0; left:0; bottom:0; width:calc(100%/2); transform:translateX(idx*100%); background:hsl(var(--primary)); border-radius:8px; box-shadow:0 1px 2px hsl(var(--shadow)/var(--shadow-a)); transition:transform .34s cubic-bezier(.34,1.1,.5,1); pointer-events:none; z-index:0`.
  - **Botões (`segBtn`, defaults):** `position:relative; z-index:1; border:none; cursor:pointer; font-size:13px; font-weight:600; padding:6px 16px; border-radius:8px; background:transparent; color:` ativo `hsl(var(--primary-foreground))` / inativo `hsl(var(--muted-foreground))`; `transition:color .25s`.
  - Abas: **Comercial** · **Retenção**. Padrão selecionado: `comercial`.
- **Botão "+" (novo funil):** fora do trilho mas dentro do wrapper com padding3 — `width:30px; height:30px; border-radius:7px; border:none; background:transparent; color:hsl(var(--muted-foreground))`; hover `background:hsl(var(--accent)); color:hsl(var(--foreground))`. Ícone `+` 15px. `title="Novo funil"`.
- **Botão "Ajuda sobre funis"** (fora do trilho, item irmão do grupo): `width:32px; height:32px; border-radius:8px`, mesmo tratamento de hover, ícone de interrogação 17px. `title="Ajuda sobre funis"`.

> ⚠️ **Gap do protótipo:** os botões **"+" (novo funil)** e **"Ajuda sobre funis"** não têm `onClick` — são visuais/tooltip apenas. Em produção: "+" deve abrir um fluxo de criação de funil (nome + etapas iniciais); "Ajuda" deve abrir um popover ou painel explicando o conceito de funil/etapas.

### 6.2 Botão "Editar etapas" (direita)

`height:38px; padding:0 14px; border-radius:9px; border:1px solid hsl(var(--input)); background:hsl(var(--card)); color:hsl(var(--foreground)); font-weight:600; display:flex; align-items:center; gap:8px`; hover `background:hsl(var(--accent))`. Ícone lápis `15px`, `color:hsl(var(--primary-text))`. Label "Editar etapas".

> ⚠️ **Gap do protótipo:** sem `onClick` — decorativo. Em produção deve abrir um editor de etapas do funil ativo (renomear, reordenar, adicionar/remover coluna, escolher cor).

> Este é o **padrão de botão de ação da página dentro do conteúdo** (não no header) descrito no `design.md` §4 — aqui alinhado à linha das abas de funil, no lugar da barra de abas underline que outras telas usam.

---

## 7. Quadro Kanban

### 7.1 Container do board

`flex:1; min-height:0; display:flex; align-items:flex-start; gap:14px; overflow:auto; padding:4px 2px 12px; min-width:0`. Rola horizontalmente quando as colunas excedem a largura disponível — é o único elemento rolável desta tela (ver §1).

### 7.2 Coluna

- Wrapper: `flex:none; width:280px; display:flex; flex-direction:column; gap:10px`.
- **Cabeçalho da coluna:** `display:flex; align-items:center; gap:9px; padding:2px 4px; min-height:30px`.
  - Dot de categoria: `9×9px; border-radius:99px; background:{cor da etapa}`.
  - Nome: `13.5px/600`.
  - **Pill de contagem:** `font-size:11px; font-weight:600; font-variant-numeric:tabular-nums; min-width:20px; text-align:center; padding:1px 7px; border-radius:99px; background:hsl(var(--muted)); color:hsl(var(--muted-foreground))` — valor = nº de cards na coluna (inclui os adicionados via picker).
  - Espaçador `flex:1`.
  - **Botão "+"** (condicional — ver regra de exibição abaixo): `width:26px; height:26px; border-radius:7px; border:none; background:transparent; color:hsl(var(--muted-foreground))`; hover `background:hsl(var(--accent)); color:hsl(var(--foreground))`. Ícone `+` 15px. `title="Adicionar paciente"`. Abre o modal picker (§8) com a coluna como alvo.
- **Corpo da coluna (container fluido de cards):** `background:hsl(var(--muted)/0.45); border:1px solid hsl(var(--border)); border-radius:13px; padding:10px; display:flex; flex-direction:column; gap:10px`.

**Cores de categoria das etapas (`DOT`) — literais HSL, não tokens** (série de dados/categoria, igual às cores do donut e das barras de procedimento do Dashboard):
| Categoria | HSL |
|---|---|
| `violet` | `hsl(262 52% 58%)` |
| `amber` | `hsl(38 90% 50%)` |
| `green` | `hsl(142 58% 44%)` |
| `blue` | `hsl(217 80% 58%)` |
| `red` | `hsl(0 72% 55%)` |

### 7.3 Card de lead

- `background:hsl(var(--card)); border:1px solid hsl(var(--border)); border-radius:11px; padding:13px 14px; box-shadow:0 1px 2px hsl(var(--shadow)/var(--shadow-a)); cursor:pointer`; hover `border-color:hsl(var(--primary)/0.5); box-shadow:0 4px 14px -4px hsl(var(--shadow)/calc(var(--shadow-a) * 2.5))`.
- **Nome:** `13.5px/600`, trunca (`white-space:nowrap; overflow:hidden; text-overflow:ellipsis`).
- **Procedimento** (opcional — só se `proc` existir): `12px; color:muted-foreground; margin-top:2px`, trunca.
- **Linha origem + idade:** `display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:11px`.
  - Badge de origem: `font-size:11px; font-weight:600; padding:2px 9px; border-radius:99px; background:hsl(var(--secondary)); color:hsl(var(--secondary-foreground))` — ex. "Meta Ads", "Instagram", "Indicação", "Walk-in", "Cadastro" (quando adicionado via picker), "Presencial".
  - Idade do lead: `11px; color:muted-foreground; flex:none` — ex. "há 2 dias".
- **Linha telefone:** `display:flex; align-items:center; gap:6px; margin-top:10px; font-size:12px; color:muted-foreground; font-variant-numeric:tabular-nums` + ícone telefone `13×13px`.
- Clique no card inteiro → abre o drawer do lead (§9), semeado com os dados do card + `stage` (nome da coluna) + `funil` (aba atual).

### 7.4 Estado vazio da coluna

`min-height:148px; display:flex; align-items:center; justify-content:center; border:1.5px dashed hsl(var(--border)); border-radius:11px; background:hsl(var(--card)/0.35); font-size:12.5px; color:hsl(var(--muted-foreground))` — texto **"Nenhum lead"**.

> Este é um empty state **simples** (só texto), diferente do padrão "composto" (ícone+título+texto+ação) do `design.md` §5 — aceitável aqui porque a ação de adicionar já está exposta no cabeçalho da coluna (botão "+"), evitando redundância. Mantenha assim na implementação real.

### 7.5 Etapas por funil (dados de exemplo)

**Comercial** (5 etapas): Lead (`violet`) · Agendado (`amber`) · Fechado (`green`) · Compareceu (`blue`) · Cancelado (`red`).
**Retenção** (6 etapas): Pós-procedimento (`violet`) · Nutrição (`green`) · Reativação (`amber`) · Fidelização (`blue`) · Salvamento (`red`) · Em tratamento (`amber`).

---

## 8. Modal "Adicionar paciente" (picker)

Aberto pelo botão "+" do cabeçalho de uma coluna. `pickerTarget` = nome da etapa clicada.

### 8.1 Overlay e painel

- Overlay: `position:fixed; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center; padding:24px`.
- Backdrop: `position:absolute; inset:0; background:hsl(220 24% 5% / 0.52); animation:senno-modal-fade .2s ease` — clique fecha o modal.
- Painel: `width:440px; max-width:100%; max-height:calc(100vh - 48px); display:flex; flex-direction:column; background:hsl(var(--card)); color:hsl(var(--foreground)); border:1px solid hsl(var(--border)); border-radius:16px; box-shadow:0 34px 80px -22px hsl(var(--shadow)/calc(var(--shadow-a) * 5)); animation:senno-modal-in .3s cubic-bezier(.22,1,.36,1); overflow:hidden`.

> ⚠️ **Gap do protótipo:** `senno-modal-fade` e `senno-modal-in` **não estão definidos** no `<style>` deste arquivo (existem em `Novo Lead.dc.html`, mas cada `.dc.html` é autocontido). Hoje o modal aparece **sem** fade/scale-in. Corrija copiando as duas keyframes de `Novo Lead.dc.html` para o `<style>` do Funil (ver §14 para os valores exatos).

### 8.2 Cabeçalho

`padding:20px 22px 12px`. `<h2>` "Adicionar paciente" `18px/600; letter-spacing:-0.01em`. Subtítulo: "Etapa **{nome da etapa alvo}**" `12.5px; color:muted-foreground; margin-top:3px` — nome da etapa em `color:hsl(var(--primary-text)); font-weight:600`. Botão fechar `32×32px; border-radius:8px`, ícone X 17px, hover `accent`.

### 8.3 Campo de busca

`padding:0 22px 12px`. Input row: `height:40px; padding:0 13px; border-radius:10px; border:1px solid hsl(var(--input)); background:hsl(var(--background))`; foco `border-color:ring; box-shadow:0 0 0 3px hsl(var(--ring)/0.18)`. Ícone lupa 16px muted. Input `autoFocus`, placeholder "Buscar paciente por nome ou telefone…", `13.5px`.

**Lógica de filtro (funcional, ao contrário das buscas do §3.1/§5):**

- `q` = texto digitado, `trim().toLowerCase()`. `qd` = apenas os dígitos de `q`.
- Casa se `nome.toLowerCase().includes(q)` **OU** (`qd` não-vazio **e** `dígitos(telefone).includes(qd)`).

> ⚠️ **Gap do protótipo:** esse filtro **não remove acentos** (só `toLowerCase()`), diferente da busca do Dashboard que normaliza com `NFD` antes de comparar (ver dashboard-handoff §3.1). Alinhe as duas implementações em produção — extraia um helper único de normalização de busca e reuse em todas as telas.

### 8.4 Lista de resultados

`flex:1; min-height:0; overflow-y:auto; padding:2px 10px 12px`.

- Linha (`<button>`): `display:flex; align-items:center; gap:12px; width:100%; text-align:left; padding:10px 10px; border-radius:10px`; hover `background:accent`.
  - Avatar iniciais: `36×36px; border-radius:99px; background:hsl(var(--primary)/0.16); color:hsl(var(--primary-text)); font-weight:600; font-size:12.5px` — 2 primeiras iniciais do nome.
  - Nome `13.5px/600`, trunca. Meta (`proc · telefone` ou só `telefone` se não houver procedimento) `12px; color:muted-foreground; tabular-nums`, trunca.
  - Ícone `+` `22×22px; color:muted-foreground` à direita (afordância visual — a linha inteira é clicável).
- **Empty (sem resultados):** `flex-direction:column; align-items:center; justify-content:center; gap:6px; padding:40px 24px; text-align:center` — ícone lupa 26px muted + "Nenhum paciente encontrado" `13.5px/600` + "Tente outro nome ou telefone." `12.5px muted`.

**Ao selecionar:** adiciona um card `{name, proc, source:'Cadastro', phone, age:'agora'}` ao **topo** da coluna-alvo (guardado em memória, chave `{funil}::{etapa}`) e fecha o modal.

> ⚠️ **Gap do protótipo:** cards adicionados via picker ficam só em `state` do componente (não persistem, somem ao recarregar) e **não checam duplicidade** (o mesmo paciente pode ser adicionado à mesma etapa várias vezes, ou a etapas diferentes ao mesmo tempo, sem indicação de que já está em outra coluna). Em produção: persistir no backend e, ao adicionar, verificar se o paciente já está em outra etapa/funil (e perguntar se deve mover em vez de duplicar).

---

## 9. Drawer do lead — estrutura, header, abas

### 9.1 Overlay e painel

- Overlay: `position:fixed; inset:0; z-index:1100; display:flex; justify-content:flex-end`.
- Backdrop: `position:absolute; inset:0; background:hsl(220 24% 5% / 0.5); animation:senno-scrim-in .22s ease` (fade `opacity 0→1` — **esta keyframe está corretamente definida** no arquivo).
- Painel (`.senno-drawer`): `position:relative; width:460px; max-width:100%; height:100%; display:flex; flex-direction:column; background:hsl(var(--card)); color:hsl(var(--foreground)); border-left:1px solid hsl(var(--border)); box-shadow:-28px 0 60px -22px hsl(var(--shadow)/calc(var(--shadow-a) * 5)); animation:senno-drawer-in .34s cubic-bezier(.22,1,.36,1)` (`translateX(100%)→translateX(0)`).
- Responsivo: `@media (max-width:520px) { .senno-drawer { width:100% !important; } }`.
- Fecha com: botão X, clique no overlay, ou tecla `Escape` (prioridade — ver §15).

### 9.2 Header

`padding:20px 22px 0; display:flex; align-items:flex-start; gap:12px`.

- Avatar iniciais: `44×44px; border-radius:99px; background:hsl(var(--primary)/0.16); color:hsl(var(--primary-text)); font-weight:600; font-size:15px`.
- Bloco nome (`flex:1; min-width:0`):
  - Linha: `<h2>` nome `18px/600; letter-spacing:-0.01em`, trunca + **pill de etapa atual** (`flex:none; font-size:11px; font-weight:600; padding:2px 9px; border-radius:99px; background:hsl(var(--primary)/0.14); color:hsl(var(--primary-text))`).
  - Subtítulo: "Origem · {origem do lead}" `12.5px; color:muted-foreground; margin-top:3px`.
- Botão fechar `32×32px; border-radius:8px`, ícone X 17px, hover `accent`.

### 9.3 Abas do drawer

`padding:16px 22px 0`. `inline-flex; align-items:center; gap:2px; max-width:100%; border-bottom:1px solid hsl(var(--border))` — **underline que corta no fim da última aba**, não atravessa a largura toda (mesmo padrão do `design.md` §5).

Cada aba: `position:relative; display:inline-flex; align-items:center; gap:6px; border:none; background:transparent; cursor:pointer; font-size:13px; font-weight:600; padding:8px 9px; margin-bottom:-1px; white-space:nowrap; color:` ativa `hsl(var(--foreground))` / inativa `hsl(var(--muted-foreground))`; `border-bottom:2px solid` ativa `hsl(var(--primary))` / inativa `transparent`.

**Badge de contagem** (quando a aba tem `count`): `font-size:10.5px; font-weight:600; font-variant-numeric:tabular-nums; min-width:17px; text-align:center; padding:1px 6px; border-radius:99px; background:` ativa `hsl(var(--primary)/0.16)` / inativa `hsl(var(--muted))`; `color:` ativa `hsl(var(--primary-text))` / inativa `hsl(var(--muted-foreground))`.

**As 4 abas (ordem fixa):**
| Aba | Tem badge? | Contagem |
|---|---|---|
| Info | não | — |
| Atividades | sim | nº de atividades do lead |
| Anotações | sim | nº de anotações |
| Documentos | sim | nº de documentos |

### 9.4 Área de conteúdo

`flex:1; min-height:0; overflow-y:auto; scrollbar-gutter:stable; padding:18px 22px 24px`. Renderiza uma das 4 abas (§10–§13) conforme `leadTab`.

---

## 10. Drawer → aba Info

Coluna `display:flex; flex-direction:column; gap:18px`.

### 10.1 Contato

`gap:11px`: link telefone (ícone telefone 16px muted + texto `13.5px; tabular-nums`) e link e-mail (ícone envelope 16px muted + texto `13.5px; word-break:break-all`) — ambos `href="#"`, `color:foreground`, hover `color:primary-text`. **Decorativos** (não abrem discador/cliente de e-mail no protótipo — em produção usar `tel:`/`mailto:`).

### 10.2 Bloco de dados

`padding-top:16px; border-top:1px solid border; gap:12px`:

- **Origem:** label `12.5px muted` + badge (`background:hsl(var(--secondary)); color:hsl(var(--secondary-foreground)); font-size:11px; font-weight:600; padding:2px 9px; border-radius:99px`) à direita.
- **Interesse:** label `12.5px muted` + valor `13px/500` à direita (alinhamento `baseline`).
- **Valor estimado:** label `12.5px muted` + valor `14px/600; tabular-nums` à direita.

### 10.3 Responsável (dropdown) — só se `leadComercial`

> **Regra de visibilidade:** `leadComercial = !(lead.card.funil === 'retencao')`. Ou seja, **some** quando o lead foi aberto a partir de uma coluna da aba **Retenção** — nesses casos o paciente já é considerado "da casa" e não precisa de dono comercial atribuído. Junto com Responsável, o botão **"Perdeu"** (§10.4) e o link **"Remover lead"** (§10.6) também somem nesse caso.

- Label uppercase: `11px; font-weight:600; letter-spacing:0.05em; text-transform:uppercase; color:muted-foreground; margin-bottom:8px` — "Responsável".
- Botão-select: `width:100%; height:40px; padding:0 36px 0 13px; border-radius:10px; border:1px solid hsl(var(--input)); background:hsl(var(--background)); font-size:13.5px; text-align:left`; hover `border-color:ring/0.55`. Chevron `16×16px muted` posicionado `absolute; right:12px`, `pointer-events:none`.
- Popover de opções: `top:calc(100% + 6px); left:0; right:0; z-index:30; padding:5px; border-radius:11px; border; background:card; box-shadow:0 12px 30px hsl(var(--shadow)/calc(var(--shadow-a) * 3))`. Cada opção: `display:flex; align-items:center; gap:10px; padding:9px 10px; border-radius:8px; font-size:13.5px; font-weight:` ativa `600` / inativa `500`; ativa `background:accent`; hover `accent`. Opção ativa mostra ícone check `15px primary-text` à direita.
- **Opções:** LuCorreia Estética · Dra. Helena Costa · Atendente Ana Paula · Financeiro. Padrão: **LuCorreia Estética**.

> **Nota de conteúdo:** "LuCorreia Estética" lê como nome de empresa/clínica, não de uma pessoa responsável — as outras 3 opções são pessoas/setor. Confirme se é intencional (ex.: representa "equipe padrão") ou se deveria ser um nome de atendente como as demais.

### 10.4 Ações — Mover para funil / Perdeu

`display:flex; flex-direction:column; gap:9px`. Linha de botões `gap:9px`:

- **"Mover para funil"** (toggle, `flex:1`): `height:40px; padding:0 14px; border-radius:10px; font-size:13.5px; font-weight:600; gap:8px`; borda/fundo mudam quando o painel está aberto: fechado `border:input; background:background`; aberto `border:ring/0.6; background:accent`. Ícone swap `15px primary-text`.
- **"Perdeu" / "Perdido"** (toggle, só se `leadComercial`, `flex:none; min-width:112px`): `height:40px; padding:0 15px; border-radius:10px; font-weight:600; gap:8px`.
  - Estado **não perdido**: `border:1px solid hsl(var(--destructive)/0.5); background:transparent; color:hsl(var(--destructive))`. Label "Perdeu".
  - Estado **perdido**: `border:1px solid hsl(var(--destructive)); background:hsl(var(--destructive)); color:#fff`. Label "Perdido".

> ⚠️ **Gap do protótipo:** o estado "perdido" usa `color:#fff` **literal**, violando a regra "nunca `white`/`black` literal" do `design.md`. Use `hsl(var(--destructive-foreground))` — o token já existe no bloco `:root`/`.dark` pronto do `design.md` (`--destructive-foreground: 0 0% 100%`), só falta aplicá-lo aqui.

### 10.5 Painel "Mover para funil" (colapsável)

Aparece abaixo dos botões quando `moverOpen`. `gap:11px; padding:13px; border-radius:12px; border; background:hsl(var(--muted)/0.4)`:

- **"Funil de destino"** — label uppercase igual ao §10.3 + switch pequeno Comercial/Retenção (mesmo componente do §6.1: pílula `inset:3` desta vez, já que aqui o padding do trilho fica implícito no `segPill` default).
- **"Etapa"** — label + botão-select com **dot de cor da etapa** (`9×9px`, mesma paleta do §7.2) à esquerda do nome + chevron. Popover lista as etapas do funil selecionado (via `_stagesFor(funil)`), cada opção com dot + label + check se ativa. `max-height:210px; overflow:auto` no popover (etapas de Retenção são 6, podem não caber).
- **Botões:** "Cancelar" (`flex:none; height:38px`, borda `input`, hover `accent`) + **"Mover para {Comercial|Retenção}"** (`flex:1; height:38px; background:primary; color:primary-foreground`, ícone swap 15px, hover `brightness(1.05)`).
- **Ao confirmar:** atualiza `lead.stage` para a etapa escolhida e registra uma entrada no histórico (tipo "Movido", texto "Card movido para {Funil} · {Etapa}"), fecha o painel.

> ⚠️ **Gap do protótipo:** confirmar a movimentação **não** atualiza de fato a posição do card no quadro kanban (o board lê de `state.funis`/`state.added`, que não é tocado por essa ação) — só altera o `stage` exibido dentro do próprio drawer e grava uma linha de histórico. Em produção, essa ação precisa: mover o card entre colunas (e, se mudar de funil, entre abas), refletindo imediatamente no board por trás do drawer.

### 10.6 Composer "Registrar interação"

Label uppercase "Registrar interação". Wrapper `.senno-composer`: `border:1px solid input; border-radius:10px; background:background`; foco `border-color:ring; box-shadow:0 0 0 3px hsl(var(--ring)/0.18)`.

- **Dropdown de tipo** (barra superior dentro do composer): `height:38px; padding:0 34px 0 13px; border-bottom:1px solid border; border-radius:10px 10px 0 0; background:hsl(var(--muted)/0.4); font-weight:600; font-size:13px`; hover `background:hsl(var(--muted)/0.7)`. Chevron `15px` posicionado à direita. Popover com as mesmas medidas do §10.3 (menu de opções). **Opções:** Nota · Ligação · Mensagem · E-mail · Reunião. Padrão: **Nota**.
- **Textarea:** `min-height:76px; resize:none; padding:11px 58px 11px 13px; border-radius:0 0 10px 10px; font-size:13.5px; line-height:1.5`. Placeholder "Descreva a interação…".
- **Botão enviar:** `position:absolute; bottom:9px; right:20px; width:32px; height:32px; border-radius:8px; background:primary; color:primary-foreground`, ícone envio 15px, hover `brightness(1.05)`.
- **Ao enviar:** se o texto (trim) não é vazio, insere `{tipo, data:'agora', texto}` no **topo** do histórico (§10.7) e limpa o campo. Texto vazio → não-op (sem toast de erro).

### 10.7 Histórico

Label uppercase "Histórico · **{contagem}**" (contagem `tabular-nums`). Timeline vertical:

- Cada item: `display:flex; gap:12px`.
  - Coluna esquerda: dot `9×9px; margin-top:4px`, cor = cor do **tipo** (mesma paleta de §11.2/TYPE) + linha conectora `flex:1; width:1.5px; background:border; margin-top:4px` (some no último item, pois `flex:1` some quando não há espaço remanescente — na prática, cada item tem sua própria linha até o próximo).
  - Coluna direita (`flex:1; padding-bottom:15px`): linha `tipo (12.5px/600) + data (11px muted tabular)` + texto (`12.5px muted; margin-top:3px; line-height:1.5`).
- Itens mais recentes entram no topo (unshift).

### 10.8 Remover lead — só se `leadComercial`

`display:flex; justify-content:flex-end; padding-top:2px`. Botão-texto: `border:none; background:transparent; color:hsl(var(--destructive)); font-size:12.5px; font-weight:600; gap:7px`; hover `text-decoration:underline`. Ícone lixeira 14px. Label "Remover lead".

> ⚠️ **Gap do protótipo:** clicar aqui **só fecha o drawer** — não remove de fato o lead do quadro, e não há diálogo de confirmação. Em produção: abrir um confirm dialog (nunca `confirm()` nativo — usar o padrão de modal/alert-dialog do shadcn) e, ao confirmar, remover o card da coluna correspondente.

---

## 11. Drawer → aba Atividades

Coluna `gap:13px`.

### 11.1 Cabeçalho

`justify-content:flex-end`. Botão **"Nova atividade"**: `height:36px; padding:0 14px; border-radius:9px; background:primary; color:primary-foreground; font-size:13px; font-weight:600; gap:7px`, ícone `+` 15px, hover `brightness(1.05)`. Ao clicar, insere no topo uma atividade stub: `{título:'Nova atividade', desc:'', tipo:'Tarefa', quando:'Hoje', prioridade:'media', done:false}`.

> Em produção, isso deveria abrir um formulário (título, tipo, prazo, prioridade) em vez de criar um stub direto — o protótipo simplifica para focar no visual da lista.

### 11.2 Lista de atividades

`gap:10px`. Cada linha (`.senno-hoverrow`): `position:relative; display:flex; background:card; border:1px solid border; border-radius:11px; overflow:hidden; box-shadow:0 1px 2px hsl(var(--shadow)/var(--shadow-a))`; hover `border-color:primary/0.4`.

- **Barra de acento à esquerda:** `width:4px; background:{cor da prioridade}`.
- **Corpo:** `padding:12px 12px 12px 13px`.
  - **Checkbox circular** (`22×22px; border-radius:99px; margin-top:1px; border:1.5px solid`): não concluída → `border:border; background:transparent; color:muted-foreground/0.45`; concluída → `border:ok; background:ok; color:#fff` (⚠️ mesmo problema do `#fff` literal do §10.4 — usar um token de "on-ok"/contraste; `design.md` não define `--ok-foreground`, **recomenda-se adicionar esse token** já que `--ok` costuma ser escuro o bastante no light mas não necessariamente AA-safe para ícone branco — avaliar). Hover (não concluída): `border-color:ok; color:ok`. Contém ícone check 12px. Clique alterna `done`.
  - **Linha título + badge de prioridade:** título `flex:1; font-size:13px; font-weight:600`; concluída → `color:muted-foreground; text-decoration:line-through`. Badge de prioridade (`flex:none; font-size:9.5px; font-weight:700; letter-spacing:0.03em; text-transform:uppercase; padding:2px 8px; border-radius:99px`).
  - **Descrição** (opcional): `12px; color:muted-foreground; margin-top:3px; line-height:1.45`.
  - **Linha meta:** badge de tipo (`inline-flex; gap:6px; font-size:11px; font-weight:600; padding:3px 9px 3px 7px; border-radius:99px` + ícone 12px) + prazo (`11.5px muted tabular-nums`).
  - **Botão excluir** (`.senno-trash`, some por padrão — `opacity:0`, aparece no hover da linha ou `:focus-visible`): `28×28px; border-radius:7px`, ícone lixeira 15px; hover `background:destructive/0.12; color:destructive`.

**Prioridades (`PRIO`) — cores literais (texto / fundo / acento da barra esquerda):**
| Prioridade | Rótulo | texto | fundo | acento |
|---|---|---|---|---|
| `baixa` | Baixa | `hsl(var(--muted-foreground))` | `hsl(var(--muted))` | `hsl(var(--border))` |
| `media` | Média | `hsl(40 84% 42%)` | `hsl(45 92% 50% / 0.16)` | `hsl(45 90% 52%)` |
| `alta` | Alta | `hsl(24 82% 45%)` | `hsl(26 88% 52% / 0.16)` | `hsl(26 88% 54%)` |
| `urgente` | Urgente | `hsl(0 74% 50%)` | `hsl(0 80% 56% / 0.15)` | `hsl(0 80% 56%)` |
| `atrasada` | Atrasada | `hsl(0 74% 48%)` | `hsl(0 80% 52% / 0.16)` | `hsl(0 80% 50%)` |

> `baixa` reaproveita tokens semânticos; as outras 4 usam HSL literal — trate como paleta fixa de categoria (igual às cores de etapa do §7.2), não como tokens do tema.

### 11.3 Tipos de atividade/interação (`TYPE`) — reaproveitado em Atividades e Histórico

| Tipo     | Ícone          | fundo                      | cor                        |
| -------- | -------------- | -------------------------- | -------------------------- |
| Tarefa   | check-square   | `hsl(var(--primary)/0.14)` | `hsl(var(--primary-text))` |
| Reunião  | users          | `hsl(262 52% 58% / 0.16)`  | `hsl(262 48% 56%)`         |
| Ligação  | phone          | `hsl(217 80% 58% / 0.16)`  | `hsl(217 75% 50%)`         |
| E-mail   | mail           | `hsl(190 70% 45% / 0.18)`  | `hsl(190 68% 36%)`         |
| Nota     | note/file-text | `hsl(38 85% 50% / 0.18)`   | `hsl(32 80% 40%)`          |
| Mensagem | message-circle | `hsl(142 58% 44% / 0.16)`  | `hsl(142 52% 38%)`         |

> Só "Tarefa" usa tokens (`primary`/`primary-text`); os outros 5 tipos são HSL literal — mesma observação do §11.2.

### 11.4 Estado vazio

`flex-direction:column; align-items:center; text-align:center; gap:10px; padding:38px 20px; border:1px dashed border; border-radius:12px`: ícone tile `40×40px; border-radius:11px; background:muted; color:muted-foreground` com ícone check-square 20px + "Nenhuma atividade" `14px/600` + "Crie uma atividade para acompanhar este lead." `12.5px muted`.

---

## 12. Drawer → aba Anotações

Coluna `gap:14px`.

### 12.1 Composer

`.senno-composer`: mesma moldura do §10.6 mas **sem** dropdown de tipo — só textarea (`min-height:82px`, placeholder "Escreva uma anotação sobre este cliente…") + botão enviar (mesmas medidas do §10.6). Ao enviar: insere `{texto, autor:'Dra. Helena Costa', data:'agora'}` no topo das anotações.

> **Nota:** o autor é **fixo** no protótipo ("Dra. Helena Costa" — a usuária logada seed). Em produção, usar o usuário autenticado real.

### 12.2 Lista de anotações

`gap:10px`. Cada card (`.senno-hoverrow`): `background:card; border:1px solid border; border-radius:11px; padding:13px 14px`; hover `border-color:primary/0.4`. Texto `13px; color:foreground; line-height:1.55; padding-right:26px; white-space:pre-wrap` (preserva quebras de linha). Rodapé "{autor} · {data}" `11.5px muted; margin-top:9px`. Botão excluir (`.senno-trash`) `absolute; top:10px; right:10px; 28×28px`, mesmo tratamento hover do §11.2.

### 12.3 Estado vazio

Mesma estrutura do §11.4 (`padding:34px 20px`): ícone nota/arquivo-texto 20px + "Nenhuma anotação" `14px/600` + "Registre observações importantes sobre este cliente." `12.5px muted`.

---

## 13. Drawer → aba Documentos

Coluna `gap:14px`.

### 13.1 Cabeçalho

`justify-content:space-between; flex-wrap:wrap; gap:12px`. Esquerda: legenda `12px muted` — "Bucket privado · link temporário · máx. 25 MB". Direita: botão **"Enviar arquivo"** (mesmas medidas do "Nova atividade" §11.1), ícone upload 15px. Ao clicar, insere um documento stub `{nome:'novo-arquivo.pdf', meta:'— · Dra. Helena Costa · 06/07/2026'}` no topo.

> Em produção, isso deve abrir um seletor de arquivo real (drag-and-drop + `<input type=file>`) com validação de tamanho (25 MB) e progresso de upload — o stub do protótipo só ilustra o layout da linha.

### 13.2 Lista de documentos

`gap:10px`. Cada linha (`.senno-hoverrow`): `display:flex; align-items:center; gap:12px; background:card; border:1px solid border; border-radius:11px; padding:11px 13px`; hover `border-color:primary/0.4`.

- Ícone tile `36×36px; border-radius:9px; background:muted; color:primary-text` com ícone de arquivo 17px.
- Nome `13px/600`, trunca + meta `11.5px muted; margin-top:2px`, trunca (`"128 KB · Dra. Helena Costa · 06/07/2026"`).
- Botão baixar `30×30px; border-radius:7px`, ícone download 16px, hover `accent`.
- Botão excluir (`.senno-trash`) `30×30px`, mesmo tratamento hover do §11.2.

> ⚠️ **Gap do protótipo:** o botão de **download** não tem `onClick` — decorativo. Ligar ao link real do arquivo em produção.

### 13.3 Estado vazio

Mesma estrutura do §11.4/§12.3: ícone de arquivo 20px + "Nenhum documento" `14px/600` + "Envie exames, fichas e orçamentos deste cliente." `12.5px muted`.

---

## 14. Catálogo de animações

### Keyframes declaradas no `<style>` do Funil

| Nome              | Definição                                                                    | Uso                        | Status |
| ----------------- | ---------------------------------------------------------------------------- | -------------------------- | ------ |
| `senno-bell-ring` | `0%{rotate(0)} 15%{11deg} 30%{-9deg} 45%{6deg} 60%{-4deg} 75%{2deg} 100%{0}` | shake do sino (chrome)     | ok     |
| `senno-scrim-in`  | `from{opacity:0} to{opacity:1}`                                              | backdrop do drawer do lead | ok     |
| `senno-drawer-in` | `from{translateX(100%)} to{translateX(0)}`                                   | entrada do drawer do lead  | ok     |

### Keyframes referenciadas mas **ausentes** neste arquivo

| Nome               | Onde é usada                                  | Definição correta (copiar de `Novo Lead.dc.html`)                                       |
| ------------------ | --------------------------------------------- | --------------------------------------------------------------------------------------- |
| `senno-modal-fade` | backdrop do modal "Adicionar paciente" (§8.1) | `from{opacity:0} to{opacity:1}`                                                         |
| `senno-modal-in`   | painel do modal "Adicionar paciente" (§8.1)   | `from{opacity:0; transform:translateY(10px) scale(.985)} to{opacity:1; transform:none}` |

> ⚠️ **Gap do protótipo (repetido do §8.1 para visibilidade):** adicione as duas keyframes acima ao `<style>` do Funil antes de considerar a animação do modal "pronta" — hoje elas não existem neste arquivo e o modal aparece sem transição de entrada.

### Transições

| Elemento                                                           | Propriedade / timing                                                                                                                                                                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pílula do switch Comercial/Retenção (e do switch de funil-destino) | `transform .34s cubic-bezier(.34,1.1,.5,1)`                                                                                                                                                                                     |
| Texto dos botões do switch                                         | `color .25s`                                                                                                                                                                                                                    |
| Busca do topbar (expand/collapse)                                  | `width .34s cubic-bezier(.4,0,.2,1)`, bg/border/shadow `.22s`                                                                                                                                                                   |
| Toggle de tema (sol↔lua)                                           | `transform .5s cubic-bezier(.34,1.3,.5,1)`, `opacity .35s`                                                                                                                                                                      |
| Sino (shake)                                                       | `senno-bell-ring .7s cubic-bezier(.36,.07,.19,.97)` (classe removida no `animationend`)                                                                                                                                         |
| Card do kanban (hover)                                             | `border-color` → `hsl(var(--primary)/0.5)` (implícito via `style-hover`, sem `transition` explícita declarada — **recomenda-se** adicionar `transition:border-color .16s ease, box-shadow .16s ease` em produção para suavizar) |
| Checkbox de atividade (concluir)                                   | `border-color .18s ease, background .18s ease, color .18s ease`                                                                                                                                                                 |
| Botão de excluir (`.senno-trash`)                                  | aparece/some no hover da linha: `opacity .16s ease, background .16s ease, color .16s ease`                                                                                                                                      |
| Drawer do lead (entrada)                                           | `senno-drawer-in .34s cubic-bezier(.22,1,.36,1)`                                                                                                                                                                                |
| Backdrop do drawer                                                 | `senno-scrim-in .22s ease`                                                                                                                                                                                                      |
| Modal picker (entrada)                                             | `senno-modal-in .3s cubic-bezier(.22,1,.36,1)` — **ver gap acima**                                                                                                                                                              |

---

## 15. Thresholds & lógica condicional (resumo)

| Onde                                               | Regra                                                                                                                                                                                  |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Botão "+" no cabeçalho da coluna (Comercial)       | aparece **só** na etapa **Lead** (`col.name === 'Lead'`)                                                                                                                               |
| Botão "+" no cabeçalho da coluna (Retenção)        | aparece em **todas** as colunas (`showAdd = true` sempre) — regra assimétrica entre as duas abas de funil                                                                              |
| Contagem da coluna                                 | `col.count = cards.length` (inclui cards adicionados via picker, que entram no topo)                                                                                                   |
| `leadComercial`                                    | `false` quando o card veio de uma coluna da aba **Retenção** (`card.funil === 'retencao'`); controla a visibilidade de Responsável (§10.3), Perdeu (§10.4) e Remover lead (§10.8)      |
| Botão "Perdeu"/"Perdido"                           | toggle local (`lead.lost`); não remove o card do board nem move para "Cancelado" — só troca o rótulo/cor do próprio botão                                                              |
| Painel "Mover para funil" — etapa padrão ao abrir  | se a etapa atual do lead existir no funil já selecionado, mantém; senão volta para a 1ª etapa do funil de destino                                                                      |
| Trocar o funil de destino dentro do painel "Mover" | reseta a etapa selecionada para a 1ª etapa do novo funil                                                                                                                               |
| Confirmar "Mover para funil"                       | atualiza `lead.stage` + grava entrada "Movido" no histórico; **não** reposiciona o card no board (ver gap §10.5)                                                                       |
| Dropdowns mutuamente exclusivos                    | abrir **Responsável** fecha **Tipo de interação** (e vice-versa); abrir o painel **Mover para funil** fecha ambos                                                                      |
| Fechamento por clique-fora (`document mousedown`)  | fecha **Responsável** e **Tipo de interação** se o clique for fora de `[data-dropdown]` — **não cobre** o dropdown de "Etapa" dentro do painel Mover (ver §16)                         |
| Tecla `Escape` — prioridade                        | 1) se Responsável **ou** Tipo de interação aberto → fecha os dois; 2) senão, se o drawer do lead está aberto → fecha o drawer; 3) senão, se o modal picker está aberto → fecha o modal |
| Registrar interação / Nova anotação                | texto vazio (após `trim()`) → não-op, sem toast de erro                                                                                                                                |
| Badge de contagem nas abas do drawer               | só em Atividades/Anotações/Documentos; Info nunca tem badge                                                                                                                            |
| Abas do drawer — indicador                         | underline 2px dourado, corta no fim da última aba (não atravessa a barra toda)                                                                                                         |
| Busca do modal picker — match                      | nome (minúsculo, **sem** remoção de acento) contém `q` **OU** telefone só-dígitos contém dígitos de `q`                                                                                |
| Card adicionado via picker                         | entra no **topo** da coluna-alvo, `source:'Cadastro'`, `age:'agora'` — guardado só em memória (não persiste)                                                                           |

---

## 16. Ações sem handler / lacunas do protótipo (tabela única)

> Lista consolidada de todo elemento clicável **sem** `onClick` (puramente decorativo) ou com comportamento incompleto, encontrado na leitura linha a linha. Use esta tabela como checklist de "o que ligar de verdade" ao portar para produção.

| Elemento                                       | Localização                                                                     | Comportamento hoje                                               | O que fazer em produção                                                                                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Busca colapsável do topbar                     | §3.1                                                                            | input sem estado, sem popover                                    | decidir: remover (recomendado) ou ligar ao popover de resultados do Dashboard                                                                                                             |
| Busca ampla do corpo                           | §5                                                                              | input sem estado, sem filtro                                     | implementar filtro cruzando nome/telefone/e-mail nas colunas do funil ativo                                                                                                               |
| Botão "+" novo funil                           | §6.1                                                                            | sem `onClick`                                                    | abrir fluxo de criação de funil                                                                                                                                                           |
| Botão "Ajuda sobre funis"                      | §6.1                                                                            | sem `onClick`, só `title`                                        | abrir popover/painel de ajuda                                                                                                                                                             |
| Botão "Editar etapas"                          | §6.2                                                                            | sem `onClick`                                                    | abrir editor de etapas (renomear/reordenar/cor)                                                                                                                                           |
| Confirmar "Mover para funil"                   | §10.5                                                                           | atualiza só o drawer, não o board                                | mover o card entre colunas/abas de fato                                                                                                                                                   |
| "Remover lead"                                 | §10.8                                                                           | só fecha o drawer                                                | confirm dialog (não nativo) + remoção real do card                                                                                                                                        |
| Botão "Baixar" (Documentos)                    | §13.2                                                                           | sem `onClick`                                                    | ligar ao link/download do arquivo                                                                                                                                                         |
| Dropdown "Etapa" (painel Mover)                | §10.5 / §15                                                                     | não fecha no clique-fora nem tem cobertura de `Escape` dedicada  | estender o handler global de clique-fora/Escape para cobrir também este dropdown                                                                                                          |
| Cor `#fff` literal                             | §10.4 (botão Perdido), §11.2 (checkbox concluído)                               | usa branco puro em vez de token                                  | trocar por `hsl(var(--destructive-foreground))` / equivalente para `ok`                                                                                                                   |
| `senno-modal-fade` / `senno-modal-in`          | §8.1 / §14                                                                      | referenciadas mas não definidas neste arquivo                    | copiar as keyframes de `Novo Lead.dc.html`                                                                                                                                                |
| Cards adicionados via picker                   | §8.4                                                                            | só em memória, sem dedupe                                        | persistir + checar duplicidade entre colunas/funis                                                                                                                                        |
| Ícones novos não catalogados em `design.md` §6 | swap, thumbs-down, send, mail, note/file-text, message-circle, file (documento) | usados no Funil mas ausentes da lista de ícones do design system | adicionar ao catálogo de ícones do `design.md` (todos cobertos 1:1 por `lucide-react`: `repeat`/`arrow-left-right`, `thumbs-down`, `send`, `mail`, `file-text`, `message-circle`, `file`) |

---

## 17. Dados de exemplo (fonte da verdade)

### Notificações (5 — idênticas às do Dashboard)

```
1 lead    "Novo lead"                — Mariana Alves · Instagram            — agora  — não-lida
2 money   "Pagamento confirmado"     — R$ 1.200 · Botox · Camila Souza      — 8 min  — não-lida
3 agenda  "Agendamento confirmado"   — Patrícia Lima · amanhã às 14h        — 40 min — não-lida
4 alert   "Tarefa atrasada"          — Retornar ligação · Rafael Dias       — 1 h    — lida
5 agenda  "Novo agendamento online"  — Beatriz Ramos · Limpeza de pele      — 3 h    — lida
```

### Colunas e cards — Funil Comercial

```
Lead (violet):
  Mariana Costa      — Drenagem linfática      — Meta Ads   — (11) 98472-1130 — há 2 dias
  Anderson Pereira   — Avaliação               — Instagram  — (11) 97001-8899 — há 4 dias
Agendado (amber):
  Patrícia Nunes     — Preenchimento labial    — Indicação  — (21) 98123-7788 — há 1 dia
Fechado (green):
  Camila Ribeiro     — Microagulhamento        — Walk-in    — (11) 97654-3321 — há 5 dias
Compareceu (blue):
  Bruno Almeida      — Botox — full face       — Meta Ads   — (11) 99021-4456 — há 3 dias
Cancelado (red): vazio
```

### Colunas e cards — Funil Retenção

```
Pós-procedimento (violet):
  Janaina Yeva       — Presencial — (41) 99665-6242 — há 7 dias
  Guilherme Rocha    — Presencial — (41) 99976-0732 — há 7 dias
Nutrição (green): vazio
Reativação (amber):
  Helena Martins     — Presencial — (31) 99110-2034 — há 6 dias
Fidelização (blue): vazio
Salvamento (red): vazio
Em tratamento (amber): vazio
```

### Pacientes disponíveis no picker "Adicionar paciente" (14)

```
Fernanda Albuquerque  — Limpeza de pele          — (11) 98812-4471
Ricardo Menezes       — Botox — testa            — (11) 99630-1188
Aline Cavalcanti      — Drenagem linfática        — (21) 98450-2290
Thiago Barbosa        — Avaliação                 — (11) 97112-8834
Luana Figueiredo      — Preenchimento labial      — (31) 99021-6675
Marcelo Tavares       — Microagulhamento          — (11) 98330-4412
Sabrina Nogueira      — Peeling químico           — (41) 99887-3320
Diego Fontenele       — Avaliação                 — (85) 98123-7745
Renata Vasconcelos    — Harmonização facial       — (11) 99504-6621
Otávio Siqueira       — Botox — full face         — (21) 98770-1145
Priscila Andrade      — Limpeza de pele           — (11) 98219-9032
Gustavo Rezende       — Avaliação                 — (51) 99334-8890
Isabela Moraes        — Drenagem linfática         — (11) 97788-5510
Vinícius Cordeiro     — Preenchimento             — (62) 99110-4402
```

### Lead-seed ao abrir o drawer (`_seedLead`, aplicado a qualquer card clicado)

- E-mail gerado: `{primeironome}.{segundonome}@email.com` (minúsculo).
- Valor estimado por palavra-chave do procedimento: botox → R$ 1.200,00 · preenchimento → R$ 980,00 · drenagem → R$ 220,00 · microagulhamento → R$ 650,00 · harmoniza(ção) → R$ 2.400,00 · limpeza → R$ 180,00 · peeling → R$ 420,00 · (default, sem match) → R$ 300,00.
- Responsável padrão: "LuCorreia Estética".
- **Histórico seed (3 itens, do mais recente para o mais antigo):**
  ```
  Nota     18/06 · 15:53  "Retornou contato pelo WhatsApp; demonstrou interesse em agendar avaliação."
  Ligação  17/06 · 20:44  "Ligação realizada. Cliente pediu para retornar após as 18h."
  Reunião  17/06 · 20:43  "Agendamento criado ao mover o card para Agendado."
  ```
- **Atividades seed (5 itens):**
  ```
  Retornar ligação de {nome}     — Ligação  — Hoje · 15:00   — atrasada — "Cliente pediu retorno hoje à tarde."
  Enviar orçamento de {proc}     — Mensagem — Hoje · 18:30   — urgente  — "Encaminhar proposta com valores e formas de pagamento."
  Confirmar avaliação            — Tarefa   — Amanhã · 10:00 — alta     — "Confirmar presença na avaliação agendada."
  Anotar preferências na ficha   — Nota     — Qui · 12:00    — media    — (sem descrição)
  Enviar conteúdo pós-venda      — E-mail   — Sex · 09:00    — baixa    — "Material educativo sobre cuidados."
  ```
- **Anotações seed (2 itens):**
  ```
  "Prefere atendimento no período da tarde. Já fez procedimento parecido em outra clínica." — Dra. Helena Costa — 06/07 · 23:33
  "Sensibilidade a anestésico tópico — confirmar com a equipe antes do procedimento."        — Ana Paula          — 05/07 · 14:10
  ```
- **Documentos seed (2 itens):**
  ```
  ficha-anamnese.pdf                    — 128 KB · Dra. Helena Costa · 06/07/2026
  orcamento-{proc-slug}.pdf             — 96 KB · Ana Paula · 05/07/2026
  ```

---

## 18. Props do componente & integração com o App

**Props do Funil** (`data-props`, `$preview` 1440×900):

- `defaultTheme`: enum `light | dark` (default `light`).

**Callbacks/props que o App injeta** (via `App.dc.html`, idêntico ao padrão das outras telas):

- `theme` (controlado externamente pelo App via `localStorage['senno-theme']`), `onToggleTheme()`, `onSetTheme('light'|'dark')`.
- `onNavigate(labelDaRota)` — usado pela nav da sidebar (não há outro deep-link nesta tela, ao contrário do Dashboard).
- `onNewLead()` — botão "Novo lead" do topbar; o App usa isso para montar `Novo Lead.dc.html` **por cima** de qualquer tela ativa (modal global, não uma importação do próprio Funil).

**Estado local (não vem de props):** aba de funil ativa (`comercial`/`retencao`), cards adicionados via picker, todo o estado do drawer do lead (aba ativa, dados do lead seedado, composers, dropdowns), estado dos popovers de notificação. **Nada disso é persistido** (some ao recarregar) — em produção, tudo isso deve vir de/gravar num backend real (funil + etapas + cards são entidades do banco, não estado de componente).

---

## 19. Ordem de build sugerida + checklist

**Ordem:**

1. Tokens no `globals.css` + Inter + `tabular-nums` (ver `design.md`) — já deve estar feito se o Dashboard/Atividades/Agenda já existem no codebase.
2. **Chrome** (sidebar 236px + topbar) — reaproveitar 1:1 das telas já implementadas.
3. Primitivos reutilizados: card, botão primário/ghost, **segmented dourado com pílula deslizante**, badge/pill, popover (overlay+painel), empty state simples e composto, drawer lateral (overlay+scrim+slide-in).
4. Busca ampla do corpo (§5, com filtro funcional) → abas de funil + editar etapas (§6) → quadro kanban (§7) → modal "Adicionar paciente" (§8).
5. Drawer do lead: header + abas (§9) → aba Info (§10) → aba Atividades (§11) → aba Anotações (§12) → aba Documentos (§13).
6. Corrigir as lacunas do §16 (handlers ausentes, keyframes ausentes, `#fff` literal, dedupe de cards, persistência).
7. Ligar callbacks (`onNavigate`, `onToggleTheme`, `onNewLead`) e rodar o checklist do `design.md` §9.

**Checklist específico do Funil:**

- [ ] Body da tela **não rola** — só o quadro kanban rola horizontalmente.
- [ ] Botão "+" da coluna: só na 1ª etapa em Comercial, em **todas** as etapas em Retenção.
- [ ] Cores de etapa/tipo/prioridade tratadas como paleta literal de categoria (não tokens) — mas nunca `white`/`black` puro (trocar os 2 usos de `#fff`).
- [ ] Busca do topbar removida ou ligada ao popover padrão (decidir com o time); busca do corpo com filtro funcional (nome/telefone/e-mail).
- [ ] Modal "Adicionar paciente" com fade+scale-in (adicionar as keyframes que faltam) e filtro com normalização de acento igual ao Dashboard.
- [ ] Drawer do lead: `leadComercial` esconde Responsável/Perdeu/Remover quando o lead vem de Retenção.
- [ ] Painel "Mover para funil" realmente reposiciona o card no board (não só no drawer).
- [ ] Dropdowns (Responsável / Tipo de interação / Etapa do mover) mutuamente exclusivos, fecham no clique-fora e no `Escape` — incluir o dropdown de Etapa, hoje fora da cobertura.
- [ ] "Remover lead" com confirm dialog real (nunca `confirm()`/`alert()` nativo) e remoção efetiva do card.
- [ ] Abas do drawer com badge tabular e underline que corta no fim da última aba.
- [ ] Estados vazios de coluna (simples) e de Atividades/Anotações/Documentos (compostos) implementados.
- [ ] `tabular-nums` em: contagens de coluna, telefones, valores R$, badges de contagem das abas, datas do histórico.
- [ ] Dois dourados nos papéis certos (`primary` superfície nos botões/pílulas / `primary-text` em ícones-texto, nav ativo, etapa ativa do lead, valor).
- [ ] Ícones novos (swap, thumbs-down, send, mail, file-text, message-circle, file) adicionados ao catálogo do `design.md`.
- [ ] Persistência real: funis, etapas, cards e todo o conteúdo do drawer (atividades/anotações/documentos/histórico) vindos do backend, não de `state` local.
