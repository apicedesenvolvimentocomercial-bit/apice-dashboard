'use client'

import { Loader2, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  deletePipelineDealAction,
  updatePipelineDealAction,
} from '@/server/actions/pipeline-deal-actions'
import type { PipelineDealView } from './types'

type Props = {
  open: boolean
  deal: PipelineDealView | null
  onClose: () => void
}

function toDateInput(d: Date | null): string {
  if (!d) return ''
  const date = new Date(d)
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function DealDrawer({ open, deal, onClose }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [value, setValue] = useState('')
  const [probability, setProbability] = useState('')
  const [expectedCloseAt, setExpectedCloseAt] = useState('')
  const [notes, setNotes] = useState('')

  // Sync state when deal changes
  useStateSyncOnDeal(deal, setValue, setProbability, setExpectedCloseAt, setNotes)

  function save() {
    if (!deal) return
    startTransition(async () => {
      const result = await updatePipelineDealAction({
        dealId: deal.id,
        value: value ? Number(value) : undefined,
        probability: probability ? Number(probability) : undefined,
        expectedCloseAt: expectedCloseAt || undefined,
        notes: notes || undefined,
      })
      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      toast.success('Negociação atualizada')
      onClose()
      router.refresh()
    })
  }

  function remove() {
    if (!deal) return
    startTransition(async () => {
      const result = await deletePipelineDealAction({ dealId: deal.id })
      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      toast.success('Negociação removida')
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{deal?.client.name ?? 'Negociação'}</DialogTitle>
          <DialogDescription>Atualize os dados da negociação.</DialogDescription>
        </DialogHeader>
        {deal && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valor (R$)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Probabilidade (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="5"
                  value={probability}
                  onChange={(e) => setProbability(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Previsão de fechamento</Label>
              <DateInput
                value={expectedCloseAt}
                onChange={(e) => setExpectedCloseAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <textarea
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            {deal.stage === 'LOST' && deal.lostReason && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <strong>Motivo da perda:</strong> {deal.lostReason}
              </div>
            )}
          </div>
        )}
        <DialogFooter className="flex justify-between sm:justify-between">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={pending}>
                <Trash2 className="mr-2 h-4 w-4" />
                Remover
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remover negociação?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação remove o card do pipeline. A clínica continua existindo no sistema.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={remove}>Remover</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function useStateSyncOnDeal(
  deal: PipelineDealView | null,
  setValue: (v: string) => void,
  setProbability: (v: string) => void,
  setExpectedCloseAt: (v: string) => void,
  setNotes: (v: string) => void
) {
  useEffect(() => {
    if (!deal) return
    setValue(deal.value != null ? String(deal.value) : '')
    setProbability(deal.probability != null ? String(deal.probability) : '')
    setExpectedCloseAt(toDateInput(deal.expectedCloseAt))
    setNotes(deal.notes ?? '')
  }, [deal, setValue, setProbability, setExpectedCloseAt, setNotes])
}
