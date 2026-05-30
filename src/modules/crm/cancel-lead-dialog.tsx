'use client'

import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  leadName: string
  pending: boolean
  /** Confirmado com motivo → o board persiste o move com o motivo. */
  onConfirm: (reason: string) => void
  /** Cancelado/fechado → o board reverte o card. */
  onCancel: () => void
}

/**
 * feat5 — Dialog BLOQUEANTE ao arrastar um card para "Cancelado". Exige o motivo
 * do cancelamento. Cancelar/fechar devolve o card para a etapa de origem.
 */
export function CancelLeadDialog({
  open,
  onOpenChange,
  leadName,
  pending,
  onConfirm,
  onCancel,
}: Props) {
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (open) setReason('')
  }, [open])

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onOpenChange(false)
          onCancel()
        } else onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-md" aria-describedby="cancel-lead-desc">
        <DialogHeader>
          <DialogTitle>Cancelar — {leadName}</DialogTitle>
          <DialogDescription id="cancel-lead-desc">
            Informe o motivo do cancelamento. Ele fica registrado no card e no agendamento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <Label htmlFor="cancel-reason">Motivo do cancelamento *</Label>
          <textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Ex: desistiu, preço, escolheu concorrente, remarcou por conta própria..."
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false)
              onCancel()
            }}
            disabled={pending}
          >
            Voltar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => onConfirm(reason.trim())}
            disabled={pending || !reason.trim()}
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar cancelamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
