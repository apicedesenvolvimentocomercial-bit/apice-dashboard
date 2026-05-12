'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { formatDistanceToNow, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Loader2, Phone, Mail, X, Trophy, ThumbsDown, Send } from 'lucide-react'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getLeadAction,
  winLeadAction,
  loseLeadAction,
  addInteractionAction,
  deleteLeadAction,
} from '@/server/actions/lead-actions'
import { cn } from '@/lib/utils'
import { SOURCE_LABELS, INTERACTION_LABELS } from './types'
import type { KanbanStage } from './types'

type Lead = {
  id: string
  name: string
  phone: string | null
  email: string | null
  source: string
  procedureInterest: string | null
  estimatedValue: number | null
  notes: string | null
  stage: { id: string; name: string; color: string | null; isWon: boolean; isLost: boolean }
  interactions: Array<{
    id: string
    type: string
    content: string
    createdAt: Date
  }>
}

type Props = {
  open: boolean
  leadId: string | null
  clientId: string
  stages: KanbanStage[]
  onClose: () => void
  onLeadUpdated: () => void
}

export function LeadDrawer({ open, leadId, clientId, stages, onClose, onLeadUpdated }: Props) {
  const [lead, setLead] = useState<Lead | null>(null)
  const [loadingLead, setLoadingLead] = useState(false)
  const [loseReason, setLoseReason] = useState('')
  const [showLoseForm, setShowLoseForm] = useState(false)
  const [interactionContent, setInteractionContent] = useState('')
  const [interactionType, setInteractionType] = useState('NOTE')
  const [isPending, startTransition] = useTransition()

  const wonStage = stages.find((s) => s.isWon)
  const lostStage = stages.find((s) => s.isLost)

  useEffect(() => {
    if (!leadId) {
      setLead(null)
      return
    }
    setLoadingLead(true)
    getLeadAction(leadId).then((result) => {
      setLoadingLead(false)
      if (result.success) setLead(result.data as Lead)
    })
  }, [leadId])

  function handleWin() {
    if (!lead || !wonStage) return
    startTransition(async () => {
      const result = await winLeadAction(lead.id, wonStage.id, clientId)
      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      toast.success('Lead convertido em paciente!')
      onClose()
      onLeadUpdated()
    })
  }

  function handleLose() {
    if (!lead || !lostStage || !loseReason.trim()) return
    startTransition(async () => {
      const result = await loseLeadAction(lead.id, lostStage.id, clientId, loseReason.trim())
      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      toast.success('Lead marcado como perdido')
      setShowLoseForm(false)
      setLoseReason('')
      onClose()
      onLeadUpdated()
    })
  }

  function handleAddInteraction() {
    if (!lead || !interactionContent.trim()) return
    startTransition(async () => {
      const result = await addInteractionAction(
        lead.id,
        clientId,
        interactionType,
        interactionContent.trim()
      )
      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      setInteractionContent('')
      getLeadAction(lead.id).then((r) => {
        if (r.success) setLead(r.data as Lead)
      })
    })
  }

  function handleDelete() {
    if (!lead) return
    if (!confirm('Remover este lead? Esta ação não pode ser desfeita.')) return
    startTransition(async () => {
      await deleteLeadAction(lead.id, clientId)
      toast.success('Lead removido')
      onClose()
      onLeadUpdated()
    })
  }

  const isTerminal = lead?.stage.isWon || lead?.stage.isLost

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            'fixed right-0 top-0 z-50 h-full w-full max-w-md border-l bg-background shadow-xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
            'flex flex-col duration-300'
          )}
        >
          <DialogPrimitive.Title className="sr-only">Detalhes do Lead</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Painel de detalhes, interações e ações do lead
          </DialogPrimitive.Description>

          {/* Header */}
          <div className="flex items-start justify-between border-b p-5">
            <div className="min-w-0 flex-1 pr-4">
              {loadingLead || !lead ? (
                <div className="h-5 w-40 animate-pulse rounded bg-muted" />
              ) : (
                <>
                  <h2 className="truncate text-lg font-semibold leading-tight">{lead.name}</h2>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {SOURCE_LABELS[lead.source as keyof typeof SOURCE_LABELS] ?? lead.source}
                    </Badge>
                    <span
                      className="rounded px-1.5 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: lead.stage.color ? lead.stage.color + '20' : undefined,
                        color: lead.stage.color ?? undefined,
                      }}
                    >
                      {lead.stage.name}
                    </span>
                  </div>
                </>
              )}
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" className="shrink-0">
                <X className="h-4 w-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          {/* Content */}
          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            {loadingLead && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {!loadingLead && lead && (
              <>
                {/* Contact info */}
                <div className="space-y-2">
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
                    <p className="text-sm text-muted-foreground">
                      Interesse: {lead.procedureInterest}
                    </p>
                  )}
                  {lead.estimatedValue != null && (
                    <p className="text-sm text-muted-foreground">
                      Valor estimado:{' '}
                      <span className="font-medium text-foreground">
                        {lead.estimatedValue.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </span>
                    </p>
                  )}
                  {lead.notes && (
                    <p className="text-sm italic text-muted-foreground">{lead.notes}</p>
                  )}
                </div>

                {/* Win / Lose actions */}
                {!isTerminal && (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      {wonStage && (
                        <Button
                          size="sm"
                          className="flex-1 bg-green-600 text-white hover:bg-green-700"
                          onClick={handleWin}
                          disabled={isPending}
                        >
                          <Trophy className="mr-1.5 h-4 w-4" />
                          Ganhou
                        </Button>
                      )}
                      {lostStage && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => setShowLoseForm(!showLoseForm)}
                          disabled={isPending}
                        >
                          <ThumbsDown className="mr-1.5 h-4 w-4" />
                          Perdeu
                        </Button>
                      )}
                    </div>

                    {showLoseForm && (
                      <div className="space-y-2 rounded-lg border border-red-200 p-3">
                        <p className="text-xs font-medium text-red-600">Motivo da perda *</p>
                        <textarea
                          value={loseReason}
                          onChange={(e) => setLoseReason(e.target.value)}
                          placeholder="Ex: Preço, não compareceu, escolheu concorrente..."
                          rows={2}
                          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={handleLose}
                            disabled={!loseReason.trim() || isPending}
                            className="flex-1"
                          >
                            {isPending && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                            Confirmar perda
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setShowLoseForm(false)
                              setLoseReason('')
                            }}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Add interaction */}
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Registrar atividade
                  </p>
                  <Select value={interactionType} onValueChange={setInteractionType}>
                    <SelectTrigger className="h-8 text-xs">
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
                  <div className="flex gap-2">
                    <textarea
                      value={interactionContent}
                      onChange={(e) => setInteractionContent(e.target.value)}
                      placeholder="Descreva a atividade..."
                      rows={2}
                      className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <Button
                      size="icon"
                      onClick={handleAddInteraction}
                      disabled={!interactionContent.trim() || isPending}
                      className="shrink-0 self-end"
                    >
                      {isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Timeline */}
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Histórico ({lead.interactions.length})
                  </p>

                  {lead.interactions.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhuma atividade registrada.</p>
                  )}

                  <div className="space-y-2">
                    {lead.interactions.map((interaction) => (
                      <div key={interaction.id} className="flex gap-2">
                        <div className="flex flex-col items-center">
                          <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                          <div className="mt-1 w-px flex-1 bg-border" />
                        </div>
                        <div className="min-w-0 flex-1 pb-3">
                          <div className="mb-0.5 flex items-center gap-2">
                            <span className="text-xs font-medium">
                              {INTERACTION_LABELS[interaction.type] ?? interaction.type}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(interaction.createdAt), {
                                addSuffix: true,
                                locale: ptBR,
                              })}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">{interaction.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          {lead && (
            <div className="flex items-center justify-between border-t p-4">
              <span className="text-xs text-muted-foreground">
                Criado em{' '}
                {format(
                  new Date(
                    lead.interactions[lead.interactions.length - 1]?.createdAt ?? new Date()
                  ),
                  'dd/MM/yyyy',
                  { locale: ptBR }
                )}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                className="text-destructive hover:text-destructive"
              >
                Remover lead
              </Button>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
