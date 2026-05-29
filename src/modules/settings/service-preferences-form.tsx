'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { updateActivityCalendarSyncAction } from '@/server/actions/user-preferences-actions'

type Mode = 'AUTO' | 'ASK' | 'NEVER'

type Props = {
  initial: Mode
}

const OPTIONS: { value: Mode; label: string; description: string }[] = [
  {
    value: 'AUTO',
    label: 'Adicionar atividades automaticamente ao calendário',
    description:
      'Toda atividade criada vira um evento no calendário pessoal do responsável. Sem checkbox no diálogo.',
  },
  {
    value: 'ASK',
    label: 'Perguntar para adicionar atividades ao calendário',
    description:
      'Aparece uma caixa "Adicionar ao calendário" no diálogo de Nova atividade. Você decide a cada criação.',
  },
  {
    value: 'NEVER',
    label: 'Nunca adicionar atividade ao calendário',
    description: 'Atividades e calendário ficam completamente independentes.',
  },
]

export function ServicePreferencesForm({ initial }: Props) {
  const router = useRouter()
  const [value, setValue] = useState<Mode>(initial)
  const [pending, startTransition] = useTransition()

  function save() {
    if (value === initial) return
    startTransition(async () => {
      const res = await updateActivityCalendarSyncAction(value)
      if (!res.success) {
        toast.error(res.error.message)
        return
      }
      toast.success('Preferência salva')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label className="text-sm font-medium">Sincronização de atividades com o calendário</Label>
        <p className="text-xs text-muted-foreground">
          Define como atividades novas viram eventos no seu calendário pessoal.
        </p>
      </div>

      <div className="space-y-2">
        {OPTIONS.map((opt) => {
          const isSelected = value === opt.value
          return (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                isSelected ? 'border-primary bg-primary/5' : 'hover:bg-accent'
              }`}
            >
              <input
                type="radio"
                name="activity-calendar-sync"
                aria-label={opt.label}
                value={opt.value}
                checked={isSelected}
                onChange={() => setValue(opt.value)}
                className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
              />
              <div className="flex-1 space-y-0.5">
                <div className="text-sm font-medium">{opt.label}</div>
                <p className="text-xs text-muted-foreground">{opt.description}</p>
              </div>
            </label>
          )
        })}
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={pending || value === initial}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar preferência
        </Button>
      </div>
    </div>
  )
}
