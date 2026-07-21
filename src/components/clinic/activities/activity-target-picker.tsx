'use client'

import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { listClinicActivityTargetsAction } from '@/domains/clinic/activities/activity-actions'
import { cn } from '@/lib/utils'

/**
 * Picker de alvo (lead/paciente) das atividades de clínica (item 1). Combobox
 * leve: aba Leads|Pacientes + busca. As listas carregam sob demanda (server
 * action) no 1º "abrir". Reusado pela aba Atividades e pelo card do cliente.
 */
export type ActivityTarget = { type: 'lead' | 'patient'; id: string; name: string }

type LeadOpt = { id: string; name: string; phone: string | null; stage: { name: string } | null }
type PatientOpt = { id: string; name: string; phone: string | null }

type Props = {
  value: ActivityTarget | null
  onChange: (t: ActivityTarget) => void
  disabled?: boolean
}

export function ActivityTargetPicker({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'lead' | 'patient'>(value?.type ?? 'lead')
  const [leads, setLeads] = useState<LeadOpt[] | null>(null)
  const [patients, setPatients] = useState<PatientOpt[] | null>(null)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || leads !== null) return
    setLoading(true)
    listClinicActivityTargetsAction()
      .then((res) => {
        if (res.success) {
          setLeads(res.data.leads)
          setPatients(res.data.patients)
        }
      })
      .finally(() => setLoading(false))
  }, [open, leads])

  const list: (LeadOpt | PatientOpt)[] | null = tab === 'lead' ? leads : patients
  const needle = q.trim().toLowerCase()
  const filtered = (list ?? [])
    .filter(
      (o) => o.name.toLowerCase().includes(needle) || (o.phone ?? '').toLowerCase().includes(needle)
    )
    .slice(0, 50)

  function pick(o: { id: string; name: string }) {
    onChange({ type: tab, id: o.id, name: o.name })
    setOpen(false)
    setQ('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn('truncate', !value && 'text-muted-foreground')}>
            {value
              ? `${value.type === 'lead' ? 'Lead' : 'Paciente'}: ${value.name}`
              : 'Selecionar lead ou paciente'}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      {/* `bg-background` casa com o fundo do dialog que hospeda o picker — o
          `bg-popover` padrão é mais claro no dark e destoava do popup. */}
      <PopoverContent className="w-[--radix-popover-trigger-width] bg-background p-0" align="start">
        <div className="flex border-b border-border">
          {(['lead', 'patient'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 px-3 py-2 text-sm transition-colors',
                tab === t
                  ? 'border-b-2 border-primary font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t === 'lead' ? 'Leads' : 'Pacientes'}
            </button>
          ))}
        </div>
        <div className="p-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome ou telefone..."
              className="pl-8"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-60 overflow-y-auto pb-2">
          {loading && (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">Carregando...</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              Nenhum {tab === 'lead' ? 'lead' : 'paciente'} encontrado.
            </div>
          )}
          {filtered.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => pick(o)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <span className="truncate">
                <span className="font-medium">{o.name}</span>
                {o.phone && <span className="ml-2 text-muted-foreground">{o.phone}</span>}
              </span>
              {value?.id === o.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
