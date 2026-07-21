'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { PipelineCategory, PipelineKind } from '@prisma/client'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ArrowRightLeft,
  Calendar,
  CheckSquare,
  Download,
  FileText,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Plus,
  Send,
  Star,
  ThumbsDown,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { ClinicActivityCard } from '@/components/clinic/activities/clinic-activity-card'
import { ClinicCreateActivityDialog } from '@/components/clinic/activities/clinic-create-activity-dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ActionButton } from '@/components/ui/action-button'
import { Dialog, DialogOverlay, DialogPortal } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getCardActivitiesAction } from '@/domains/clinic/activities/activity-actions'
import { createClinicNoteAction, deleteClinicNoteAction } from '@/domains/clinic/notes/note-actions'
import {
  deleteCardDocumentAction,
  getCardDocumentsAction,
  getDocumentDownloadUrlAction,
  uploadCardDocumentAction,
} from '@/domains/clinic/documents/document-actions'
import { cn, getInitials } from '@/lib/utils'
import { STATUS_COLORS, STATUS_LABELS } from '@/modules/appointments/types'
import {
  addInteractionAction,
  deleteLeadAction,
  getLeadAction,
  loseLeadAction,
  reassignLeadAction,
} from '@/server/actions/lead-actions'
import { deletePatientAction } from '@/server/actions/patient-actions'
import { getClientCardAction } from '@/server/actions/client-card-actions'
import { MoveLeadPipelineDialog } from '@/modules/crm/move-lead-pipeline-dialog'
import { EditPatientDialog } from '@/modules/patients/edit-patient-dialog'
import {
  INTERACTION_LABELS,
  SOURCE_LABELS,
  type KanbanStage,
  type PipelineMoveTarget,
} from '@/modules/crm/types'
import type { ActivityView } from '@/components/shared/activities/types'

/**
 * Card unificado do cliente — redesign Funil (handoff §9–§13): DRAWER lateral
 * direito de 520px com abas underline (Info · Atividades · Anotações ·
 * Documentos). Adaptativo: representa um LEAD (card comercial) ou um PACIENTE
 * (retenção / aba pacientes), sempre com as MESMAS abas e ações. Aba
 * Atividades reusa o backend de atividade orientada a cliente (item 1).
 */
export type ClientCardSubject =
  | {
      type: 'lead'
      id: string
      stages: KanbanStage[]
      pipelineKind: PipelineKind
      // "Mover para funil": categoria/origem do funil atual + lista de destinos.
      pipelineId: string
      pipelineCategory: PipelineCategory
      pipelines: PipelineMoveTarget[]
    }
  | { type: 'patient'; id: string }

type LeadDetail = {
  id: string
  name: string
  phone: string | null
  email: string | null
  source: string
  procedureInterest: string | null
  estimatedValue: number | null
  notes: string | null
  assignedToId: string | null
  stage: { id: string; name: string; color: string | null; isWon: boolean; isLost: boolean }
  interactions: Array<{ id: string; type: string; content: string; createdAt: Date }>
}

type PatientDetail = {
  id: string
  name: string
  phone: string | null
  email: string | null
  birthDate: Date | null
  cpf: string | null
  notes: string | null
  tags: string[]
  firstVisitAt: Date | null
  lastVisitAt: Date | null
  createdAt: Date
  appointments: Array<{
    id: string
    scheduledAt: Date
    status: string
    durationMinutes: number
    procedure: { id: string; name: string }
  }>
  _count: { appointments: number }
}

type CardNote = {
  id: string
  content: string
  createdAt: Date
  author: { id: string; name: string } | null
}

type CardDoc = {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  createdAt: Date
  uploader: { id: string; name: string } | null
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

// Cor do dot da timeline por TIPO de interação (handoff §11.3 — paleta
// literal de categoria, não tokens do tema; igual às cores de etapa §7.2).
const INTERACTION_DOT: Record<string, string> = {
  NOTE: 'hsl(32 80% 40%)',
  CALL: 'hsl(217 75% 50%)',
  WHATSAPP: 'hsl(142 52% 38%)',
  EMAIL: 'hsl(190 68% 36%)',
  MEETING: 'hsl(262 48% 56%)',
  WON: 'hsl(142 52% 38%)',
  LOST: 'hsl(0 72% 55%)',
}

/** Label overline de seção (handoff §10.3): 11px/600 uppercase. */
function Overline({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
      {children}
    </p>
  )
}

/** Empty state composto (handoff §11.4/§12.3/§13.3). */
function EmptyState({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ElementType
  title: string
  text: string
}) {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-border px-5 py-9 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="-mt-1.5 text-[12.5px] text-muted-foreground">{text}</p>
    </div>
  )
}

/** Skeleton do corpo do drawer (design.md §5 — shimmer no lugar de spinner). */
function DrawerSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="senno-shimmer h-4 w-2/3 rounded" />
      <div className="senno-shimmer h-4 w-1/2 rounded" />
      <div className="senno-shimmer h-24 w-full rounded-[10px]" />
      <div className="senno-shimmer h-4 w-3/5 rounded" />
      <div className="senno-shimmer h-16 w-full rounded-[10px]" />
    </div>
  )
}

type Props = {
  open: boolean
  clientId: string
  subject: ClientCardSubject | null
  onClose: () => void
  onChanged: () => void
}

type DrawerTab = 'info' | 'activities' | 'notes' | 'docs'

