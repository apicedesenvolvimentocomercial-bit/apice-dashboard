'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { X, Phone, Mail, Calendar, Loader2 } from 'lucide-react'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getPatientAction, deletePatientAction } from '@/server/actions/patient-actions'

import { STATUS_LABELS, STATUS_COLORS } from '@/modules/appointments/types'

type Patient = {
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

type Props = {
  open: boolean
  patientId: string | null
  clientId: string
  onClose: () => void
  onUpdated: () => void
}

export function PatientDrawer({ open, patientId, clientId, onClose, onUpdated }: Props) {
  const [patient, setPatient] = useState<Patient | null>(null)
  const [loading, setLoading] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!patientId) {
      setPatient(null)
      return
    }
    setLoading(true)
    getPatientAction(patientId, clientId).then((r) => {
      setLoading(false)
      if (r.success) setPatient(r.data as Patient)
    })
  }, [patientId, clientId])

  function handleDelete() {
    if (!patient) return
    if (!confirm('Remover este paciente? Os dados serão arquivados.')) return
    startTransition(async () => {
      await deletePatientAction(patient.id, clientId)
      toast.success('Paciente removido')
      onClose()
      onUpdated()
    })
  }

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
          <DialogPrimitive.Title className="sr-only">Detalhes do Paciente</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Painel de detalhes, histórico e ações do paciente
          </DialogPrimitive.Description>

          <div className="flex items-start justify-between border-b p-5">
            <div className="min-w-0 flex-1 pr-4">
              {loading || !patient ? (
                <div className="h-5 w-40 animate-pulse rounded bg-muted" />
              ) : (
                <>
                  <h2 className="truncate text-lg font-semibold">{patient.name}</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {patient._count.appointments} agendamentos
                  </p>
                </>
              )}
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" className="shrink-0">
                <X className="h-4 w-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {!loading && patient && (
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
                      <span>
                        {format(new Date(patient.birthDate), 'dd/MM/yyyy', { locale: ptBR })}
                      </span>
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
                  {patient.notes && (
                    <p className="text-sm italic text-muted-foreground">{patient.notes}</p>
                  )}
                  {patient.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {patient.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
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
                  <div className="space-y-2">
                    {patient.appointments.map((apt) => (
                      <div key={apt.id} className="rounded-lg border p-3">
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
                          {format(new Date(apt.scheduledAt), "dd/MM/yyyy 'às' HH:mm", {
                            locale: ptBR,
                          })}
                          {' · '}
                          {apt.durationMinutes} min
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {patient && (
            <div className="flex items-center justify-between border-t p-4">
              <span className="text-xs text-muted-foreground">
                Cadastrado em {format(new Date(patient.createdAt), 'dd/MM/yyyy', { locale: ptBR })}
              </span>
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
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
