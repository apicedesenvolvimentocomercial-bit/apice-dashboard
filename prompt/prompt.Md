# PROMPT DEFINITIVO — KPI CLINIC OS
## Para execução por Claude Opus 4.7 dentro do Claude Code

---

## 📌 META-INSTRUÇÕES (LEIA ANTES DE QUALQUER LINHA DE CÓDIGO)

Você é **Arquiteto de Software Sênior + Tech Lead + Product Engineer** especializado em SaaS B2B multi-tenant de alta complexidade. Sua missão é construir o **KPI CLINIC OS**, um sistema operacional completo para gestão, crescimento e otimização de clínicas estéticas.

**Antes de escrever qualquer código, você deve:**

1. **Ler este prompt INTEIRO** uma vez antes de começar.
2. **Não tentar entregar tudo em uma única execução.** Siga o **Plano de Execução por Fases** (Seção 14). Entregue uma fase por vez, peça validação, e só então prossiga para a próxima.
3. **Quando houver ambiguidade, pare e pergunte.** Não invente regras de negócio. Não pule etapas.
4. **Nunca use placeholders ou TODOs em código que deveria estar funcional na fase atual.** Se algo não estiver na fase atual, omita o módulo inteiro e marque na lista de pendências da fase.
5. **Ao final de cada fase, gere um relatório** com: o que foi feito, o que ficou pendente, decisões técnicas tomadas, riscos identificados, e como testar.
6. **Toda decisão técnica não trivial deve ser justificada** em comentário no código ou no relatório de fase.

**Reality check honesto:** Construir um SaaS production-ready de ~25 telas, multi-tenant, com motor de insights e integrações, **não cabe em uma única sessão**. Esperar isso é pedir para receber um esqueleto cheio de bugs. Por isso este prompt é estruturado em fases incrementais e testáveis.

---

## SEÇÃO 1 — VISÃO DO PRODUTO

### 1.1 Contexto de negócio

O usuário (Admin) é um **consultor/gestor que atende múltiplas clínicas estéticas** como clientes. Ele precisa:

- Visualizar e diagnosticar a performance de cada clínica
- Gerenciar comercialmente seus próprios clientes (clínicas) via CRM próprio
- Permitir que cada clínica também opere um CRM interno (gestão de leads dela)
- Gerar relatórios e insights acionáveis para cada clínica
- Comparar performance entre clínicas
- Controlar atividades, agenda e tarefas operacionais

### 1.2 Personas

| Persona | Quem é | O que faz no sistema |
|---|---|---|
| **ADMIN** | Dono do KPI Clinic OS (você) | Acessa tudo: todas as clínicas, dashboards globais, configurações |
| **STAFF** | Funcionários do Admin | Acesso parcial baseado em permissões granulares |
| **CLIENT_OWNER** | Dono/gestor da clínica cliente | Vê apenas dados da clínica dele, opera CRM da clínica, dá baixa em leads, vê dashboard próprio |
| **CLIENT_STAFF** | Funcionário da clínica | Acesso operacional limitado dentro da clínica (cadastrar leads, mover funil, marcar comparecimento) |

### 1.3 Princípios do produto

1. **Orientado a decisão**, não a relatório. Cada tela deve responder "o que fazer agora?"
2. **Diagnóstico antes de dado bruto**. O insight vem antes do gráfico.
3. **Isolamento total entre tenants**. Furo de dados = produto morto.
4. **Performance é feature**. Dashboards lentos não são usados.
5. **Brasileiro por padrão**. BRL, pt-BR, fuso `America/Sao_Paulo`, LGPD.

---

## SEÇÃO 2 — STACK DEFINITIVO (DECISÕES TOMADAS, SEM AMBIGUIDADE)

| Camada | Tecnologia | Justificativa |
|---|---|---|
| Framework | **Next.js 14+ (App Router)** | Server Components, server actions, edge-ready |
| Linguagem | **TypeScript em modo `strict`** | Sem `any`, sem `@ts-ignore` exceto com comentário justificando |
| ORM | **Prisma** | Tipagem forte, migrations gerenciadas |
| Banco | **PostgreSQL via Supabase** | RLS nativo, backup, fácil deploy |
| Auth | **NextAuth v5 (Auth.js) + Supabase Adapter** | Flexível para multi-tenant complexo, custo zero, controle total. **Decisão final: NextAuth.** Não usar Clerk no MVP. |
| UI | **Tailwind CSS + shadcn/ui** | Componentes copiados, customizáveis |
| Estado global | **Zustand** | Leve, sem boilerplate |
| Dados async | **TanStack Query (React Query) v5** | Cache, revalidação, optimistic updates |
| Validação | **Zod** | Schema único client/server |
| Forms | **react-hook-form + @hookform/resolvers/zod** | Padrão indústria |
| Tabelas | **TanStack Table v8** | Headless, customizável |
| Gráficos | **Recharts** | Bom para Next.js, suficiente para o escopo |
| Drag & Drop | **@dnd-kit/core** | Acessível, performático |
| Datas | **date-fns** + **date-fns-tz** | Imutável, tree-shakeable |
| Calendário | **FullCalendar (versão React)** | Maduro, completo |
| Notificações UI | **sonner** (toasts) + **shadcn/ui dialog** | Padrão do shadcn |
| Email transacional | **Resend** | Simples, free tier generoso |
| Logs/Monitoring | **Sentry** (errors) + console estruturado | Free tier suficiente para MVP |
| Deploy | **Vercel** + Supabase | Integração nativa |
| Linter/Formatter | **ESLint + Prettier + lint-staged + husky** | Pre-commit obrigatório |
| Testes | **Vitest** (unit) + **Playwright** (E2E para fluxos críticos) | Configurar do dia 1, mas só obrigar testes em fluxos críticos no MVP |

### 2.1 Variáveis de ambiente obrigatórias (`.env.example`)

```bash
# Database
DATABASE_URL=
DIRECT_URL=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=

# Email
RESEND_API_KEY=
EMAIL_FROM=

# Sentry
NEXT_PUBLIC_SENTRY_DSN=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME="KPI Clinic OS"

# Feature flags (para integrações futuras)
WHATSAPP_API_ENABLED=false
META_ADS_ENABLED=false
GOOGLE_ADS_ENABLED=false
```

---

## SEÇÃO 3 — ARQUITETURA E ESTRUTURA DE PASTAS

### 3.1 Estrutura completa

```
/src
  /app
    /(auth)                       # rotas públicas de auth
      /login
      /accept-invite
    /(admin)                      # rotas do ADMIN/STAFF
      /dashboard                  # dashboard global
      /clients                    # lista e gestão de clínicas
        /[clientId]
          /overview               # dashboard individual da clínica
          /crm                    # CRM da clínica (visão admin)
          /financial
          /procedures
          /patients
          /insights
          /goals
          /settings
      /pipeline                   # CRM próprio do admin (gestão das clínicas como clientes)
      /activities
      /calendar
      /reports
      /staff                      # gestão de funcionários do admin
      /settings
    /(client)                     # rotas do CLIENT_OWNER/CLIENT_STAFF
      /dashboard
      /crm                        # CRM da clínica para uso próprio
      /financial
      /patients
      /appointments
      /procedures
      /reports
      /settings
    /api
      /auth/[...nextauth]
      /webhooks                   # estrutura preparada
      /cron                       # jobs (snapshots de KPIs)
    /layout.tsx
    /page.tsx                     # landing/redirect

  /components
    /ui                           # shadcn components
    /layout                       # sidebar, topbar, breadcrumb
    /charts                       # wrappers de Recharts
    /tables                       # wrappers de TanStack Table
    /forms                        # componentes de form reutilizáveis
    /shared                       # empty states, loading, error boundaries

  /modules                        # lógica de domínio por módulo
    /dashboard
    /clients
    /crm
    /financial
    /procedures
    /patients
    /appointments
    /activities
    /insights
    /goals
    /reports
    /staff
    /settings
    /integrations

  /server
    /actions                      # server actions (mutations)
    /queries                      # data fetching server-side
    /services                     # regras de negócio puras
    /repositories                 # acesso ao banco (Prisma)
    /jobs                         # cron jobs, snapshots
    /auth                         # config NextAuth, helpers
    /tenant                       # middleware e helpers de multi-tenant

  /lib
    /prisma.ts
    /supabase.ts
    /resend.ts
    /sentry.ts
    /constants.ts
    /env.ts                       # validação Zod das env vars

  /hooks
  /utils                          # funções puras (formatters, validators)
  /types                          # tipos compartilhados
  /styles
  /tests
    /unit
    /e2e

/prisma
  /schema.prisma
  /migrations
  /seed.ts

/public
```

