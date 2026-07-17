# `components/shared` — o que é compartilhado entre Admin e Clínica (e por quê)

Reforma "Divisão Total" (Fase 7). Regra: **só entra aqui o que é display BURRO e
domínio-neutro** — sem regra de negócio, sem `if (role)`, sem decidir entre
admin e clínica. Na dúvida, **não** é shared (vai para o domínio).

O compartilhado legítimo se resume a:

- `components/ui/` — primitivos shadcn (botão, dialog, input...). Não vivem aqui.
- `components/shared/` — componentes/labels de display reusados pelos dois
  domínios, sem lógica de domínio (este diretório).
- `src/shared/` — **tipos/contratos puros** cross-camada (ex.: `calendar-types`),
  fora de `components/` para o server poder importar sem inverter o layering.
- `lib/`, núcleo de auth/tenant — infra transversal.

## Inventário (Fase 7)

| Item                                  | Por que é shared                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `notifications/notification-icon.tsx` | Ícone/cor/label por `NotificationType`. Sem domínio.                                       |
| `notifications/notification-bell.tsx` | Sino do topbar (ações por `userId` do próprio usuário). Usado pelas duas cascas de topbar. |
| `calendar/calendar-inner.tsx`         | Render FullCalendar puro. Recebe eventos/feriados já montados.                             |
| `calendar/color-picker.tsx`           | Paleta de cor de evento. Display puro.                                                     |
| `activities/types.ts`                 | `ActivityView` + labels/cores de tipo/status/prioridade. Contrato display.                 |
| `activities/folder-colors.ts`         | Cor determinística de pasta por `userId`. Função pura.                                     |
| `settings/profile-form.tsx`           | Form de perfil (nome) — conta-nível, idêntico nos dois domínios.                           |
| `settings/change-password-form.tsx`   | Troca de senha — conta-nível, idêntico nos dois domínios.                                  |
| `route-error-card.tsx`                | Caixa de erro inline dos `error.tsx` de rota (título via prop). Display puro.              |

> O que **não** é shared (mora no domínio): páginas/rotas, server actions,
> queries, repositories, e qualquer componente que escolha comportamento por
> domínio. Sidebar/topbar têm casca burra em `components/layout/*-shell` +
> wrapper por domínio em `components/{admin,clinic}/*` (Fase 5).
