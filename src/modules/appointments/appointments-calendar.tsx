'use client'

import dynamic from 'next/dynamic'
import { Plus, Settings2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PatientWithStats } from '@/server/repositories/patient-repository'
import type { ProcedureForSelect } from '@/server/repositories/procedure-repository'

import { AppointmentDetailDialog } from './appointment-detail-dialog'
import { CreateAppointmentDialog } from './create-appointment-dialog'
import { ScheduleSettingsDialog } from './schedule-settings-dialog'
import { DEFAULT_SCHEDULE } from './types'
import type { AppointmentEvent, ClinicSchedule } from './types'

const CalendarView = dynamic(() => import('./calendar-view').then((m) => m.CalendarView), {
  ssr: false,
  loading: () => (
    <div className="flex h-96 items-center justify-center rounded-lg border">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  ),
})

type Props = {
  appointments: AppointmentEvent[]
  patients: PatientWithStats[]
  procedures: ProcedureForSelect[]
  clientId: string
  schedule?: ClinicSchedule
  /** Oculta o título interno "Agendamentos" (quando o título vem de fora, ex.:
   * toggle "Agendamentos / Calendário" na aba da clínica). Mantém os botões. */
  hideTitle?: boolean
}

export function AppointmentsCalendar({
  appointments,
  patients,
  procedures,
  clientId,
  schedule = DEFAULT_SCHEDULE,
  hideTitle = false,
}: Props) {
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [defaultDate, setDefaultDate] = useState<string | undefined>()
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentEvent | null>(null)

  function handleDateSelect(dateStr: string) {
    setDefaultDate(dateStr)
    setCreateOpen(true)
  }

  function handleUpdated() {
    setSelectedAppointment(null)
    router.refresh()
  }

  return (
    <>
      <div className={cn('flex items-center', hideTitle ? 'justify-end' : 'justify-between')}>
        {!hideTitle && (
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Agendamentos</h1>
            <p className="text-muted-foreground">
              {appointments.length} {appointments.length === 1 ? 'agendamento' : 'agendamentos'}
            </p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            title="Configurações do expediente"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 className="h-4 w-4" />
          </Button>
          <Button
            onClick={() => {
              setDefaultDate(undefined)
              setCreateOpen(true)
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Novo agendamento
          </Button>
        </div>
      </div>

      <div className="mt-4 rounded-lg border bg-background p-4">
        <CalendarView
          appointments={appointments}
          schedule={schedule}
          onEventClick={setSelectedAppointment}
          onDateSelect={handleDateSelect}
        />
      </div>

      <CreateAppointmentDialog
        open={createOpen}
        clientId={clientId}
        patients={patients}
        procedures={procedures}
        defaultDate={defaultDate}
        schedule={schedule}
        onOpenChange={setCreateOpen}
        onCreated={() => router.refresh()}
      />

      <ScheduleSettingsDialog
        open={settingsOpen}
        clientId={clientId}
        schedule={schedule}
        onOpenChange={setSettingsOpen}
        onSaved={() => router.refresh()}
      />

      <AppointmentDetailDialog
        open={selectedAppointment !== null}
        appointment={selectedAppointment}
        clientId={clientId}
        procedures={procedures}
        onClose={() => setSelectedAppointment(null)}
        onUpdated={handleUpdated}
      />
    </>
  )
}
