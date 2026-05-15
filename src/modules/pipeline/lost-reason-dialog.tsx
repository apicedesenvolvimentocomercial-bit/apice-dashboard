'use client'

import { Loader2 } from 'lucide-react'
import { useState } from 'react'

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
  pending: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void
}

export function LostReasonDialog({ open, pending, onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState('')

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar como perdida</DialogTitle>
          <DialogDescription>
            Informe por que essa negociação foi perdida. Esse campo aparece nos relatórios e ajuda a
            entender padrões de churn no funil comercial.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="lost-reason">Motivo</Label>
          <textarea
            id="lost-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: optaram por concorrente, sem orçamento, sem retorno..."
            className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(reason.trim())}
            disabled={pending || reason.trim().length < 3}
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar perda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