### 3.2 Padrões arquiteturais obrigatórios

1. **Repository Pattern**: todo acesso ao Prisma passa por `/server/repositories/*`. Server Actions e Queries NUNCA chamam `prisma` diretamente.
2. **Service Layer**: regras de negócio ficam em `/server/services/*`. Repositories só fazem CRUD.
3. **Server Actions com Zod**: toda action valida input com Zod antes de qualquer operação.
4. **Tenant Context**: toda query passa por um helper que injeta `organizationId` automaticamente. Ver Seção 5.
5. **Result type**: services retornam `Result<T, AppError>` (success/error tipado), nunca lançam exceções não tratadas.
6. **Error boundaries** em cada `(group)/layout.tsx`.
7. **Loading states** com `loading.tsx` em cada rota.

---

## SEÇÃO 4 — MODELO DE DADOS COMPLETO (PRISMA)

### 4.1 Princípios da modelagem

- **KPIs NÃO são tabela primária.** São calculados a partir de Lead, Deal, Revenue, Cost, Appointment. **Existe** uma tabela `KpiSnapshot` para agregados diários/mensais (performance), mas é cache, não fonte da verdade.
- **Soft delete universal**: campo `deletedAt DateTime?` em toda tabela com dado de negócio.
- **Multi-tenant**: campo `organizationId` em **toda** tabela exceto `User` e `Organization`. Index composto `(organizationId, ...)` em todas as queries comuns.
- **Auditoria**: `createdAt`, `updatedAt`, `createdById`, `updatedById` em entidades importantes.
- **Timezone**: tudo em UTC no banco. Conversão para `America/Sao_Paulo` na UI.

### 4.2 Schema Prisma completo

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// =====================================================
// AUTH & ORGANIZATION
// =====================================================

model Organization {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?

  users       User[]
  clients     Client[]
  invitations Invitation[]
  auditLogs   AuditLog[]

  @@index([slug])
}

enum UserRole {
  ADMIN
  STAFF
  CLIENT_OWNER
  CLIENT_STAFF
}

model User {
  id             String   @id @default(cuid())
  email          String   @unique
  name           String
  passwordHash   String?
  emailVerified  DateTime?
  image          String?
  role           UserRole
  isActive       Boolean  @default(true)
  lastLoginAt    DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  deletedAt      DateTime?

  organizationId String?
  organization   Organization? @relation(fields: [organizationId], references: [id])

  // Se for CLIENT_*, pertence a uma clínica específica
  clientId       String?
  client         Client?       @relation(fields: [clientId], references: [id])

  permissions    UserPermission[]
  sessions       Session[]
  accounts       Account[]
  activities     Activity[]
  notifications  Notification[]

  @@index([organizationId])
  @@index([clientId])
  @@index([email])
}