export function ClientCard({ open, clientId, subject, onClose, onChanged }: Props) {
  const [lead, setLead] = useState<LeadDetail | null>(null)
  const [patient, setPatient] = useState<PatientDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<DrawerTab>('info')

  // Identidade ESTÁVEL do alvo. O board recria o objeto `subject` a cada render;
  // carregar chaveado na identidade do OBJETO fazia o card recarregar inteiro em
  // qualquer re-render do pai (ex.: revalidate após registrar interação).
  const subjectType = subject?.type ?? null
  const subjectId = subject?.id ?? null

  // Engajamento de retenção do PACIENTE (card unificado) — vem na carga única.
  const [retention, setRetention] = useState<PatientRetention | null>(null)

  // Aba Atividades
  const [activities, setActivities] = useState<ActivityView[]>([])
  const [members, setMembers] = useState<{ id: string; name: string }[]>([])
  const [canAssignOthers, setCanAssignOthers] = useState(false)
  const [canReassignLeads, setCanReassignLeads] = useState(false)
  const [syncPref, setSyncPref] = useState<'AUTO' | 'ASK' | 'NEVER'>('ASK')
  // Atividades são feature do DOMÍNIO clínica (getClinicContext). O card também
  // abre no painel ADMIN (mesmo KanbanBoard) — lá a carga falha; então
  // desabilitamos a aba em vez de quebrar.
  const [activitiesEnabled, setActivitiesEnabled] = useState(true)
  const [activitiesLoading, setActivitiesLoading] = useState(false)

  // Aba Anotações
  const [notes, setNotes] = useState<CardNote[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const subjectName = lead?.name ?? patient?.name ?? ''

  function addNote() {
    if (!subjectType || !subjectId || !newNote.trim()) return
    setSavingNote(true)
    createClinicNoteAction({ type: subjectType, id: subjectId }, newNote.trim())
      .then((res) => {
        if (res.success) {
          // Append otimista: a action devolve a nota completa — sem re-listar.
          setNewNote('')
          setNotes((prev) => [res.data as CardNote, ...prev])
        } else {
          toast.error(res.error.message)
        }
      })
      .catch(() => toast.error('Não foi possível salvar a anotação'))
      .finally(() => setSavingNote(false))
  }

  function removeNote(noteId: string) {
    deleteClinicNoteAction(noteId)
      .then((res) => {
        if (res.success) setNotes((prev) => prev.filter((n) => n.id !== noteId))
        else toast.error(res.error.message)
      })
      .catch(() => toast.error('Não foi possível excluir a anotação'))
  }

  // Aba Documentos (item 6c)
  const [documents, setDocuments] = useState<CardDoc[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [docsConfigured, setDocsConfigured] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [docToDelete, setDocToDelete] = useState<CardDoc | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadDocuments = useCallback(() => {
    if (!subjectType || !subjectId) return
    setDocsLoading(true)
    getCardDocumentsAction({ type: subjectType, id: subjectId })
      .then((res) => {
        if (res.success) {
          setDocsConfigured(res.data.configured)
          setDocuments(res.data.documents as CardDoc[])
        }
      })
      .catch(() => toast.error('Não foi possível carregar os documentos'))
      .finally(() => setDocsLoading(false))
  }, [subjectType, subjectId])

  function onUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !subject) return
    const fd = new FormData()
    fd.set('targetType', subject.type)
    fd.set('targetId', subject.id)
    fd.set('file', file)
    setUploading(true)
    uploadCardDocumentAction(fd)
      .then((res) => {
        if (res.success) {
          toast.success('Documento enviado')
          loadDocuments()
        } else {
          toast.error(res.error.message)
        }
      })
      .catch(() => toast.error('Não foi possível enviar o arquivo'))
      .finally(() => {
        setUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      })
  }

  function downloadDoc(id: string) {
    getDocumentDownloadUrlAction(id)
      .then((res) => {
        if (res.success) window.open(res.data.url, '_blank', 'noopener')
        else toast.error(res.error.message)
      })
      .catch(() => toast.error('Não foi possível gerar o link do arquivo'))
  }

  function removeDoc(doc: CardDoc) {
    deleteCardDocumentAction(doc.id)
      .then((res) => {
        if (res.success) setDocuments((prev) => prev.filter((d) => d.id !== doc.id))
        else toast.error(res.error.message)
      })
      .catch(() => toast.error('Não foi possível excluir o documento'))
  }

  const loadActivities = useCallback(() => {
    if (!subjectType || !subjectId) return
    setActivitiesLoading(true)
    getCardActivitiesAction({ type: subjectType, id: subjectId })
      .then((res) => {
        if (res.success) {
          setActivities(res.data.activities as ActivityView[])
          setMembers(res.data.members)
          setCanAssignOthers(res.data.canAssignOthers)
          setCanReassignLeads(res.data.canReassignLeads)
          setSyncPref(res.data.syncPref)
          setActivitiesEnabled(true)
        } else {
          setActivitiesEnabled(false)
        }
      })
      .catch(() => toast.error('Não foi possível carregar as atividades'))
      .finally(() => setActivitiesLoading(false))
  }, [subjectType, subjectId])

  // Carga ÚNICA do card (getClientCardAction — 1 roundtrip traz detalhe +
  // atividades + anotações + documentos + retenção). Chaveada em type+id, nunca
  // no objeto `subject`. `stale` descarta resposta atrasada quando o usuário
  // troca de card antes de ela chegar (race de resposta obsoleta).
  useEffect(() => {
    if (!open || !subjectType || !subjectId) {
      setLead(null)
      setPatient(null)
      setRetention(null)
      setTab('info')
      return
    }
    let stale = false
    setLoading(true)
    setActivitiesLoading(true)
    setNotesLoading(true)
    setDocsLoading(true)
    setActivities([])
    setNotes([])
    setDocuments([])
    setRetention(null)
    getClientCardAction(clientId, { type: subjectType, id: subjectId })
      .then((res) => {
        if (stale) return
        if (!res.success) {
          toast.error(res.error.message)
          return
        }
        const d = res.data
        setLead(d.lead as LeadDetail | null)
        setPatient(d.patient as PatientDetail | null)
        setActivitiesEnabled(d.activitiesEnabled)
        setActivities(d.activities as ActivityView[])
        setMembers(d.members)
        setCanAssignOthers(d.canAssignOthers)
        setCanReassignLeads(d.canReassignLeads)
        setSyncPref(d.syncPref)
        setNotes(d.notes as CardNote[])
        setDocsConfigured(d.docsConfigured)
        setDocuments(d.documents as CardDoc[])
        setRetention(d.retention as PatientRetention | null)
      })
      .catch(() => {
        if (!stale) toast.error('Não foi possível carregar o card')
      })
      .finally(() => {
        if (stale) return
        setLoading(false)
        setActivitiesLoading(false)
        setNotesLoading(false)
        setDocsLoading(false)
      })
    return () => {
      stale = true
    }
  }, [open, subjectType, subjectId, clientId])

  const tabs: Array<{ value: DrawerTab; label: string; count: number | null }> = [
    { value: 'info', label: 'Info', count: null },
    { value: 'activities', label: 'Atividades', count: activities.length },
    { value: 'notes', label: 'Anotações', count: notes.length },
    { value: 'docs', label: 'Documentos', count: documents.length },
  ]

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
    >
      <DialogPortal>
        {/* Scrim do drawer (handoff §9.1). */}
        <DialogOverlay className="bg-[hsl(220_24%_5%/0.5)]" />
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex h-full w-[520px] max-w-full flex-col border-l border-border bg-card text-card-foreground',
            'shadow-[-28px_0_60px_-22px_hsl(var(--shadow)/calc(var(--shadow-a)*5))]',
            'duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right'
          )}
        >
          <DialogPrimitive.Description className="sr-only">
            Detalhes, atividades e ações do cliente.
          </DialogPrimitive.Description>

          {/* Header (handoff §9.2): avatar + nome + pill de etapa + origem. */}
          <div className="flex items-start gap-3 px-[22px] pt-5">
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-primary/[0.16] text-[15px] font-semibold text-primary-text">
              {subjectName ? getInitials(subjectName) : '…'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <DialogPrimitive.Title asChild>
                  <h2 className="min-w-0 truncate text-lg font-semibold tracking-[-0.01em]">
                    {subjectName || 'Carregando…'}
                  </h2>
                </DialogPrimitive.Title>
                {lead && (
                  <span className="flex-none rounded-full bg-primary/[0.14] px-[9px] py-0.5 text-[11px] font-semibold text-primary-text">
                    {lead.stage.name}
                  </span>
                )}
              </div>
              <p className="mt-[3px] text-[12.5px] text-muted-foreground">
                {lead &&
                  `Origem · ${SOURCE_LABELS[lead.source as keyof typeof SOURCE_LABELS] ?? lead.source}`}
                {patient && (
                  <span className="tabular-nums">
                    {patient._count.appointments}{' '}
                    {patient._count.appointments === 1 ? 'agendamento' : 'agendamentos'}
                  </span>
                )}
              </p>
            </div>
            <DialogPrimitive.Close
              aria-label="Fechar"
              className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-[17px] w-[17px]" />
            </DialogPrimitive.Close>
          </div>

          {/* Abas underline — a linha corta no fim da última aba (§9.3). */}
          <div className="px-[22px] pt-4">
            <div className="inline-flex max-w-full items-center gap-0.5 border-b border-border">
              {tabs.map((t) => {
                const active = tab === t.value
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTab(t.value)}
                    className={cn(
                      '-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-[9px] py-2 text-[13px] font-semibold transition-colors',
                      active
                        ? 'border-primary text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {t.label}
                    {t.count !== null && t.count > 0 && (
                      <span
                        className={cn(
                          'min-w-[17px] rounded-full px-1.5 py-px text-center text-[10.5px] font-semibold tabular-nums',
                          active
                            ? 'bg-primary/[0.16] text-primary-text'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {t.count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Área de conteúdo (§9.4). */}
          <div className="min-h-0 flex-1 overflow-y-auto px-[22px] pb-6 pt-[18px] [scrollbar-gutter:stable]">
            {tab === 'info' && (
              <>
                {loading && <DrawerSkeleton />}
                {!loading && lead && subject?.type === 'lead' && (
                  <LeadInfo
                    lead={lead}
                    clientId={clientId}
                    subject={subject}
                    members={members}
                    canReassign={canReassignLeads}
                    onChanged={onChanged}
                    onClose={onClose}
                    onInteractionAdded={(it) =>
                      setLead((prev) =>
                        prev ? { ...prev, interactions: [it, ...prev.interactions] } : prev
                      )
                    }
                    reloadLead={() =>
                      getLeadAction(lead.id, clientId)
                        .then((r) => {
                          if (r.success) setLead(r.data as LeadDetail)
                        })
                        .catch(() => toast.error('Não foi possível atualizar o lead'))
                    }
                  />
                )}
                {!loading && patient && subject?.type === 'patient' && (
                  <PatientInfo
                    patient={patient}
                    clientId={clientId}
                    retention={retention}
                    onInteractionAdded={(it) =>
                      setRetention((prev) =>
                        prev ? { ...prev, interactions: [it, ...prev.interactions] } : prev
                      )
                    }
                    onChanged={onChanged}
                    onClose={onClose}
                  />
                )}
              </>
            )}

            {/* ATIVIDADES (§11) */}
            {tab === 'activities' && (
              <div className="flex flex-col gap-3">
                {!activitiesEnabled && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    As atividades estão disponíveis apenas no painel da clínica.
                  </p>
                )}
                {activitiesEnabled && subject && subjectName && (
                  <div className="flex justify-end">
                    <ClinicCreateActivityDialog
                      members={members}
                      allowFanOut={canAssignOthers}
                      activityCalendarSync={syncPref}
                      presetTarget={{ type: subject.type, id: subject.id, name: subjectName }}
                      onCreated={loadActivities}
                      trigger={
                        <ActionButton>
                          <Plus aria-hidden="true" /> Nova atividade
                        </ActionButton>
                      }
                    />
                  </div>
                )}
                {activitiesEnabled && activitiesLoading && activities.length === 0 ? (
                  <DrawerSkeleton />
                ) : activitiesEnabled && activities.length === 0 ? (
                  <EmptyState
                    icon={CheckSquare}
                    title="Nenhuma atividade"
                    text={`Crie uma atividade para acompanhar este ${subject?.type === 'lead' ? 'lead' : 'paciente'}.`}
                  />
                ) : activitiesEnabled ? (
                  <div className="flex flex-col gap-2.5">
                    {activities.map((a) => (
                      <ClinicActivityCard key={a.id} activity={a} />
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            {/* ANOTAÇÕES (§12) */}
            {tab === 'notes' && (
              <div className="flex flex-col gap-3.5">
                <div className="relative rounded-[10px] border border-input bg-background transition-shadow focus-within:border-ring focus-within:shadow-[0_0_0_3px_hsl(var(--ring)/0.18)]">
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Escreva uma anotação sobre este cliente…"
                    rows={3}
                    className="min-h-[82px] w-full resize-none rounded-[10px] border-0 bg-transparent py-[11px] pl-[13px] pr-[54px] text-[13.5px] leading-normal outline-none placeholder:text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={addNote}
                    disabled={savingNote || !newNote.trim()}
                    aria-label="Adicionar anotação"
                    className="absolute bottom-[9px] right-[9px] flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-[filter] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    {savingNote ? (
                      <Loader2 className="h-[15px] w-[15px] animate-spin" />
                    ) : (
                      <Send className="h-[15px] w-[15px]" />
                    )}
                  </button>
                </div>

                {notesLoading && notes.length === 0 ? (
                  <DrawerSkeleton />
                ) : notes.length === 0 ? (
                  <EmptyState
                    icon={FileText}
                    title="Nenhuma anotação"
                    text="Registre observações importantes sobre este cliente."
                  />
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {notes.map((n) => (
                      <div
                        key={n.id}
                        className="group relative rounded-[11px] border border-border bg-card px-3.5 py-[13px] shadow-card transition-colors hover:border-primary/40"
                      >
                        <p className="whitespace-pre-wrap break-words pr-[26px] text-[13px] leading-relaxed">
                          {n.content}
                        </p>
                        <p className="mt-2 text-[11.5px] tabular-nums text-muted-foreground">
                          {n.author?.name ?? 'Alguém'} ·{' '}
                          {format(new Date(n.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeNote(n.id)}
                          aria-label="Excluir anotação"
                          className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-[7px] text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                        >
                          <Trash2 className="h-[15px] w-[15px]" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* DOCUMENTOS (§13) */}
            {tab === 'docs' && (
              <div className="flex flex-col gap-3.5">
                {!docsConfigured ? (
                  <div className="space-y-1 py-8 text-center text-sm text-muted-foreground">
                    <p>Armazenamento de documentos ainda não configurado.</p>
                    <p className="text-xs">
                      Defina <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_URL</code>{' '}
                      e <code className="rounded bg-muted px-1">SUPABASE_SERVICE_ROLE_KEY</code> e
                      crie o bucket privado{' '}
                      <code className="rounded bg-muted px-1">client-documents</code>.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-muted-foreground">
                        Bucket privado · link temporário · máx. 25 MB
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={onUploadFile}
                      />
                      <ActionButton
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                      >
                        {uploading ? (
                          <Loader2 className="animate-spin" aria-hidden="true" />
                        ) : (
                          <Upload aria-hidden="true" />
                        )}
                        Enviar arquivo
                      </ActionButton>
                    </div>

                    {docsLoading && documents.length === 0 ? (
                      <DrawerSkeleton />
                    ) : documents.length === 0 ? (
                      <EmptyState
                        icon={FileText}
                        title="Nenhum documento"
                        text="Envie exames, fichas e orçamentos deste cliente."
                      />
                    ) : (
                      <div className="flex flex-col gap-2.5">
                        {documents.map((d) => (
                          <div
                            key={d.id}
                            className="group flex items-center gap-3 rounded-[11px] border border-border bg-card px-[13px] py-[11px] shadow-card transition-colors hover:border-primary/40"
                          >
                            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[9px] bg-muted text-primary-text">
                              <FileText className="h-[17px] w-[17px]" aria-hidden="true" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-semibold">{d.fileName}</p>
                              <p className="mt-0.5 truncate text-[11.5px] tabular-nums text-muted-foreground">
                                {formatBytes(d.sizeBytes)} · {d.uploader?.name ?? 'Alguém'} ·{' '}
                                {format(new Date(d.createdAt), 'dd/MM/yyyy', { locale: ptBR })}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => downloadDoc(d.id)}
                              aria-label={`Baixar ${d.fileName}`}
                              className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[7px] text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDocToDelete(d)}
                              aria-label={`Excluir ${d.fileName}`}
                              className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[7px] text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                            >
                              <Trash2 className="h-[15px] w-[15px]" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>

      {/* Confirmação de exclusão de documento (nunca confirm() nativo — §16). */}
      <AlertDialog
        open={docToDelete !== null}
        onOpenChange={(o) => {
          if (!o) setDocToDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir documento?</AlertDialogTitle>
            <AlertDialogDescription>
              {docToDelete
                ? `"${docToDelete.fileName}" será excluído permanentemente.`
                : 'O documento será excluído permanentemente.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (docToDelete) removeDoc(docToDelete)
                setDocToDelete(null)
              }}
            >
              Sim, excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Registrar interação + Histórico (handoff §10.6/§10.7): composer + timeline
// com dot colorido por tipo. COMPARTILHADO pelo card de LEAD e pelo card
// UNIFICADO de PACIENTE — a interação grava sempre contra uma Lead (no paciente
// é o card de RETENÇÃO dele). `onAdded` recebe a interação criada p/ o pai
// fazer append otimista (sem re-buscar o lead inteiro).
// ---------------------------------------------------------------------------
type Interaction = { id: string; type: string; content: string; createdAt: Date }

function InteractionSection({
  clientId,
  leadId,
  interactions,
  onAdded,
}: {
  clientId: string
  leadId: string
  interactions: Interaction[]
  onAdded: (interaction: Interaction) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [interactionType, setInteractionType] = useState('NOTE')
  const [interactionContent, setInteractionContent] = useState('')

  function handleAddInteraction() {
    if (!interactionContent.trim()) return
    startTransition(async () => {
      const r = await addInteractionAction(
        leadId,
        clientId,
        interactionType,
        interactionContent.trim()
      )
      if (!r.success) {
        toast.error(r.error.message)
        return
      }
      setInteractionContent('')
      onAdded(r.data as Interaction)
    })
  }

  return (
    <>
      {/* Composer "Registrar interação" (§10.6). */}
      <div>
        <div className="mb-2">
          <Overline>Registrar interação</Overline>
        </div>
        <div className="relative rounded-[10px] border border-input bg-background transition-shadow focus-within:border-ring focus-within:shadow-[0_0_0_3px_hsl(var(--ring)/0.18)]">
          <Select value={interactionType} onValueChange={setInteractionType}>
            <SelectTrigger className="h-[38px] w-full rounded-none rounded-t-[10px] border-0 border-b border-border bg-muted/40 px-[13px] text-[13px] font-semibold transition-colors hover:bg-muted/70 focus:ring-0 focus:ring-offset-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NOTE">Nota</SelectItem>
              <SelectItem value="CALL">Ligação</SelectItem>
              <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
              <SelectItem value="EMAIL">E-mail</SelectItem>
              <SelectItem value="MEETING">Reunião</SelectItem>
            </SelectContent>
          </Select>
          <textarea
            value={interactionContent}
            onChange={(e) => setInteractionContent(e.target.value)}
            placeholder="Descreva a interação…"
            rows={3}
            className="min-h-[76px] w-full resize-none rounded-b-[10px] border-0 bg-transparent py-[11px] pl-[13px] pr-[58px] text-[13.5px] leading-normal outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={handleAddInteraction}
            disabled={!interactionContent.trim() || isPending}
            aria-label="Registrar interação"
            className="absolute bottom-[9px] right-[9px] flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-[filter] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 className="h-[15px] w-[15px] animate-spin" />
            ) : (
              <Send className="h-[15px] w-[15px]" />
            )}
          </button>
        </div>
      </div>

      {/* Histórico (§10.7): timeline com dot colorido por tipo. */}
      <div>
        <div className="mb-3">
          <Overline>
            Histórico · <span className="tabular-nums">{interactions.length}</span>
          </Overline>
        </div>
        {interactions.length === 0 && (
          <p className="text-[12.5px] text-muted-foreground">Nenhuma interação registrada.</p>
        )}
        <div className="flex flex-col">
          {interactions.map((it, i) => (
            <div key={it.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className="mt-1 h-[9px] w-[9px] flex-none rounded-full"
                  style={{
                    backgroundColor: INTERACTION_DOT[it.type] ?? 'hsl(var(--muted-foreground))',
                  }}
                  aria-hidden="true"
                />
                {i < interactions.length - 1 && (
                  <span className="mt-1 w-[1.5px] flex-1 bg-border" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 flex-1 pb-[15px]">
                <div className="flex items-baseline gap-2">
                  <span className="text-[12.5px] font-semibold">
                    {INTERACTION_LABELS[it.type] ?? it.type}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {format(new Date(it.createdAt), "dd/MM 'às' HH:mm", { locale: ptBR })}
                  </span>
                </div>
                <p className="mt-[3px] whitespace-pre-wrap break-words text-[12.5px] leading-normal text-muted-foreground">
                  {it.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Info de LEAD (drawer → aba Info — handoff §10).
// ---------------------------------------------------------------------------
function LeadInfo({
  lead,
  clientId,
  subject,
  members,
  canReassign,
  onChanged,
  onClose,
  onInteractionAdded,
  reloadLead,
}: {
  lead: LeadDetail
  clientId: string
  subject: Extract<ClientCardSubject, { type: 'lead' }>
  members: { id: string; name: string }[]
  canReassign: boolean
  onChanged: () => void
  onClose: () => void
  onInteractionAdded: (interaction: Interaction) => void
  reloadLead: () => void
}) {
  const [isPending, startTransition] = useTransition()

  function handleReassign(userId: string) {
    startTransition(async () => {
      const r = await reassignLeadAction(lead.id, clientId, userId)
      if (!r.success) {
        toast.error(r.error.message)
        return
      }
      toast.success('Lead reatribuído')
      reloadLead()
      onChanged()
    })
  }
  const [showLoseForm, setShowLoseForm] = useState(false)
  const [loseReason, setLoseReason] = useState('')
  const [moveOpen, setMoveOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // §10.3: lead de RETENÇÃO é "da casa" — Responsável/Perdeu/Remover somem.
  const isRetention = subject.pipelineKind === 'RETENTION'
  const lostStage = subject.stages.find((s) => s.isLost)
  const isTerminal = lead.stage.isWon || lead.stage.isLost

  function handleLose() {
    if (!lostStage || !loseReason.trim()) return
    startTransition(async () => {
      const r = await loseLeadAction(lead.id, lostStage.id, clientId, loseReason.trim())
      if (!r.success) {
        toast.error(r.error.message)
        return
      }
      toast.success('Lead marcado como no-show')
      onClose()
      onChanged()
    })
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteLeadAction(lead.id, clientId)
      toast.success('Lead removido')
      onClose()
      onChanged()
    })
  }

  return (
    <div className="group flex flex-col gap-[18px]">
      {/* Contato à esquerda, Origem/Interesse à direita (§10.1/§10.2) — mesmo
          layout do card do paciente; empilha quando o drawer ocupa a tela
          toda (< sm). */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
        {(lead.phone || lead.email) && (
          <div className="flex min-w-0 flex-1 flex-col gap-[11px] sm:border-r sm:border-border sm:pr-5">
            {lead.phone && (
              <a
                href={`tel:${lead.phone.replace(/\D/g, '')}`}
                className="flex items-center gap-2 text-[13.5px] tabular-nums text-foreground transition-colors hover:text-primary-text"
              >
                <Phone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                {lead.phone}
              </a>
            )}
            {lead.email && (
              <a
                href={`mailto:${lead.email}`}
                className="flex items-center gap-2 break-all text-[13.5px] text-foreground transition-colors hover:text-primary-text"
              >
                <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                {lead.email}
              </a>
            )}
          </div>
        )}

        <div
          className={cn(
            'flex min-w-0 flex-1 flex-col gap-3',
            (lead.phone || lead.email) && 'border-t border-border pt-4 sm:border-t-0 sm:pt-0'
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12.5px] text-muted-foreground">Origem</span>
            <span className="rounded-full bg-secondary px-[9px] py-0.5 text-[11px] font-semibold text-secondary-foreground">
              {SOURCE_LABELS[lead.source as keyof typeof SOURCE_LABELS] ?? lead.source}
            </span>
          </div>
          {lead.procedureInterest && (
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12.5px] text-muted-foreground">Interesse</span>
              <span className="text-right text-[13px] font-medium">{lead.procedureInterest}</span>
            </div>
          )}
        </div>
      </div>

      {/* Observações moram JUNTO dos dados de contato/origem, com rótulo
          explícito (antes era um texto solto sem identificação). `line-clamp-4`
          trava o teto de 4 linhas — o input dos popups limita em
          MAX_CARD_NOTES (lib/masks) pelo mesmo motivo. */}
      {lead.notes && (
        <div className="flex flex-col gap-1.5">
          {/* Rótulo estilo Overline + estrela dourada: separa visualmente o
              TÍTULO do texto da observação (ambos eram muted 12.5px). */}
          <span className="flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5 fill-primary text-primary" aria-hidden="true" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
              Observações
            </span>
          </span>
          <p
            className="line-clamp-4 whitespace-pre-wrap break-words text-[12.5px] italic text-muted-foreground"
            title={lead.notes}
          >
            {lead.notes}
          </p>
        </div>
      )}

      {/* Bloco de dados restante (§10.2). */}
      {lead.estimatedValue != null && (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12.5px] text-muted-foreground">Valor estimado</span>
            <span className="text-sm font-semibold tabular-nums">
              {lead.estimatedValue.toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
              })}
            </span>
          </div>
        </div>
      )}

      {/* Responsável (§10.3) — item 4: crm:assignToOthers; some na retenção. */}
      {!isRetention && canReassign && members.length > 1 && (
        <div>
          <div className="mb-2">
            <Overline>Responsável</Overline>
          </div>
          <Select value={lead.assignedToId ?? undefined} onValueChange={handleReassign}>
            <SelectTrigger className="h-10 rounded-[10px] text-[13.5px]">
              <SelectValue placeholder="Sem responsável" />
            </SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Ações — Mover para funil / Perdeu (§10.4). */}
      <div className="flex flex-col gap-[9px]">
        <div className="flex gap-[9px]">
          {subject.pipelines.length > 1 && (
            <button
              type="button"
              onClick={() => setMoveOpen(true)}
              disabled={isPending}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-[10px] border border-input bg-background px-3.5 text-[13.5px] font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <ArrowRightLeft className="h-[15px] w-[15px] text-primary-text" aria-hidden="true" />
              Trocar de funil
            </button>
          )}
          {!isTerminal && !isRetention && lostStage && (
            <button
              type="button"
              onClick={() => setShowLoseForm(!showLoseForm)}
              disabled={isPending}
              className={cn(
                'flex h-10 min-w-[112px] flex-none items-center justify-center gap-2 rounded-[10px] border px-[15px] text-[13.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
                showLoseForm
                  ? 'border-destructive bg-destructive text-destructive-foreground'
                  : 'border-destructive/50 bg-transparent text-destructive hover:bg-destructive/10'
              )}
            >
              <ThumbsDown className="h-[15px] w-[15px]" aria-hidden="true" />
              Perdido
            </button>
          )}
        </div>

        {showLoseForm && (
          <div className="flex flex-col gap-[11px] rounded-xl border border-border bg-muted/40 p-[13px]">
            <Overline>Motivo da perda</Overline>
            <textarea
              value={loseReason}
              onChange={(e) => setLoseReason(e.target.value)}
              placeholder="Ex: Preço, escolheu concorrente…"
              rows={2}
              className="w-full resize-none rounded-[10px] border border-input bg-background px-[13px] py-[9px] text-[13.5px] outline-none placeholder:text-muted-foreground focus:border-ring focus:shadow-[0_0_0_3px_hsl(var(--ring)/0.18)]"
            />
            <div className="flex justify-end gap-[9px]">
              <button
                type="button"
                onClick={() => setShowLoseForm(false)}
                className="h-[38px] rounded-[10px] border border-input bg-background px-3.5 text-[13px] font-semibold transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleLose}
                disabled={!loseReason.trim() || isPending}
                className="flex h-[38px] items-center gap-2 rounded-[10px] bg-destructive px-3.5 text-[13px] font-semibold text-destructive-foreground transition-[filter] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                Confirmar perda
              </button>
            </div>
          </div>
        )}
      </div>

      <InteractionSection
        clientId={clientId}
        leadId={lead.id}
        interactions={lead.interactions}
        onAdded={onInteractionAdded}
      />

      {/* Remover lead (§10.8) — some na retenção; confirm real (§16). Botão
          FIXO (não some ao tirar o hover): esconder por hover deixava a ação
          invisível em toque/teclado e confundia o usuário. */}
      {!isRetention && (
        <div className="flex justify-end border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={isPending}
            className="flex items-center gap-[7px] text-[12.5px] font-semibold text-destructive transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Remover lead
          </button>
        </div>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover lead?</AlertDialogTitle>
            <AlertDialogDescription>
              {lead.name} será removido do funil. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDelete(false)
                handleDelete()
              }}
            >
              Sim, remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MoveLeadPipelineDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        clientId={clientId}
        leadId={lead.id}
        sourceCategory={subject.pipelineCategory}
        currentPipelineId={subject.pipelineId}
        pipelines={subject.pipelines}
        patientDefaults={{ name: lead.name, phone: lead.phone, email: lead.email }}
        onMoved={() => {
          setMoveOpen(false)
          onClose()
          onChanged()
        }}
      />
    </div>
  )
}

// Contexto de RETENÇÃO do paciente p/ o card unificado (vem na carga única —
// `getClientCardAction`): a Lead de retenção + funis de destino.
type PatientRetention = {
  leadId: string
  pipelineId: string
  pipelineCategory: PipelineCategory
  pipelines: PipelineMoveTarget[]
  interactions: Interaction[]
}

// ---------------------------------------------------------------------------
// Info de PACIENTE (drawer → aba Info; mesmo layout do lead onde couber).
// `retention` null = sem card de retenção ou sem acesso ao CRM → só clínico.
// ---------------------------------------------------------------------------
function PatientInfo({
  patient,
  clientId,
  retention,
  onInteractionAdded,
  onChanged,
  onClose,
}: {
  patient: PatientDetail
  clientId: string
  retention: PatientRetention | null
  onInteractionAdded: (interaction: Interaction) => void
  onChanged: () => void
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  function handleDelete() {
    startTransition(async () => {
      await deletePatientAction(patient.id, clientId)
      toast.success('Paciente removido')
      onClose()
      onChanged()
    })
  }

  const hasContact = Boolean(patient.phone || patient.email)
  const hasDates = Boolean(patient.birthDate || patient.firstVisitAt || patient.lastVisitAt)

  return (
    <div className="group flex flex-col gap-[18px]">
      {/* Contato à esquerda, datas à direita — empilha quando o drawer ocupa a
          tela toda (< sm). */}
      {(hasContact || hasDates) && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
          {hasContact && (
            <div
              className={cn(
                'flex min-w-0 flex-1 flex-col gap-[11px]',
                hasDates && 'sm:border-r sm:border-border sm:pr-5'
              )}
            >
              {patient.phone && (
                <a
                  href={`tel:${patient.phone.replace(/\D/g, '')}`}
                  className="flex items-center gap-2 text-[13.5px] tabular-nums text-foreground transition-colors hover:text-primary-text"
                >
                  <Phone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  {patient.phone}
                </a>
              )}
              {patient.email && (
                <a
                  href={`mailto:${patient.email}`}
                  className="flex items-center gap-2 break-all text-[13.5px] text-foreground transition-colors hover:text-primary-text"
                >
                  <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  {patient.email}
                </a>
              )}
            </div>
          )}

          {hasDates && (
            <div
              className={cn(
                'flex min-w-0 flex-1 flex-col gap-3',
                hasContact && 'border-t border-border pt-4 sm:border-t-0 sm:pt-0'
              )}
            >
              {patient.birthDate && (
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                    Nascimento
                  </span>
                  <span className="text-[13px] font-medium tabular-nums">
                    {format(new Date(patient.birthDate), 'dd/MM/yyyy', { locale: ptBR })}
                  </span>
                </div>
              )}
              {patient.firstVisitAt && (
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[12.5px] text-muted-foreground">Primeira visita</span>
                  <span className="text-[13px] font-medium tabular-nums">
                    {format(new Date(patient.firstVisitAt), 'dd/MM/yyyy', { locale: ptBR })}
                  </span>
                </div>
              )}
              {patient.lastVisitAt && (
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[12.5px] text-muted-foreground">Última visita</span>
                  <span className="text-[13px] font-medium tabular-nums">
                    {format(new Date(patient.lastVisitAt), 'dd/MM/yyyy', { locale: ptBR })}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Observações rotuladas, junto dos dados de contato/datas — mesmo padrão
          do card do lead; `line-clamp-4` + MAX_CARD_NOTES no input. */}
      {patient.notes && (
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5 fill-primary text-primary" aria-hidden="true" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
              Observações
            </span>
          </span>
          <p
            className="line-clamp-4 whitespace-pre-wrap break-words text-[12.5px] italic text-muted-foreground"
            title={patient.notes}
          >
            {patient.notes}
          </p>
        </div>
      )}

      {patient.tags.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex flex-wrap gap-1.5">
            {patient.tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-secondary px-[9px] py-0.5 text-[11px] font-semibold text-secondary-foreground"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Engajamento do funil (card unificado): "Mover para funil" + interações
          do card de RETENÇÃO do paciente — o mesmo do card do funil. Só aparece
          quando há card de retenção e o usuário lê CRM. */}
      {retention && (
        <>
          {retention.pipelines.length > 1 && (
            <button
              type="button"
              onClick={() => setMoveOpen(true)}
              className="flex h-10 items-center justify-center gap-2 rounded-[10px] border border-input bg-background px-3.5 text-[13.5px] font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowRightLeft className="h-[15px] w-[15px] text-primary-text" aria-hidden="true" />
              Trocar de funil
            </button>
          )}
          <InteractionSection
            clientId={clientId}
            leadId={retention.leadId}
            interactions={retention.interactions}
            onAdded={onInteractionAdded}
          />
        </>
      )}

      {/* Histórico de agendamentos. */}
      <div>
        <div className="mb-3">
          <Overline>
            Histórico de agendamentos ·{' '}
            <span className="tabular-nums">{patient.appointments.length}</span>
          </Overline>
        </div>
        {patient.appointments.length === 0 && (
          <p className="text-[12.5px] text-muted-foreground">Nenhum agendamento registrado.</p>
        )}
        <div className="flex flex-col gap-2.5">
          {patient.appointments.map((apt) => (
            <div
              key={apt.id}
              className="rounded-[11px] border border-border bg-card px-3.5 py-[13px] shadow-card transition-colors hover:border-primary/40"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[13px] font-semibold">{apt.procedure.name}</p>
                <span
                  className="flex-none rounded-full px-[9px] py-0.5 text-[11px] font-semibold"
                  style={{
                    backgroundColor: STATUS_COLORS[apt.status] + '20',
                    color: STATUS_COLORS[apt.status],
                  }}
                >
                  {STATUS_LABELS[apt.status] ?? apt.status}
                </span>
              </div>
              <p className="mt-0.5 text-[11.5px] tabular-nums text-muted-foreground">
                {format(new Date(apt.scheduledAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                {' · '}
                {apt.durationMinutes} min
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Editar dados + Remover paciente — confirm real (§16). Botões FIXOS
          (não somem ao tirar o hover): esconder por hover deixava as ações
          invisíveis em toque/teclado e confundia o usuário. */}
      <div className="flex items-center justify-between border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          disabled={isPending}
          className="flex items-center gap-[7px] text-[12.5px] font-semibold text-foreground transition hover:text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Editar dados
        </button>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          disabled={isPending}
          className="flex items-center gap-[7px] text-[12.5px] font-semibold text-destructive transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Remover paciente
        </button>
      </div>

      <EditPatientDialog
        open={editOpen}
        clientId={clientId}
        patient={patient}
        onOpenChange={setEditOpen}
        onUpdated={() => {
          setEditOpen(false)
          onChanged()
        }}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover paciente?</AlertDialogTitle>
            <AlertDialogDescription>
              {patient.name} será removido e os dados serão arquivados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDelete(false)
                handleDelete()
              }}
            >
              Sim, remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {retention && (
        <MoveLeadPipelineDialog
          open={moveOpen}
          onOpenChange={setMoveOpen}
          clientId={clientId}
          leadId={retention.leadId}
          sourceCategory={retention.pipelineCategory}
          currentPipelineId={retention.pipelineId}
          pipelines={retention.pipelines}
          patientDefaults={{
            name: patient.name,
            phone: patient.phone,
            email: patient.email,
            birthDate: patient.birthDate,
            cpf: patient.cpf,
          }}
          onMoved={() => {
            setMoveOpen(false)
            onClose()
            onChanged()
          }}
        />
      )}
    </div>
  )
}
