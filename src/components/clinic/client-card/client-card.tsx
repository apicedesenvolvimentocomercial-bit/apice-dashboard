'use client'

import type { PipelineCategory, PipelineKind } from '@prisma/client'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ArrowRightLeft,
  Calendar,
  Download,
  FileText,
  Loader2,
  Mail,
  Phone,
  Plus,
  Send,
  ThumbsDown,
  Trash2,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { ClinicActivityCard } from '@/components/clinic/activities/clinic-activity-card'
import { ClinicCreateActivityDialog } from '@/components/clinic/activities/clinic-create-activity-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getCardActivitiesAction } from '@/domains/clinic/activities/activity-actions'
import {
  createClinicNoteAction,
  deleteClinicNoteAction,
  getCardNotesAction,
} from '@/domains/clinic/notes/note-actions'
import {
  deleteCardDocumentAction,
  getCardDocumentsAction,
  getDocumentDownloadUrlAction,
  uploadCardDocumentAction,
} from '@/domains/clinic/documents/document-actions'
import { STATUS_COLORS, STATUS_LABELS } from '@/modules/appointments/types'
import {
  addInteractionAction,
  deleteLeadAction,
  getLeadAction,
  loseLeadAction,
  reassignLeadAction,
} from '@/server/actions/lead-actions'
import { deletePatientAction, getPatientAction } from '@/server/actions/patient-actions'
import { MoveLeadPipelineDialog } from '@/modules/crm/move-lead-pipeline-dialog'
import {
  INTERACTION_LABELS,
  SOURCE_LABELS,
  type KanbanStage,
  type PipelineMoveTarget,
} from '@/modules/crm/types'
import type { ActivityView } from '@/components/shared/activities/types'

