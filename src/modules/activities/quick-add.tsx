'use client'

import { Zap } from 'lucide-react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { quickAddActivityAction } from '@/server/actions/activity-actions'

type Props = {
  /** Pasta atual: usuário que receberá a tarefa rápida. Default: criador. */
  assignedToId?: string | null
  /** Nome curto da pasta para o placeholder. */
  folderLabel?: string | null
  /** Pref do usuário sobre adicionar a tarefa ao calendário. */
  activityCalendarSync?: 'AUTO' | 'ASK' | 'NEVER'
}

export function QuickAdd({ assignedToId, folderLabel, activityCalendarSync = 'ASK' }: Props) {
  const [title, setTitle] = useState('')
  const [addToCalendar, setAddToCalendar] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    startTransition(async () => {
      const res = await quickAddActivityAction(title, {
        assignedToId: assignedToId ?? null,
        addToCalendar: activityCalendarSync === 'ASK' ? addToCalendar : undefined,
      })
      if (res.success) {
        toast.success('Tarefa criada')
        setTitle('')
        setAddToCalendar(false)
        router.refresh()
      } else {
        toast.error(res.error.message)
      }
    })
  }

  const placeholder = folderLabel
    ? `O que precisa ser feito? Cai em ${folderLabel}`
    : 'O que precisa ser feito hoje?'

  return (
    <div className="space-y-1.5">
      <form
        onSubmit={submit}
        className="flex items-center gap-2.5 rounded-xl border bg-background px-3.5 py-2.5"
      >
        <Zap className="h-4 w-4 shrink-0 text-emerald-500" />
        <input
          type="text"
          placeholder={placeholder}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={pending}
          className="flex-1 border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
        />
        <span className="hidden rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground sm:inline">
          ⏎ Enter
        </span>
      </form>

      {activityCalendarSync === 'ASK' && (
        <label className="ml-2 inline-flex cursor-pointer select-none items-center gap-1.5 text-xs text-foreground">
          <input
            type="checkbox"
            checked={addToCalendar}
            onChange={(e) => setAddToCalendar(e.target.checked)}
            disabled={pending}
            className="h-3.5 w-3.5 cursor-pointer accent-emerald-500"
          />
          Adicionar ao calendário
        </label>
      )}
    </div>
  )
}