model UserPermission {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  module    String   // 'crm', 'financial', 'insights', etc.
  canRead   Boolean  @default(true)
  canWrite  Boolean  @default(false)
  canDelete Boolean  @default(false)

  @@unique([userId, module])
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Invitation {
  id             String   @id @default(cuid())
  email          String
  role           UserRole
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  clientId       String?
  client         Client?  @relation(fields: [clientId], references: [id])
  token          String   @unique
  expiresAt      DateTime
  acceptedAt     DateTime?
  invitedById    String
  createdAt      DateTime @default(now())

  @@index([token])
  @@index([email])
}

// =====================================================
// CLIENT (CLÍNICA)
// =====================================================

enum ClientStatus {
  ACTIVE
  INACTIVE
  ONBOARDING
  CHURNED
}

model Client {
  id              String   @id @default(cuid())
  organizationId  String
  organization    Organization @relation(fields: [organizationId], references: [id])

  name            String
  slug            String
  city            String?
  state           String?
  phone           String?
  email           String?
  status          ClientStatus @default(ONBOARDING)
  monthlyFee      Decimal?  @db.Decimal(12, 2) // mensalidade que esta clínica paga ao admin
  contractStart   DateTime?
  notes           String?   @db.Text

  // Campos calculados (cache, atualizado por job)
  healthScore     Int?      // 0-100
  lastSnapshotAt  DateTime?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?

  users           User[]
  invitations     Invitation[]
  leads           Lead[]
  patients        Patient[]
  procedures      Procedure[]
  procedureCategories ProcedureCategory[]
  revenues        Revenue[]
  costs           Cost[]
  appointments    Appointment[]
  activities      Activity[]
  insights        Insight[]
  goals           Goal[]
  pipelineStages  PipelineStage[]
  marketingCampaigns MarketingCampaign[]
  kpiSnapshots    KpiSnapshot[]
  pipelineDeals   PipelineDeal[] // pipeline interno da clínica como cliente do admin

  @@unique([organizationId, slug])
  @@index([organizationId, status])
  @@index([organizationId, deletedAt])
}

// =====================================================
// CRM — PIPELINE INTERNO (clínica gerencia leads dela)
// =====================================================

model PipelineStage {
  id          String   @id @default(cuid())
  clientId    String
  client      Client   @relation(fields: [clientId], references: [id])
  name        String
  order       Int
  color       String?
  isWon       Boolean  @default(false) // estágio final de "ganho"
  isLost      Boolean  @default(false) // estágio final de "perdido"
  createdAt   DateTime @default(now())

  leads       Lead[]

  @@unique([clientId, order])
  @@index([clientId])
}

enum LeadSource {
  META_ADS
  GOOGLE_ADS
  ORGANIC
  REFERRAL
  WHATSAPP
  WALK_IN
  OTHER
}

model MarketingCampaign {
  id          String   @id @default(cuid())
  clientId    String
  client      Client   @relation(fields: [clientId], references: [id])
  name        String
  source      LeadSource
  budget      Decimal? @db.Decimal(12, 2)
  startDate   DateTime
  endDate     DateTime?
  isActive    Boolean  @default(true)
  notes       String?  @db.Text
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?

  leads       Lead[]
  costs       Cost[]

  @@index([clientId, isActive])
}

model Lead {
  id              String   @id @default(cuid())
  organizationId  String
  clientId        String
  client          Client   @relation(fields: [clientId], references: [id])

  name            String
  phone           String?
  email           String?
  source          LeadSource
  campaignId      String?
  campaign        MarketingCampaign? @relation(fields: [campaignId], references: [id])
  procedureInterest String?
  notes           String?  @db.Text

  stageId         String
  stage           PipelineStage @relation(fields: [stageId], references: [id])

  // Tempo no funil
  firstContactAt  DateTime?  // timestamp de primeira resposta da clínica
  scheduledAt     DateTime?
  attendedAt      DateTime?
  closedAt        DateTime?
  lostAt          DateTime?
  lostReason      String?

  // Conversão
  patientId       String?    // se virou paciente
  patient         Patient?   @relation(fields: [patientId], references: [id])
  estimatedValue  Decimal?   @db.Decimal(12, 2)

  assignedToId    String?    // user responsável

  tags            String[]   // array Postgres

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  createdById     String?
  updatedById     String?
  deletedAt       DateTime?

  interactions    LeadInteraction[]

  @@index([organizationId, clientId])
  @@index([clientId, stageId, deletedAt])
  @@index([clientId, source])
  @@index([clientId, createdAt])
}

model LeadInteraction {
  id          String   @id @default(cuid())
  leadId      String
  lead        Lead     @relation(fields: [leadId], references: [id], onDelete: Cascade)
  type        String   // 'call', 'whatsapp', 'email', 'note', 'stage_change'
  content     String   @db.Text
  metadata    Json?
  createdById String?
  createdAt   DateTime @default(now())

  @@index([leadId, createdAt])
}

// =====================================================
// PACIENTES
// =====================================================

model Patient {
  id              String   @id @default(cuid())
  organizationId  String
  clientId        String
  client          Client   @relation(fields: [clientId], references: [id])

  name            String
  phone           String?
  email           String?
  birthDate       DateTime?
  cpf             String?  // criptografar em produção
  notes           String?  @db.Text
  tags            String[]

  firstVisitAt    DateTime?
  lastVisitAt     DateTime?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?

  leads           Lead[]
  appointments    Appointment[]
  revenues        Revenue[]

  @@index([organizationId, clientId])
  @@index([clientId, deletedAt])
}

// =====================================================
// PROCEDIMENTOS
// =====================================================

model ProcedureCategory {
  id          String   @id @default(cuid())
  clientId    String
  client      Client   @relation(fields: [clientId], references: [id])
  name        String
  color       String?
  createdAt   DateTime @default(now())
  deletedAt   DateTime?

  procedures  Procedure[]

  @@unique([clientId, name])
  @@index([clientId])
}

model Procedure {
  id              String   @id @default(cuid())
  organizationId  String
  clientId        String
  client          Client   @relation(fields: [clientId], references: [id])
  categoryId      String?
  category        ProcedureCategory? @relation(fields: [categoryId], references: [id])

  name            String
  description     String?  @db.Text
  price           Decimal  @db.Decimal(12, 2)
  cost            Decimal  @db.Decimal(12, 2)
  durationMinutes Int?
  isActive        Boolean  @default(true)

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?

  appointments    Appointment[]
  revenues        Revenue[]

  @@index([organizationId, clientId])
  @@index([clientId, isActive])
}

// =====================================================
// AGENDAMENTOS
// =====================================================

enum AppointmentStatus {
  SCHEDULED
  CONFIRMED
  ATTENDED
  NO_SHOW
  CANCELED
  RESCHEDULED
}

model Appointment {
  id              String   @id @default(cuid())
  organizationId  String
  clientId        String
  client          Client   @relation(fields: [clientId], references: [id])
  patientId       String
  patient         Patient  @relation(fields: [patientId], references: [id])
  procedureId     String
  procedure       Procedure @relation(fields: [procedureId], references: [id])

  scheduledAt     DateTime
  durationMinutes Int
  status          AppointmentStatus @default(SCHEDULED)
  confirmedAt     DateTime?
  attendedAt      DateTime?
  noShowAt        DateTime?
  canceledAt      DateTime?
  cancelReason    String?

  notes           String?  @db.Text

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  createdById     String?
  deletedAt       DateTime?

  revenue         Revenue?

  @@index([organizationId, clientId])
  @@index([clientId, scheduledAt])
  @@index([clientId, status])
}

// =====================================================
// FINANCEIRO
// =====================================================

enum CostType {
  FIXED
  VARIABLE
  MARKETING
  PAYROLL
  TAX
  OTHER
}

model Revenue {
  id              String   @id @default(cuid())
  organizationId  String
  clientId        String
  client          Client   @relation(fields: [clientId], references: [id])
  patientId       String?
  patient         Patient? @relation(fields: [patientId], references: [id])
  procedureId     String?
  procedure       Procedure? @relation(fields: [procedureId], references: [id])
  appointmentId   String?  @unique
  appointment     Appointment? @relation(fields: [appointmentId], references: [id])

  amount          Decimal  @db.Decimal(12, 2)
  date            DateTime
  description     String?
  paymentMethod   String?
  installments    Int?     @default(1)

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  createdById     String?
  deletedAt       DateTime?

  @@index([organizationId, clientId])
  @@index([clientId, date])
}

model Cost {
  id              String   @id @default(cuid())
  organizationId  String
  clientId        String
  client          Client   @relation(fields: [clientId], references: [id])
  campaignId      String?
  campaign        MarketingCampaign? @relation(fields: [campaignId], references: [id])

  type            CostType
  category        String?  // ex: "aluguel", "salário Maria"
  amount          Decimal  @db.Decimal(12, 2)
  date            DateTime
  description     String?
  isRecurring     Boolean  @default(false)
  recurringDay    Int?     // dia do mês para custos recorrentes

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  createdById     String?
  deletedAt       DateTime?

  @@index([organizationId, clientId])
  @@index([clientId, date])
  @@index([clientId, type])
}

// =====================================================
// METAS
// =====================================================

enum GoalMetric {
  REVENUE
  LEADS
  CONVERSION_RATE
  NO_SHOW_RATE
  AVERAGE_TICKET
  APPOINTMENTS
  NEW_PATIENTS
}

enum GoalPeriod {
  MONTHLY
  QUARTERLY
  YEARLY
}

model Goal {
  id              String   @id @default(cuid())
  organizationId  String
  clientId        String
  client          Client   @relation(fields: [clientId], references: [id])

  metric          GoalMetric
  period          GoalPeriod
  targetValue     Decimal  @db.Decimal(15, 2)
  startDate       DateTime
  endDate         DateTime
  notes           String?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?

  @@index([clientId, metric, period])
}

// =====================================================
// INSIGHTS
// =====================================================

enum InsightSeverity {
  INFO
  WARNING
  CRITICAL
}

enum InsightCategory {
  COMMERCIAL
  FINANCIAL
  OPERATIONAL
  RETENTION
  MARKETING
}

enum InsightStatus {
  OPEN
  ACKNOWLEDGED
  IN_PROGRESS
  RESOLVED
  DISMISSED
}

model Insight {
  id              String   @id @default(cuid())
  organizationId  String
  clientId        String
  client          Client   @relation(fields: [clientId], references: [id])

  ruleKey         String   // identificador da regra que gerou (ex: 'high_no_show')
  category        InsightCategory
  severity        InsightSeverity
  status          InsightStatus @default(OPEN)

  title           String
  diagnosis       String   @db.Text
  estimatedImpact Decimal? @db.Decimal(12, 2)
  suggestion      String   @db.Text
  metadata        Json?

  acknowledgedAt  DateTime?
  resolvedAt      DateTime?
  dismissedAt     DateTime?
  dismissReason   String?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([clientId, status])
  @@index([clientId, severity])
  @@index([clientId, createdAt])
}

// =====================================================
// ATIVIDADES E TAREFAS (interno do admin)
// =====================================================

enum ActivityType {
  TASK
  MEETING
  CALL
  EMAIL
  NOTE
}

enum ActivityStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  CANCELED
}

enum ActivityPriority {
  LOW
  MEDIUM
  HIGH
  URGENT
}

model Activity {
  id              String   @id @default(cuid())
  organizationId  String
  clientId        String?  // pode ser geral ou ligada a uma clínica
  client          Client?  @relation(fields: [clientId], references: [id])

  title           String
  description     String?  @db.Text
  type            ActivityType
  status          ActivityStatus @default(PENDING)
  priority        ActivityPriority @default(MEDIUM)
  dueDate         DateTime?
  completedAt     DateTime?

  assignedToId    String?
  assignedTo      User?    @relation(fields: [assignedToId], references: [id])

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  createdById     String?
  deletedAt       DateTime?

  @@index([organizationId, status])
  @@index([assignedToId, status])
  @@index([dueDate])
}

// =====================================================
// PIPELINE DO ADMIN (gestão das clínicas como clientes)
// =====================================================

enum DealStage {
  PROSPECT
  CONTACTED
  PROPOSAL_SENT
  NEGOTIATION
  WON
  LOST
}

model PipelineDeal {
  id              String   @id @default(cuid())
  organizationId  String
  clientId        String   // cada clínica = um deal no pipeline do admin
  client          Client   @relation(fields: [clientId], references: [id])

  stage           DealStage @default(PROSPECT)
  value           Decimal? @db.Decimal(12, 2) // valor do contrato mensal
  probability     Int?     // 0-100
  expectedCloseAt DateTime?
  wonAt           DateTime?
  lostAt          DateTime?
  lostReason      String?
  notes           String?  @db.Text

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?

  @@unique([clientId])
  @@index([organizationId, stage])
}

