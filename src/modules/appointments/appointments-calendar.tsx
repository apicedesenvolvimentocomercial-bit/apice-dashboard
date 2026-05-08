'use client'

import dynamic from 'next/dynamic'
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import type { PatientWithStats } from '@/server/repositories/patient-repository'
import type { ProcedureForSelect } from '@/server/repositories/procedure-repository'

import { AppointmentDetailDialog } from './appointment-detail-dialog'
import { CreateAppointmentDialog } from './create-appointment-dialog'
import type { AppointmentEvent } from './types'

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
}

export function AppointmentsCalendar({ appointments, patients, procedures, clientId }: Props) {
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agendamentos</h1>
          <p className="text-muted-foreground">
            {appointments.length} {appointments.length === 1 ? 'agendamento' : 'agendamentos'}
          </p>
        </div>
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

      <div className="rounded-lg border bg-background p-4">
        <CalendarView
          appointments={appointments}
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
        onOpenChange={setCreateOpen}
        onCreated={() => router.refresh()}
      />

      <AppointmentDetailDialog
        open={selectedAppointment !== null}
        appointment={selectedAppointment}
        clientId={clientId}
        onClose={() => setSelectedAppointment(null)}
        onUpdated={handleUpdated}
      />
    </>
  )
}