/**
 * Card unificado do cliente (itens 5/6). Pop-up CENTRAL (não mais drawer
 * lateral), com abas. Adaptativo: representa um LEAD (card comercial) ou um
 * PACIENTE (retenção / aba pacientes), sempre com as MESMAS abas e ações. Aba
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

type Props = {
  open: boolean
  clientId: string
  subject: ClientCardSubject | null
  onClose: () => void
  onChanged: () => void
}

export function ClientCard({ open, clientId, subject, onClose, onChanged }: Props) {
  const [lead, setLead] = useState<LeadDetail | null>(null)
  const [patient, setPatient] = useState<PatientDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('info')

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

  const loadNotes = useCallback(() => {
    if (!subject) return
    setNotesLoading(true)
    getCardNotesAction({ type: subject.type, id: subject.id })
      .then((res) => {
        if (res.success) setNotes(res.data as CardNote[])
      })
      .finally(() => setNotesLoading(false))
  }, [subject])

  function addNote() {
    if (!subject || !newNote.trim()) return
    setSavingNote(true)
    createClinicNoteAction({ type: subject.type, id: subject.id }, newNote.trim())
      .then((res) => {
        if (res.success) {
          setNewNote('')
          loadNotes()
        } else {
          toast.error(res.error.message)
        }
      })
      .finally(() => setSavingNote(false))
  }

  function removeNote(noteId: string) {
    deleteClinicNoteAction(noteId).then((res) => {
      if (res.success) setNotes((prev) => prev.filter((n) => n.id !== noteId))
      else toast.error(res.error.message)
    })
  }

  // Aba Documentos (item 6c)
  const [documents, setDocuments] = useState<CardDoc[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [docsConfigured, setDocsConfigured] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadDocuments = useCallback(() => {
    if (!subject) return
    setDocsLoading(true)
    getCardDocumentsAction({ type: subject.type, id: subject.id })
      .then((res) => {
        if (res.success) {
          setDocsConfigured(res.data.configured)
          setDocuments(res.data.documents as CardDoc[])
        }
      })
      .finally(() => setDocsLoading(false))
  }, [subject])

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
      .finally(() => {
        setUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      })
  }

  function downloadDoc(id: string) {
    getDocumentDownloadUrlAction(id).then((res) => {
      if (res.success) window.open(res.data.url, '_blank', 'noopener')
      else toast.error(res.error.message)
    })
  }

  function removeDoc(id: string) {
    if (!confirm('Excluir este documento?')) return
    deleteCardDocumentAction(id).then((res) => {
      if (res.success) setDocuments((prev) => prev.filter((d) => d.id !== id))
      else toast.error(res.error.message)
    })
  }

  const loadActivities = useCallback(() => {
    if (!subject) return
    setActivitiesLoading(true)
    getCardActivitiesAction({ type: subject.type, id: subject.id })
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
      .finally(() => setActivitiesLoading(false))
  }, [subject])

  useEffect(() => {
    if (!open || !subject) {
      setLead(null)
      setPatient(null)
      setTab('info')
      return
    }
    setLoading(true)
    const detail =
      subject.type === 'lead'
        ? getLeadAction(subject.id, clientId).then((r) => {
            if (r.success) setLead(r.data as LeadDetail)
          })
        : getPatientAction(subject.id, clientId).then((r) => {
            if (r.success) setPatient(r.data as PatientDetail)
          })
    detail.finally(() => setLoading(false))
    loadActivities()
    loadNotes()
    loadDocuments()
  }, [open, subject, clientId, loadActivities, loadNotes, loadDocuments])

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
    >
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="space-y-0 border-b border-border p-5">
          <DialogTitle className="flex items-center gap-2 text-lg">
            {subjectName || 'Carregando...'}
            {lead && (
              <span
                className="rounded px-1.5 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor: lead.stage.color ? lead.stage.color + '20' : undefined,
                  color: lead.stage.color ?? undefined,
                }}
              >
                {lead.stage.name}
              </span>
            )}
            {patient && (
              <span className="text-sm font-normal text-muted-foreground">
                {patient._count.appointments} agendamentos
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Detalhes, atividades e ações do cliente.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-5 mt-4 w-fit shrink-0">
            <TabsTrigger value="info">Info</TabsTrigger>
            <TabsTrigger value="activities">
              Atividades{activities.length > 0 && ` (${activities.length})`}
            </TabsTrigger>
            <TabsTrigger value="notes">
              Anotações{notes.length > 0 && ` (${notes.length})`}
            </TabsTrigger>
            <TabsTrigger value="docs">
              Documentos{documents.length > 0 && ` (${documents.length})`}
            </TabsTrigger>
          </TabsList>

          {/* INFO */}
          <TabsContent
            value="info"
            className="mt-0 min-h-0 flex-1 space-y-5 overflow-y-auto p-5 data-[state=inactive]:hidden"
          >
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loading && lead && subject?.type === 'lead' && (
              <LeadInfo
                lead={lead}
                clientId={clientId}
                subject={subject}
                members={members}
                canReassign={canReassignLeads}
                onChanged={onChanged}
                onClose={onClose}
                reloadLead={() =>
                  getLeadAction(lead.id, clientId).then((r) => {
                    if (r.success) setLead(r.data as LeadDetail)
                  })
                }
              />
            )}
            {!loading && patient && subject?.type === 'patient' && (
              <PatientInfo
                patient={patient}
                clientId={clientId}
                onChanged={onChanged}
                onClose={onClose}
              />
            )}
          </TabsContent>

          {/* ATIVIDADES */}
          <TabsContent
            value="activities"
            className="mt-0 min-h-0 flex-1 space-y-3 overflow-y-auto p-5 data-[state=inactive]:hidden"
          >
            {!activitiesEnabled && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                As atividades estão disponíveis apenas no painel da clínica.
              </p>
            )}
            {activitiesEnabled && (
              <div className="flex justify-end">
                {subject && subjectName && (
                  <ClinicCreateActivityDialog
                    members={members}
                    allowFanOut={canAssignOthers}
                    activityCalendarSync={syncPref}
                    presetTarget={{ type: subject.type, id: subject.id, name: subjectName }}
                    onCreated={loadActivities}
                    trigger={
                      <Button size="sm">
                        <Plus className="mr-1 h-4 w-4" /> Nova atividade
                      </Button>
                    }
                  />
                )}
              </div>
            )}
            {activitiesEnabled && activitiesLoading && activities.length === 0 ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : activitiesEnabled && activities.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma atividade para este {subject?.type === 'lead' ? 'lead' : 'paciente'} ainda.
              </p>
            ) : activitiesEnabled ? (
              <div className="space-y-2">
                {activities.map((a) => (
                  <ClinicActivityCard key={a.id} activity={a} />
                ))}
              </div>
            ) : null}
          </TabsContent>

          {/* ANOTAÇÕES */}
          <TabsContent
            value="notes"
            className="mt-0 min-h-0 flex-1 space-y-3 overflow-y-auto p-5 data-[state=inactive]:hidden"
          >
            <div className="space-y-2">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Escreva uma anotação sobre este cliente..."
                rows={3}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <div className="flex justify-end">
                <Button size="sm" onClick={addNote} disabled={savingNote || !newNote.trim()}>
                  {savingNote ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-1 h-4 w-4" />
                  )}
                  Adicionar
                </Button>
              </div>
            </div>

            {notesLoading && notes.length === 0 ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : notes.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma anotação ainda.
              </p>
            ) : (
              <div className="space-y-2">
                {notes.map((n) => (
                  <div
                    key={n.id}
                    className="group rounded-lg border border-border bg-muted/30 p-3 text-sm"
                  >
                    <p className="whitespace-pre-wrap">{n.content}</p>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {n.author?.name ?? 'Alguém'} ·{' '}
                        {format(new Date(n.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeNote(n.id)}
                        className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                        aria-label="Excluir anotação"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* DOCUMENTOS (item 6c) */}
          <TabsContent
            value="docs"
            className="mt-0 min-h-0 flex-1 space-y-3 overflow-y-auto p-5 data-[state=inactive]:hidden"
          >
            {!docsConfigured ? (
              <div className="space-y-1 py-8 text-center text-sm text-muted-foreground">
                <p>Armazenamento de documentos ainda não configurado.</p>
                <p className="text-xs">
                  Defina <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_URL</code> e{' '}
                  <code className="rounded bg-muted px-1">SUPABASE_SERVICE_ROLE_KEY</code> e crie o
                  bucket privado <code className="rounded bg-muted px-1">client-documents</code>.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Arquivos em bucket privado · link temporário · máx. 25 MB
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={onUploadFile}
                  />
                  <Button
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="mr-1 h-4 w-4" />
                    )}
                    Enviar arquivo
                  </Button>
                </div>

                {docsLoading && documents.length === 0 ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : documents.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Nenhum documento ainda.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {documents.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center gap-3 rounded-lg border border-border p-3"
                      >
                        <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{d.fileName}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatBytes(d.sizeBytes)} · {d.uploader?.name ?? 'Alguém'} ·{' '}
                            {format(new Date(d.createdAt), 'dd/MM/yyyy', { locale: ptBR })}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => downloadDoc(d.id)}
                          aria-label={`Baixar ${d.fileName}`}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeDoc(d.id)}
                          aria-label={`Excluir ${d.fileName}`}
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Info de LEAD (porta o conteúdo do antigo LeadDrawer).
// ---------------------------------------------------------------------------
function LeadInfo({
  lead,
  clientId,
  subject,
  members,
  canReassign,
  onChanged,
  onClose,
  reloadLead,
}: {
  lead: LeadDetail
  clientId: string
  subject: Extract<ClientCardSubject, { type: 'lead' }>
  members: { id: string; name: string }[]
  canReassign: boolean
  onChanged: () => void
  onClose: () => void
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
  const [interactionType, setInteractionType] = useState('NOTE')
  const [interactionContent, setInteractionContent] = useState('')

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

  function handleAddInteraction() {
    if (!interactionContent.trim()) return
    startTransition(async () => {
      const r = await addInteractionAction(
        lead.id,
        clientId,
        interactionType,
        interactionContent.trim()
      )
      if (!r.success) {
        toast.error(r.error.message)
        return
      }
      setInteractionContent('')
      reloadLead()
    })
  }

  function handleDelete() {
    if (!confirm('Remover este lead? Esta ação não pode ser desfeita.')) return
    startTransition(async () => {
      await deleteLeadAction(lead.id, clientId)
      toast.success('Lead removido')
      onClose()
      onChanged()
    })
  }

  return (
    <>
      <div className="space-y-2">
        <Badge variant="secondary" className="text-xs">
          {SOURCE_LABELS[lead.source as keyof typeof SOURCE_LABELS] ?? lead.source}
        </Badge>
        {lead.phone && (
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>{lead.phone}</span>
          </div>
        )}
        {lead.email && (
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>{lead.email}</span>
          </div>
        )}
        {lead.procedureInterest && (
          <p className="text-sm text-muted-foreground">Interesse: {lead.procedureInterest}</p>
        )}
        {lead.estimatedValue != null && (
          <p className="text-sm text-muted-foreground">
            Valor estimado:{' '}
            <span className="font-medium text-foreground">
              {lead.estimatedValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </p>
        )}
        {lead.notes && <p className="text-sm italic text-muted-foreground">{lead.notes}</p>}
      </div>

      {/* Mover o card para outro funil. Lead→funil de Paciente converte (dados+motivo). */}
      {subject.pipelines.length > 1 && (
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMoveOpen(true)}
            disabled={isPending}
          >
            <ArrowRightLeft className="mr-1.5 h-4 w-4" />
            Mover para funil
          </Button>
        </div>
      )}

      {/* Item 4: reatribuir o lead a outro usuário (crm:assignToOthers). */}
      {canReassign && members.length > 1 && (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Responsável
          </p>
          <Select value={lead.assignedToId ?? undefined} onValueChange={handleReassign}>
            <SelectTrigger className="h-8 text-sm">
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

      {!isTerminal && !isRetention && lostStage && (
        <div className="space-y-3">
          <Button
            size="sm"
            variant="outline"
            className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={() => setShowLoseForm(!showLoseForm)}
            disabled={isPending}
          >
            <ThumbsDown className="mr-1.5 h-4 w-4" />
            Perdeu
          </Button>
          {showLoseForm && (
            <div className="space-y-2 rounded-lg border border-red-200 p-3">
              <p className="text-xs font-medium text-red-600">Motivo da perda *</p>
              <textarea
                value={loseReason}
                onChange={(e) => setLoseReason(e.target.value)}
                placeholder="Ex: Preço, escolheu concorrente..."
                rows={2}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <Button
                size="sm"
                variant="destructive"
                onClick={handleLose}
                disabled={!loseReason.trim() || isPending}
              >
                {isPending && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                Confirmar perda
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Registro rápido de interação (log do lead) */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Registrar interação
        </p>
        <textarea
          value={interactionContent}
          onChange={(e) => setInteractionContent(e.target.value)}
          placeholder="Descreva a interação..."
          rows={2}
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <div className="flex items-center gap-2">
          <Select value={interactionType} onValueChange={setInteractionType}>
            <SelectTrigger className="h-9 flex-1 text-xs">
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
          <Button
            size="sm"
            onClick={handleAddInteraction}
            disabled={!interactionContent.trim() || isPending}
            className="shrink-0"
          >
            {isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-4 w-4" />
            )}
            Registrar
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Histórico ({lead.interactions.length})
        </p>
        {lead.interactions.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma interação registrada.</p>
        )}
        {lead.interactions.map((it) => (
          <div key={it.id} className="border-l-2 border-border pl-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">{INTERACTION_LABELS[it.type] ?? it.type}</span>
              <span className="text-xs text-muted-foreground">
                {format(new Date(it.createdAt), "dd/MM 'às' HH:mm", { locale: ptBR })}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{it.content}</p>
          </div>
        ))}
      </div>

      {!isRetention && (
        <div className="flex justify-end border-t border-border pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={isPending}
            className="text-destructive hover:text-destructive"
          >
            Remover lead
          </Button>
        </div>
      )}

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
    </>
  )
}

// ---------------------------------------------------------------------------
// Info de PACIENTE (porta o conteúdo do antigo PatientDrawer).
// ---------------------------------------------------------------------------
function PatientInfo({
  patient,
  clientId,
  onChanged,
  onClose,
}: {
  patient: PatientDetail
  clientId: string
  onChanged: () => void
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    if (!confirm('Remover este paciente? Os dados serão arquivados.')) return
    startTransition(async () => {
      await deletePatientAction(patient.id, clientId)
      toast.success('Paciente removido')
      onClose()
      onChanged()
    })
  }

  return (
    <>
      <div className="space-y-2">
        {patient.phone && (
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>{patient.phone}</span>
          </div>
        )}
        {patient.email && (
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>{patient.email}</span>
          </div>
        )}
        {patient.birthDate && (
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>{format(new Date(patient.birthDate), 'dd/MM/yyyy', { locale: ptBR })}</span>
          </div>
        )}
        {patient.firstVisitAt && (
          <p className="text-sm text-muted-foreground">
            Primeira visita:{' '}
            <span className="font-medium text-foreground">
              {format(new Date(patient.firstVisitAt), 'dd/MM/yyyy', { locale: ptBR })}
            </span>
          </p>
        )}
        {patient.lastVisitAt && (
          <p className="text-sm text-muted-foreground">
            Última visita:{' '}
            <span className="font-medium text-foreground">
              {format(new Date(patient.lastVisitAt), 'dd/MM/yyyy', { locale: ptBR })}
            </span>
          </p>
        )}
        {patient.notes && <p className="text-sm italic text-muted-foreground">{patient.notes}</p>}
        {patient.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {patient.tags.map((t) => (
              <Badge key={t} variant="secondary" className="text-xs">
                {t}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Histórico de agendamentos ({patient.appointments.length})
        </p>
        {patient.appointments.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum agendamento registrado.</p>
        )}
        {patient.appointments.map((apt) => (
          <div key={apt.id} className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{apt.procedure.name}</p>
              <span
                className="rounded px-1.5 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor: STATUS_COLORS[apt.status] + '20',
                  color: STATUS_COLORS[apt.status],
                }}
              >
                {STATUS_LABELS[apt.status] ?? apt.status}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {format(new Date(apt.scheduledAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              {' · '}
              {apt.durationMinutes} min
            </p>
          </div>
        ))}
      </div>

      <div className="flex justify-end border-t border-border pt-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={isPending}
          className="text-destructive hover:text-destructive"
        >
          Remover paciente
        </Button>
      </div>
    </>
  )
}