// =====================================================
// SNAPSHOTS DE KPI (cache para performance)
// =====================================================

model KpiSnapshot {
  id              String   @id @default(cuid())
  organizationId  String
  clientId        String
  client          Client   @relation(fields: [clientId], references: [id])

  periodType      String   // 'daily', 'monthly'
  periodStart     DateTime
  periodEnd       DateTime

  // Comerciais
  leadsCount      Int      @default(0)
  appointmentsCount Int    @default(0)
  attendedCount   Int      @default(0)
  noShowCount     Int      @default(0)
  conversionRate  Decimal? @db.Decimal(5, 4) // 0.0000 a 1.0000
  noShowRate      Decimal? @db.Decimal(5, 4)
  avgTimeToFirstContact Int? // em minutos

  // Financeiros
  totalRevenue    Decimal  @default(0) @db.Decimal(15, 2)
  totalCosts      Decimal  @default(0) @db.Decimal(15, 2)
  grossMargin     Decimal? @db.Decimal(5, 4)
  netMargin       Decimal? @db.Decimal(5, 4)
  averageTicket   Decimal? @db.Decimal(12, 2)
  marketingCost   Decimal  @default(0) @db.Decimal(15, 2)
  roi             Decimal? @db.Decimal(8, 4)
  cac             Decimal? @db.Decimal(12, 2)

  // Saúde
  healthScore     Int?     // 0-100

  computedAt      DateTime @default(now())

  @@unique([clientId, periodType, periodStart])
  @@index([organizationId, periodType, periodStart])
}

// =====================================================
// NOTIFICAÇÕES
// =====================================================

enum NotificationType {
  INSIGHT_GENERATED
  GOAL_AT_RISK
  GOAL_ACHIEVED
  ACTIVITY_DUE
  ACTIVITY_OVERDUE
  CLIENT_INACTIVE
  SYSTEM
}

model Notification {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  type        NotificationType
  title       String
  message     String   @db.Text
  link        String?
  metadata    Json?
  readAt      DateTime?
  createdAt   DateTime @default(now())

  @@index([userId, readAt])
  @@index([userId, createdAt])
}

// =====================================================
// AUDIT LOG
// =====================================================

