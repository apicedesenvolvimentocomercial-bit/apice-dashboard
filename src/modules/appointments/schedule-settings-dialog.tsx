'use client'

import { useState, useTransition } from 'react'
import { Trash2, Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  updateClinicScheduleAction,
  addHolidaysBulkAction,
  removeHolidayAction,
} from '@/server/actions/clinic-schedule-actions'
import type { ClinicSchedule } from './types'

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

type BrasilHoliday = { date: string; localName: string; name: string }

type Props = {
  open: boolean
  clientId: string
  schedule: ClinicSchedule
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function ScheduleSettingsDialog({ open, clientId, schedule, onOpenChange, onSaved }: Props) {
  const [isPending, startTransition] = useTransition()
  const [workdayStart, setWorkdayStart] = useState(schedule.workdayStart)
  const [workdayEnd, setWorkdayEnd] = useState(schedule.workdayEnd)
  const [workdays, setWorkdays] = useState<number[]>(schedule.workdays)

  const currentYear = new Date().getFullYear()
  const [importYear, setImportYear] = useState(String(currentYear))
  const [isFetching, setIsFetching] = useState(false)

  function toggleDay(d: number) {
    setWorkdays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
    )
  }

  function handleSaveSchedule() {
    startTransition(async () => {
      const result = await updateClinicScheduleAction(clientId, {
        workdayStart,
        workdayEnd,
        workdays,
      })
      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      toast.success('Horário atualizado')
      onSaved()
    })
  }

  async function handleImportHolidays() {
    const year = parseInt(importYear)
    if (!year || year < 2000 || year > 2100) {
      toast.error('Ano inválido')
      return
    }
    setIsFetching(true)
    try {
      const res = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`)
      if (!res.ok) throw new Error(`BrasilAPI retornou ${res.status}`)
      const data: BrasilHoliday[] = await res.json()

      if (!Array.isArray(data) || data.length === 0) {
        toast.info('Nenhum feriado retornado pela API para este ano')
        return
      }

      const existingDates = new Set(schedule.holidays.map((h) => h.date))
      const toAdd = data
        .map((h) => ({ date: h.date.slice(0, 10), name: h.localName ?? h.name }))
        .filter((h) => h.date && h.name && !existingDates.has(h.date))

      if (toAdd.length === 0) {
        toast.info('Todos os feriados nacionais de ' + year + ' já estão cadastrados')
        return
      }

      const result = await addHolidaysBulkAction(clientId, toAdd)
      if (!result.success) {
        toast.error('Erro ao salvar feriados: ' + result.error.message)
        return
      }

      const { added } = result.data
      toast.success(
        `${added} feriado${added !== 1 ? 's' : ''} importado${added !== 1 ? 's' : ''} para ${year}`
      )
      onSaved()
    } catch (err) {
      toast.error(
        'Falha ao buscar feriados: ' + (err instanceof Error ? err.message : 'erro desconhecido')
      )
    } finally {
      setIsFetching(false)
    }
  }

  function handleRemoveHoliday(id: string) {
    startTransition(async () => {
      const result = await removeHolidayAction(clientId, id)
      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      toast.success('Feriado removido')
      onSaved()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Configurações do Expediente</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Horários + dias + salvar em uma seção coesa */}
          <div className="space-y-4 rounded-lg border p-4">
            {/* Horários */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Horário de atendimento</Label>
              <div className="flex items-center gap-3">
                <div className="flex flex-1 flex-col gap-1">
                  <Label htmlFor="sched-start" className="text-xs text-muted-foreground">
                    Abertura
                  </Label>
                  <Input
                    id="sched-start"
                    type="time"
                    lang="pt-BR"
                    value={workdayStart}
                    onChange={(e) => setWorkdayStart(e.target.value)}
                  />
                </div>
                <span className="mt-5 text-sm text-muted-foreground">até</span>
                <div className="flex flex-1 flex-col gap-1">
                  <Label htmlFor="sched-end" className="text-xs text-muted-foreground">
                    Fechamento
                  </Label>
                  <Input
                    id="sched-end"
                    type="time"
                    lang="pt-BR"
                    value={workdayEnd}
                    onChange={(e) => setWorkdayEnd(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Dias da semana */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Dias de atendimento</Label>
              <div className="flex flex-wrap gap-2">
                {DAY_LABELS.map((label, i) => {
                  const active = workdays.includes(i)
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleDay(i)}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                        active
                          ? 'bg-primary text-primary-foreground'
                          : 'border bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              {workdays.length === 0 && (
                <p className="text-xs text-red-500">Selecione ao menos 1 dia</p>
              )}
            </div>

            {/* Botão separado dos dias por espaço interno da section */}
            <div className="flex justify-end pt-2">
              <Button
                type="button"
                onClick={handleSaveSchedule}
                disabled={isPending || workdays.length === 0}
              >
                Salvar horário
              </Button>
            </div>
          </div>

          {/* Feriados */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Feriados nacionais</Label>

            {/* Importar via BrasilAPI */}
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={2000}
                max={2100}
                value={importYear}
                onChange={(e) => setImportYear(e.target.value)}
                className="w-24 shrink-0"
                placeholder="Ano"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleImportHolidays}
                disabled={isFetching || isPending}
                className="flex-1"
              >
                {isFetching ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                {isFetching ? 'Importando...' : 'Importar feriados do Brasil'}
              </Button>
            </div>

            {/* Lista de feriados cadastrados */}
            {schedule.holidays.length > 0 ? (
              <ul className="max-h-52 space-y-1 overflow-y-auto">
                {schedule.holidays.map((h) => (
                  <li
                    key={h.id}
                    className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-1.5 text-sm"
                  >
                    <span>
                      <span className="font-medium tabular-nums">{h.date}</span> — {h.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveHoliday(h.id)}
                      disabled={isPending}
                      className="ml-2 rounded p-1 text-muted-foreground transition-colors hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nenhum feriado cadastrado. Importe os feriados nacionais acima.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