model AuditLog {
  id              String   @id @default(cuid())
  organizationId  String
  organization    Organization @relation(fields: [organizationId], references: [id])
  userId          String?
  action          String   // 'create', 'update', 'delete', 'login', etc.
  entityType      String   // 'Lead', 'Revenue', etc.
  entityId        String?
  changes         Json?    // diff
  ipAddress       String?
  userAgent       String?
  createdAt       DateTime @default(now())

  @@index([organizationId, createdAt])
  @@index([entityType, entityId])
  @@index([userId])
}
```

### 4.3 Decisões críticas explicadas

- **Por que `organizationId` em quase tudo mesmo já tendo `clientId`?** Permite queries globais do admin sem precisar de join. Custa pouco em storage e dá ordens de magnitude em performance.
- **Por que `Decimal` e não `Float`?** Dinheiro nunca é float. Float quebra arredondamento.
- **Por que arrays Postgres em `tags`?** Queries com tags são raras e simples; criar tabela `Tag` + join seria over-engineering aqui.
- **Por que `KpiSnapshot`?** Calcular conversão de 12 meses cruzando Lead + Appointment + Revenue em runtime para 30 clínicas é inviável. Job noturno gera o snapshot.
- **Por que `PipelineStage` por cliente?** Cada clínica tem funil próprio. Hardcoded é armadilha.

---

## SEÇÃO 5 — MULTI-TENANCY E SEGURANÇA (REGRAS CRÍTICAS)

### 5.1 Modelo

- 1 `Organization` = workspace do admin (pode ter múltiplos admins/staff)
- 1 `Organization` tem N `Client` (clínicas)
- 1 `Client` tem N `User` (com role `CLIENT_OWNER` ou `CLIENT_STAFF`)

### 5.2 Camadas de proteção (defesa em profundidade)

**Camada 1 — Middleware Next.js**
- `/middleware.ts` valida sessão e injeta `organizationId` e role no header da request.
- Bloqueia acesso a `/admin/*` se role não for `ADMIN` ou `STAFF`.
- Bloqueia acesso a `/client/*` se role não for `CLIENT_*`.

**Camada 2 — Tenant Context Helper (server-side)**
```typescript
// src/server/tenant/context.ts
import { auth } from '@/server/auth'

export async function getTenantContext() {
  const session = await auth()
  if (!session?.user) throw new UnauthorizedError()

  return {
    userId: session.user.id,
    organizationId: session.user.organizationId,
    role: session.user.role,
    clientId: session.user.clientId, // null para ADMIN/STAFF
  }
}
```

**Camada 3 — Repository com tenant injection**
Toda função em `/server/repositories/*` recebe `tenantContext` como primeiro argumento e adiciona o filtro automaticamente:

```typescript
// src/server/repositories/leadRepository.ts
export async function listLeads(ctx: TenantContext, clientId: string) {
  // Se for CLIENT_*, força clientId do próprio user
  const effectiveClientId =
    ctx.role.startsWith('CLIENT_') ? ctx.clientId : clientId

  if (!effectiveClientId) throw new ForbiddenError()

  return prisma.lead.findMany({
    where: {
      organizationId: ctx.organizationId,
      clientId: effectiveClientId,
      deletedAt: null,
    },
  })
}
```

**Camada 4 — Supabase Row-Level Security (RLS)**
Como cinto + suspensório, ativar RLS no Postgres com policies por `organizationId`. Isso protege mesmo se houver bug na aplicação.

**Camada 5 — Audit Log**
Toda mutação grava em `AuditLog`. Tentativas de acesso cross-tenant viram alertas Sentry.

### 5.3 Regras de ouro

- ❌ **NUNCA** confiar em `clientId` vindo do client-side. Sempre validar contra `tenantContext.clientId`.
- ❌ **NUNCA** fazer `prisma.lead.findMany()` sem `where: { organizationId }`.
- ❌ **NUNCA** retornar `User.passwordHash` em qualquer endpoint.
- ✅ **SEMPRE** usar Zod no input de Server Actions.
- ✅ **SEMPRE** logar ações sensíveis (delete, mudança de permissão, login).

---

## SEÇÃO 6 — AUTENTICAÇÃO E AUTORIZAÇÃO

### 6.1 Fluxos

**Login Admin/Staff**
1. Email + senha → NextAuth Credentials Provider.
2. Sessão JWT com `userId, organizationId, role, clientId`.
3. Redirect para `/dashboard`.

**Onboarding de novo Client (clínica)**
1. Admin cria `Client` no sistema (sem usuário ainda).
2. Admin envia convite para email do dono da clínica → cria `Invitation`.
3. Email com link `/(auth)/accept-invite?token=...`.
4. Dono define senha → cria `User` com role `CLIENT_OWNER` vinculado ao `clientId`.
5. Redirect para `/dashboard` (área do cliente).

**Convite de funcionário**
- Mesmo fluxo, mas com role `STAFF` (admin) ou `CLIENT_STAFF` (clínica).

### 6.2 Permissões granulares

Tabela `UserPermission` define para cada `STAFF` o que pode fazer em cada módulo. Para `CLIENT_*` o controle é por role apenas (CLIENT_OWNER tem tudo dentro da clínica, CLIENT_STAFF tem permissões limitadas, configuráveis).

Helper `can(userId, module, action)` deve ser usado tanto no servidor (gate) quanto no client (esconder UI).

### 6.3 Recuperação de senha

- Endpoint `/forgot-password` envia email via Resend com token de uso único (1h de validade).

---

## SEÇÃO 7 — MÓDULOS FUNCIONAIS (ESPECIFICAÇÃO COMPLETA)

> Para cada módulo abaixo, entregar: rotas, componentes, server actions, queries, validações Zod, estados (loading/error/empty), e testes mínimos dos fluxos críticos.

### 7.1 Dashboard Global do Admin (`/dashboard`)

**Objetivo**: visão executiva consolidada de todas as clínicas.

**Filtros no topo**: período (Hoje / Semana / Mês / Trimestre / Customizado), clínicas (multi-select).

**Cards principais (KPIs agregados)**:
- Total de leads
- Total de faturamento (BRL)
- Crescimento MoM (%) com indicador up/down
- Conversão média
- No-show médio
- Receita perdida estimada (Σ no-show × ticket médio por clínica)
- Total de clínicas ativas
- Health Score médio

**Gráficos**:
- Linha: faturamento mensal últimos 12 meses (com comparação ano anterior)
- Barras horizontais: ranking de clientes por faturamento
- Pizza: % de receita por cliente
- Heatmap: leads por dia da semana × hora do dia (agregado)
- Lista: insights críticos abertos (top 5)

**Comparativo de clínicas**: tabela ordenável com colunas (Clínica, Leads, Conversão, No-show, Receita, Margem, Health, Status, Última atualização).

**Empty state**: se não há clínicas, CTA "Cadastrar primeira clínica".

### 7.2 Gestão de Clientes — Clínicas (`/clients`)

**Visão**: cards em grid (responsivo: 1/2/3 colunas).

**Cada card**:
- Nome, cidade, status (badge colorido)
- Avatar/iniciais
- Faturamento do mês (com Δ vs mês anterior)
- Leads do mês
- Conversão %
- No-show %
- Margem líquida %
- Health Score (anel circular 0-100, cor por faixa)
- Botões: "Ver dashboard", menu (Editar, Convidar usuário, Desativar, Excluir)

**Filtros e busca**: status, cidade, ordenação (faturamento, health, leads).

**Modal "Novo cliente"**:
- Form com Zod: nome (obrigatório), slug (auto), cidade, estado, telefone, email, mensalidade, data início contrato, observações
- Após criar: redireciona para o onboarding wizard (Seção 7.20)

**Soft delete**: marca `deletedAt`, esconde da listagem, mas dados ficam para histórico.

### 7.3 Dashboard Individual da Clínica (`/clients/[id]/overview`)

**Header da página**: nome da clínica, status, health score grande, seletor de período.

**Cards de KPI** (com mini-gráfico sparkline em cada):
- Leads totais
- Agendamentos
- Comparecimento
- No-show (com alerta se > 25%)
- Conversão (lead → venda)
- Faturamento bruto
- Custos totais
- Lucro líquido
- Ticket médio
- Margem bruta
- Margem líquida
- ROI marketing
- CAC
- LTV (estimado: ticket médio × frequência média de retorno × tempo médio de vida)
- Tempo médio até primeiro contato (lead → resposta)
- Taxa de retenção (pacientes que voltaram nos últimos 90 dias)

**Seções**:
- **Insights ativos** (cards coloridos por severidade)
- **Progresso de metas** (barras com % atingido)
- **Funil de conversão** (gráfico de funil: Leads → Agendados → Comparecidos → Vendidos)
- **Receita por procedimento** (barras + tabela)
- **Origem dos leads** (pizza)
- **Comparação com benchmark** (vs média da própria base de clínicas, anonimizado)
- **Atividades pendentes** ligadas a esta clínica
- **Últimas interações** (timeline)

### 7.4 CRM da Clínica — uso pelo Admin (`/clients/[id]/crm`)

Visão administrativa do funil interno da clínica.

### 7.5 CRM do Cliente (`/(client)/crm`)

**Esta é a tela onde o dono/funcionário da clínica gerencia leads dela mesma.** Crítica para o produto.

**Visão Kanban**:
- Colunas = `PipelineStage` configuráveis pela clínica
- Cards de Lead com: nome, telefone, procedimento de interesse, origem (badge), tempo no estágio, responsável (avatar), valor estimado
- Drag & drop entre colunas → move estágio + grava `LeadInteraction` tipo `stage_change`
- Quando movido para estágio `isWon`: abrir modal pedindo dados de conversão (procedimento real, valor, data) → cria `Patient` + `Revenue` automaticamente
- Quando movido para `isLost`: pedir motivo

**Visão Lista** (alternativa): tabela com filtros, ordenação, busca, ações em massa.

**Detalhes do Lead** (drawer lateral):
- Dados do lead
- Timeline de interações (notas, mudanças de estágio, ligações)
- Adicionar nota
- Editar dados
- Atribuir responsável
- Marcar como ganho/perdido
- Histórico de tentativas de contato
- Tags

**Criar lead** (modal):
- Nome, telefone, email, origem, campanha, procedimento de interesse, valor estimado, responsável, tags
- Opção "criar como agendamento já" → atalho para criar `Appointment` ligado

**Configuração de funil** (settings da clínica):
- CRUD de `PipelineStage` (nome, ordem, cor, marcar como won/lost)

### 7.6 Módulo Financeiro (`/clients/[id]/financial` e `/(client)/financial`)

**Abas**: Visão Geral | Receitas | Custos | Procedimentos | Relatórios

**Visão Geral**:
- Cards: Receita do mês, Custos do mês, Lucro, Margem, Comparação com mês anterior
- Gráfico: Receita vs Custos últimos 12 meses (barras agrupadas)
- Tabela: Top 5 procedimentos por receita
- Tabela: Top 5 categorias de custo

**Receitas**:
- Tabela com filtros (período, procedimento, paciente, método de pagamento)
- Adicionar receita manual (form: valor, data, paciente, procedimento, método, parcelas)
- Importar CSV (mapeamento de colunas)
- Edição inline
- Vinculação automática a Appointment se houver

**Custos**:
- Tabela similar
- Tipos: FIXED, VARIABLE, MARKETING, PAYROLL, TAX, OTHER
- Custos recorrentes: cadastrar uma vez, sistema gera automaticamente todo mês

**Procedimentos**:
- CRUD com categorias
- Cada procedimento mostra: preço, custo, margem (%), receita gerada últimos 90d, qty vendida
- **Sugestão de precificação** (insight): se margem < 30%, sugere aumento; se procedimento tem alta demanda e margem alta, sugere manter ou aumentar preço

**Relatórios**:
- DRE simplificado (Receita - Custos = Resultado)
- Exportar PDF/CSV

### 7.7 Pacientes (`/clients/[id]/patients`)

- Tabela com busca, filtros, tags
- Cada paciente: histórico de agendamentos, receita total gerada, último atendimento, frequência média
- KPI de retenção: % de pacientes que voltaram nos últimos 90/180/365 dias

### 7.8 Agendamentos (`/clients/[id]/appointments` e cliente)

- Calendário FullCalendar (mês/semana/dia)
- Criar agendamento: paciente (autocomplete ou criar novo), procedimento, horário, duração
- Estados: SCHEDULED → CONFIRMED → ATTENDED ou NO_SHOW / CANCELED / RESCHEDULED
- Botão rápido na visão dia: "Confirmar", "Compareceu", "Faltou"
- **Trigger automático**: ao marcar ATTENDED, oferecer criar Revenue vinculada

### 7.9 CRM do Admin — Pipeline de clínicas como clientes (`/pipeline`)

Kanban de `PipelineDeal`. Cada card representa uma clínica em prospecção/conversão.

Estágios: PROSPECT → CONTACTED → PROPOSAL_SENT → NEGOTIATION → WON / LOST.

Quando WON: cria `Client` automaticamente e dispara onboarding.

### 7.10 Atividades & Tarefas (`/activities`)

- Lista filtrável (status, prioridade, responsável, clínica vinculada)
- Visões: Hoje | Esta semana | Atrasadas | Todas
- Quick-add (input no topo)
- Notificações in-app + email para tarefas urgentes ou atrasadas

### 7.11 Calendário (`/calendar`)

- Unifica: atividades, agendamentos das clínicas (admin vê todos), reuniões
- Filtros por clínica, tipo, responsável

### 7.12 Motor de Insights (engine + UI)

**Arquitetura**:
- `/server/services/insights/rules/` → cada regra é um arquivo
- `IInsightRule` interface: `key, evaluate(clientId, period) → InsightResult | null`
- `engine.ts` percorre regras, gera/atualiza/resolve insights

**Regras obrigatórias no MVP**:

| Key | Categoria | Severidade | Condição | Diagnóstico | Sugestão |
|---|---|---|---|---|---|
| `high_no_show` | OPERATIONAL | CRITICAL | no-show > 25% nos últimos 30d | Taxa de faltas crítica | Implementar confirmação WhatsApp 24h antes |
| `low_conversion` | COMMERCIAL | WARNING | conversão < 10% nos últimos 30d | Funil comercial fraco | Revisar abordagem, treinar atendimento |
| `low_margin` | FINANCIAL | WARNING | margem líquida < 20% | Lucratividade baixa | Auditar custos, reprecificar procedimentos |
| `revenue_drop` | FINANCIAL | CRITICAL | receita caiu > 20% MoM | Queda significativa | Investigar perda de pacientes, revisar marketing |
| `no_leads_7d` | MARKETING | WARNING | 0 leads novos em 7 dias | Funil seco | Verificar campanhas ativas |
| `slow_first_contact` | COMMERCIAL | WARNING | tempo médio até 1º contato > 60min | Lead esfriando | Implementar resposta automática |
| `procedure_concentration` | OPERATIONAL | INFO | 1 procedimento > 60% da receita | Risco de concentração | Diversificar oferta |
| `inactive_patients` | RETENTION | WARNING | retenção 90d < 20% | Baixa fidelização | Programa de retorno, lembretes |
| `goal_at_risk` | OPERATIONAL | WARNING | meta com < 50% atingido faltando 7d do fim | Meta em risco | Acelerar ações |
| `high_marketing_low_roi` | MARKETING | WARNING | gasto marketing > X e ROI < 1 | Marketing ineficiente | Revisar campanhas, pausar piores |

**Estados do Insight**: OPEN → ACKNOWLEDGED → IN_PROGRESS → RESOLVED (ou DISMISSED com motivo).

**Output esperado** (JSON exemplo):
```json
{
  "ruleKey": "high_no_show",
  "category": "OPERATIONAL",
  "severity": "CRITICAL",
  "title": "Taxa de no-show acima do crítico",
  "diagnosis": "Sua clínica registrou 32% de faltas nos últimos 30 dias, contra a média saudável de até 15%.",
  "estimatedImpact": 8200.00,
  "suggestion": "Ative confirmação automática via WhatsApp 24h antes do agendamento e exija sinal/cadastro de cartão para reservar horário."
}
```

**Execução**:
- Job diário (Vercel Cron) roda engine para todas as clínicas
- Geração manual via botão "Recalcular insights"
- Insight novo → cria `Notification` para usuários relevantes

### 7.13 Sistema de Metas (`/goals` dentro de cada clínica)

- CRUD de `Goal` por clínica
- Métricas: REVENUE, LEADS, CONVERSION_RATE, NO_SHOW_RATE, AVERAGE_TICKET, APPOINTMENTS, NEW_PATIENTS
- Períodos: MONTHLY, QUARTERLY, YEARLY
- Visualização: barra de progresso + projeção (dado o ritmo atual, vai bater em X dias)
- Trigger insight `goal_at_risk` quando aplicável

### 7.14 Health Score (calculado)

Score 0-100 ponderado:
- Conversão (peso 25%): score = min(100, conversao_pct × 5)
- No-show invertido (peso 20%): score = max(0, 100 - no_show_pct × 4)
- Margem líquida (peso 20%): score = min(100, margem_pct × 2.5)
- Crescimento MoM receita (peso 15%): score = clamp((growth_pct + 20) × 2.5, 0, 100)
- Volume de leads vs meta (peso 10%): % atingimento, capped 100
- Tempo médio resposta a lead (peso 10%): inversamente proporcional

Faixas de cor: 0-40 vermelho | 41-60 amarelo | 61-80 azul | 81-100 verde.

Atualizado pelo job de snapshot.

### 7.15 Relatórios e Exports (`/reports` e dentro de cada clínica)

- Relatório mensal por clínica (PDF gerado): KPIs, gráficos, insights, metas
- Export CSV de qualquer tabela (leads, receitas, custos, agendamentos)
- Agendamento de envio automático: relatório PDF mensal por email para o cliente

### 7.16 Notificações

- Sino no topbar com contador de não lidas
- Drawer lateral com lista
- Marcar como lida individual ou tudo
- Tipos: INSIGHT_GENERATED, GOAL_AT_RISK, GOAL_ACHIEVED, ACTIVITY_DUE, ACTIVITY_OVERDUE, CLIENT_INACTIVE, SYSTEM
- Email para tipos críticos (config por usuário)

### 7.17 Audit Log (`/settings/audit`)

- Visível só para ADMIN
- Tabela cronológica com filtros (usuário, ação, entidade, período)
- Exportável

### 7.18 Configurações (`/settings`)

**Da organização**: nome, logo, locale, timezone (default `America/Sao_Paulo`)

**Do usuário**: nome, email, senha, foto, preferências de notificação

**Da clínica** (lado admin): dados, funil customizado, configurações de notificação para o cliente

### 7.19 Funcionários (`/staff`)

- Lista de `User` com role `STAFF`
- Convidar novo (form: email, role, permissões iniciais)
- Editar permissões por módulo (matriz: módulo × read/write/delete)
- Desativar (não excluir)

### 7.20 Onboarding de nova clínica (Wizard pós-criação)

5 passos:
1. **Dados básicos** (já preenchidos da criação, confirmar)
2. **Convidar dono da clínica** (email)
3. **Cadastrar procedimentos iniciais** (mínimo 3, com preço e custo)
4. **Configurar funil** (usar template ou customizar)
5. **Definir metas iniciais** (opcional)

Checklist visível no dashboard da clínica até completar.

### 7.21 Camada de Integrações (estrutura preparada)

- `/server/integrations/{whatsapp,metaAds,googleAds}/`
- Interface `IIntegrationProvider` com métodos abstratos
- Implementação MVP: `MockProvider` que retorna dados realistas
- Implementação produção: trocar por `RealProvider` sem alterar código consumidor (Strategy/Adapter)
- Endpoint `/api/webhooks/[provider]` preparado para receber callbacks
- Feature flags via env

---

## SEÇÃO 8 — KPIs: FÓRMULAS DEFINITIVAS

| KPI | Fórmula | Observações |
|---|---|---|
| Conversão | (vendas / leads) × 100 | "venda" = lead com `closedAt` em estágio `isWon` |
| No-show | (faltas / agendamentos) × 100 | considera apenas appointments do período |
| Receita perdida (no-show) | no_show_count × ticket_médio | aproximação |
| Ticket médio | total_revenue / count_revenues | ou Σ revenue / Σ vendas |
| Margem bruta % | ((receita - custos_variáveis) / receita) × 100 | custos VARIABLE + MARKETING |
| Margem líquida % | ((receita - custos_totais) / receita) × 100 | todos os custos |
| ROI marketing | ((receita_atribuída - custo_marketing) / custo_marketing) × 100 | atribuição via campanha do lead |
| CAC | custo_marketing / novos_pacientes | período |
| LTV | ticket_médio × frequência_média × vida_média | aproximação inicial |
| Crescimento MoM | ((mes_atual - mes_anterior) / mes_anterior) × 100 | |
| Tempo até 1º contato | média de (firstContactAt - createdAt) em minutos | só leads com firstContactAt |
| Retenção 90d | pacientes_que_voltaram_em_90d / total_pacientes_ativos | |
| Taxa de comparecimento | comparecimentos / agendamentos × 100 | |

**Regras de borda obrigatórias**:
- Divisão por zero → retornar `null`, exibir `—` na UI
- Períodos sem dado → exibir empty state, não exibir 0% (engana)
- Datas comparativas considerar fuso horário local da clínica

---

## SEÇÃO 9 — REGRAS DE NEGÓCIO CRÍTICAS

1. **Lead não pode ser excluído permanentemente** se virou Patient (apenas soft delete).
2. **Revenue só pode ser editada nos primeiros 7 dias**; após isso, requer permissão especial.
3. **Funil mínimo**: toda clínica nasce com 4 estágios padrão (Lead, Agendado, Compareceu, Fechado). Não permitir clínica sem nenhum estágio.
4. **Procedimento com preço < custo** → não bloquear, mas exibir warning visual e gerar insight.
5. **Cliente desativado** → seus usuários não conseguem logar, mas dados ficam preservados.
6. **Ao mover lead para estágio `isWon`**: forçar criação de Patient (se não existe) e Revenue.
7. **Ao deletar Patient**: também soft-deleta Leads e Appointments associados.
8. **Convite expira em 7 dias**.
9. **CLIENT_OWNER não pode convidar outro CLIENT_OWNER**, apenas CLIENT_STAFF.
10. **STAFF não pode editar próprias permissões.**

---

## SEÇÃO 10 — UI/UX (DECISÕES ESPECÍFICAS, NÃO VAGAS)

### 10.1 Layout

- **Sidebar fixa esquerda** (collapsible em mobile), 240px expandida / 64px colapsada
- **Topbar** com: breadcrumb, busca global (Cmd+K), notificações (sino), avatar/menu user
- **Área principal**: max-width 1440px, padding 32px desktop / 16px mobile

### 10.2 Design tokens (Tailwind)

- **Fonte**: `Inter` (Google Fonts)
- **Cores semânticas** (em `tailwind.config.ts`):
  - primary: emerald-600 (saúde/finanças)
  - success: green-600
  - warning: amber-500
  - critical: red-600
  - info: blue-500
  - neutral: zinc
- **Dark mode**: suportar via `next-themes`, com toggle nas settings
- **Border radius padrão**: `rounded-lg` (8px)
- **Sombras**: usar `shadow-sm` por padrão, evitar exageros

### 10.3 Componentes obrigatórios (shadcn)

`Button, Input, Select, Dialog, Sheet (drawer), Card, Badge, Tabs, Table, Toast (sonner), Tooltip, Popover, Calendar, Command (Cmd+K), Avatar, DropdownMenu, Form, Skeleton, Alert, Separator, ScrollArea, Progress`

### 10.4 Estados obrigatórios em toda lista/dashboard

- **Loading**: skeleton, nunca spinner solto
- **Empty**: ilustração simples + mensagem clara + CTA
- **Error**: mensagem amigável + botão retry + log no Sentry
- **Success após ação**: toast (sonner)

### 10.5 Acessibilidade

- Todos os ícones interativos com `aria-label`
- Contraste mínimo WCAG AA
- Navegação por teclado em todos os fluxos críticos
- `<form>` com labels associadas

### 10.6 Responsividade

- Mobile-first nas telas operacionais (CRM mobile = importante)
- Breakpoints Tailwind: sm 640 / md 768 / lg 1024 / xl 1280
- Tabelas em mobile viram cards empilhados

### 10.7 Microinterações

- Hover states sutis (translate-y, shadow leve)
- Transições 150-200ms
- Drag & drop com feedback visual claro (placeholder, opacity)

### 10.8 Locale

- Datas: `dd/MM/yyyy` ou relativas ("há 2 horas")
- Moeda: `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`
- Números: separador `.` para milhar, `,` para decimal
- Timezone: converter UTC → `America/Sao_Paulo` na borda da UI

---

## SEÇÃO 11 — QUALIDADE, OBSERVABILIDADE E CONFIABILIDADE

### 11.1 Tratamento de erros

- Classes de erro tipadas: `AppError, ValidationError, UnauthorizedError, ForbiddenError, NotFoundError, ConflictError`
- Server Actions retornam `{ success: true, data } | { success: false, error: { code, message, fields? } }`
- Error Boundary em cada layout de grupo de rotas
- `error.tsx` global

### 11.2 Logs estruturados

- `lib/logger.ts` wrapper sobre console
- Formato JSON: `{ timestamp, level, message, userId, organizationId, requestId, ...meta }`
- Sentry captura tudo nível `error`

### 11.3 Performance

- `KpiSnapshot` job noturno (Vercel Cron) — fonte para dashboards
- Dashboards: cache via React Query com `staleTime: 60s` mínimo
- Imagens via `next/image`
- Code splitting natural do App Router
- Evitar N+1: sempre `include` ou `select` explícito no Prisma

### 11.4 Validação

- **Toda** entrada do usuário valida com Zod
- Schemas em `/types/schemas/` reutilizados client + server
- `react-hook-form` com `zodResolver`

### 11.5 Testes (mínimo MVP)

- **Unit (Vitest)**: services puros (cálculo de KPI, regras de insight, health score)
- **E2E (Playwright)**: fluxos críticos = login admin, criar cliente, convidar usuário, criar lead, mover funil, registrar receita, ver insight gerado
- Coverage não é obrigatório, mas os fluxos acima sim

### 11.6 LGPD

- Aviso de cookies básico
- Página de política de privacidade (placeholder ok no MVP)
- Endpoint para exportação de dados do usuário
- Soft delete de tudo permite "esquecimento" formal

### 11.7 Backup

- Supabase backup automático (configurar)
- Documentar processo de restore

---

## SEÇÃO 12 — SEED DE DADOS (`prisma/seed.ts`)

Criar dados realistas que permitam ver TODAS as funcionalidades:

- 1 Organization "KPI Clinic OS Demo"
- 1 User ADMIN (`admin@demo.com` / senha: `admin123`)
- 1 User STAFF (`staff@demo.com` / `staff123`)
- **3 Clients (clínicas)** com perfis distintos:
  - **"Clínica Bela Vita"** (SP) — clínica saudável: boa conversão, baixa no-show, margem ok
  - **"Estética Renove"** (RJ) — clínica problemática: alta no-show, baixa margem (gera insights críticos)
  - **"Beauty Pro"** (BH) — clínica em crescimento: muitos leads, conversão melhorando
- Para cada clínica:
  - 1 CLIENT_OWNER (`owner@belavita.com` etc / `client123`)
  - 4 PipelineStages padrão
  - 5-8 Procedures em 2-3 categorias
  - 2 MarketingCampaigns
  - 30-50 Leads distribuídos pelos estágios, ao longo dos últimos 90 dias
  - 15-30 Patients
  - 40-80 Appointments (alguns ATTENDED, alguns NO_SHOW)
  - 30-60 Revenues
  - 10-20 Costs (recorrentes + variáveis)
  - 2-3 Goals
  - Disparar engine de insights ao final para gerar insights iniciais
- Algumas Activities e Notifications para popular UI

Comando: `npm run db:seed` (definido em `package.json` e `prisma.seed`).

---

## SEÇÃO 13 — DEPLOY

### 13.1 Setup inicial

1. Criar projeto Supabase, copiar URLs e keys
2. Rodar `prisma migrate deploy`
3. Rodar seed
4. Configurar RLS no Supabase (script SQL em `/prisma/rls.sql`)
5. Deploy Vercel: conectar repo, adicionar env vars, primeira deploy
6. Configurar Vercel Cron para jobs:
   - `/api/cron/snapshots` — diário 03:00 BRT
   - `/api/cron/insights` — diário 04:00 BRT
   - `/api/cron/notifications` — diário 08:00 BRT (resumo)
7. Configurar domínio custom + SSL (auto Vercel)

### 13.2 Checklist pré-produção

- [ ] Build sem warnings
- [ ] ESLint zero erros
- [ ] TypeScript zero erros
- [ ] Todas envs configuradas
- [ ] Sentry recebendo eventos teste
- [ ] Email teste enviado e recebido
- [ ] Login funciona em produção
- [ ] RLS ativo e testado (tentar acessar dado de outro tenant via SQL deve falhar)
- [ ] Backup Supabase ativo
- [ ] Robots.txt e meta básico

---

## SEÇÃO 14 — PLANO DE EXECUÇÃO POR FASES (CRÍTICO!)

**Não tente fazer tudo de uma vez.** Execute fase por fase, ao final de cada uma gere relatório, peça validação, e só então prossiga.

### Fase 0 — Setup (entrega: projeto rodando vazio)
- Init Next.js + TypeScript + Tailwind + shadcn
- ESLint, Prettier, Husky
- Estrutura de pastas
- `.env.example` + validação Zod
- Prisma init + connection
- NextAuth básico
- Layout shell (sidebar + topbar) com componentes shadcn
- Deploy inicial Vercel funcionando
- **Aceite**: `npm run dev` funciona, login fake redireciona, layout aparece

### Fase 1 — Auth + Multi-tenant (entrega: login funcional, isolamento)
- Schema Prisma: User, Organization, Client, Account, Session, Invitation, UserPermission
- Migration + seed mínimo (1 org, 1 admin)
- NextAuth Credentials + Supabase adapter
- Middleware de proteção de rotas
- Tenant Context helper
- Repository base
- Telas: login, accept-invite, esqueci senha
- Logout
- **Aceite**: admin loga, vê dashboard vazio, é redirecionado se acessa rota errada

### Fase 2 — Gestão de Clientes (entrega: CRUD de clínicas)
- Schema Client completo + ProcedureCategory + Procedure
- Tela /clients (cards) + criar/editar/desativar
- Wizard de onboarding básico
- Convite de CLIENT_OWNER por email (Resend)
- Login do CLIENT_OWNER → vai para área dele (dashboard vazio)
- **Aceite**: admin cria clínica, convida dono, dono loga, vê área isolada

### Fase 3 — CRM (entrega: pipeline funcionando)
- Schema: PipelineStage, Lead, LeadInteraction, MarketingCampaign
- Funil padrão criado no onboarding
- Kanban com drag & drop
- CRUD de leads
- Drawer de detalhes com timeline
- Configuração de funil
- Visão admin do CRM da clínica
- **Aceite**: criar lead, mover entre estágios, registrar interação, ganhar/perder

### Fase 4 — Pacientes + Agendamentos (entrega: operação clínica)
- Schema: Patient, Appointment
- CRUD de pacientes
- Calendário FullCalendar
- Criar/editar/cancelar agendamentos
- Estados (confirmar, comparecer, faltar)
- Conversão Lead → Patient automática
- **Aceite**: agenda funcional, transição de estados completa

### Fase 5 — Financeiro (entrega: receitas e custos)
- Schema: Revenue, Cost
- CRUD receitas
- CRUD custos (incluindo recorrentes)
- Cálculo automático de margens
- Aba procedimentos com sugestão de preço
- Import CSV
- **Aceite**: cadastrar receita, custo, ver DRE, exportar

### Fase 6 — Dashboards + KPIs (entrega: visualização)
- Services de cálculo de KPI (puros, testáveis)
- Schema: KpiSnapshot
- Job de snapshot diário
- Dashboard global do admin
- Dashboard individual da clínica
- Dashboard do cliente (visão dele)
- Gráficos Recharts
- Filtros de período
- **Aceite**: KPIs corretos, gráficos renderizando, filtros funcionando

### Fase 7 — Insights + Health Score + Metas (entrega: inteligência)
- Schema: Insight, Goal
- Engine de insights com 10 regras
- Cálculo de Health Score
- CRUD de metas + progresso
- UI de insights (cards por severidade, ações)
- Job diário de insights
- **Aceite**: dados ruins geram insights certos, health score atualiza, metas mostram progresso

### Fase 8 — Atividades + Calendário + Notificações (entrega: produtividade)
- Schema: Activity, Notification
- CRUD atividades
- Calendário unificado
- Sistema de notificações in-app + email
- Sino com badge
- **Aceite**: criar tarefa, receber notificação, ver no calendário

### Fase 9 — Relatórios + Exports + Audit (entrega: governança)
- PDF de relatório mensal por clínica (usar `@react-pdf/renderer` ou similar)
- Export CSV em todas as tabelas
- Audit log + tela de visualização
- Envio agendado de relatórios por email
- **Aceite**: gerar PDF, exportar CSV, ver audit log

### Fase 10 — Funcionários + Permissões + Settings (entrega: governança interna)
- CRUD STAFF + matriz de permissões
- Settings da org, do user, da clínica
- Pipeline do admin (PipelineDeal)
- Estrutura de integrações (mock providers)
- **Aceite**: adicionar staff com permissões limitadas, settings salvam

### Fase 11 — Polimento + Testes + Deploy final (entrega: produção)
- Testes unit dos services críticos
- E2E Playwright dos fluxos principais
- Performance audit (Lighthouse > 90)
- Acessibilidade audit
- LGPD: política, consentimento cookies
- RLS Supabase ativado e validado
- Deploy produção + custom domain
- **Aceite**: sistema usável por usuários reais, cumpre tudo do prompt

---

## SEÇÃO 15 — CRITÉRIOS DE ACEITAÇÃO GLOBAIS

Ao final de **toda** fase, validar:

- ✅ `npm run build` passa sem erros nem warnings
- ✅ `npm run lint` zero erros
- ✅ TypeScript strict zero erros
- ✅ Sem `any` não justificado
- ✅ Sem `console.log` esquecido (usar logger)
- ✅ Toda mutação tem validação Zod
- ✅ Toda query respeita tenant
- ✅ Loading + Empty + Error states presentes
- ✅ Mobile responsivo testado
- ✅ Deploy preview Vercel funcionando

---

## SEÇÃO 16 — APÊNDICE

### 16.1 Glossário de domínio

- **Clínica / Client**: cliente do admin, uma unidade de negócio
- **Lead**: pessoa que demonstrou interesse, ainda não é paciente
- **Paciente / Patient**: pessoa que efetivamente fez ao menos 1 procedimento
- **Agendamento / Appointment**: horário marcado entre paciente e clínica
- **Conversão**: lead → venda fechada
- **No-show**: paciente que não compareceu ao agendamento confirmado
- **Funil / Pipeline**: sequência de estágios pelos quais o lead passa
- **CAC**: Custo de Aquisição de Cliente
- **LTV**: Lifetime Value
- **MoM**: Month over Month
- **Health Score**: nota composta de saúde do negócio da clínica

### 16.2 Decisões antifurada (anti-pattern guard)

- ❌ Não use `Float` para dinheiro
- ❌ Não confie em `clientId` vindo do client
- ❌ Não calcule KPI no frontend a partir de dados brutos
- ❌ Não delete fisicamente nada com valor de negócio
- ❌ Não use `useEffect` para fetch (use React Query)
- ❌ Não chame `prisma` direto em componente
- ❌ Não esqueça de `where: { deletedAt: null }`
- ❌ Não exponha `passwordHash` em nenhum endpoint
- ❌ Não hardcode strings de UI (preparar i18n estrutural mesmo só com pt-BR)
- ❌ Não comite `.env`

### 16.3 Quando perguntar ao usuário (em vez de assumir)

- Visual identity: cores específicas, logo, fonte secundária
- Conteúdo de emails (templates)
- Política de retenção de dados
- Limites de plano (se houver tiers)
- Webhook secrets das integrações reais
- Domínio final de produção

### 16.4 Anti-escopo (NÃO fazer no MVP, deixar documentado para v2)

- App mobile nativo
- Integração real WhatsApp/Meta/Google (manter mocks)
- IA generativa para sugestões textuais
- Multi-idioma além de pt-BR
- Marketplace de templates de funil
- White-label
- Stripe billing para clínicas pagarem o admin
- Chat interno entre admin e cliente (deixar campo "notas" por enquanto)

---

## ⚡ INSTRUÇÃO FINAL DE EXECUÇÃO

1. **Comece pela Fase 0.** Não pule.
2. **Ao completar cada fase**, gere um relatório com:
   - O que foi entregue (lista de arquivos criados/modificados)
   - Como testar (passos manuais e/ou comando de teste)
   - Decisões técnicas tomadas e justificativas
   - Pendências e riscos identificados
   - Próxima fase: o que vai precisar do usuário antes de começar
3. **Pare e aguarde validação** antes de iniciar a próxima fase.
4. Se em qualquer momento o prompt for ambíguo: **pergunte, não invente.**
5. Se alguma decisão de stack do prompt entrar em conflito com restrição de ambiente: **avise, não substitua silenciosamente.**

**Comece agora pela Fase 0.**
