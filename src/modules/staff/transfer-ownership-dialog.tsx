'use client'

import { Crown, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { transferOwnershipAction } from '@/server/actions/staff-actions'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: { id: string; name: string; role: string } | null
}

export function TransferOwnershipDialog({ open, onOpenChange, target }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleConfirm() {
    if (!target) return
    startTransition(async () => {
      const result = await transferOwnershipAction({ targetUserId: target.id })
      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      toast.success(`Titularidade transferida para ${target.name}`)
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" />
            Transferir titularidade
          </DialogTitle>
          <DialogDescription className="space-y-3 pt-2 text-sm">
            <span className="block">
              <strong>{target?.name}</strong> vai se tornar o novo dono da organização e receber a
              coroa.
              {target?.role === 'STAFF' && (
                <> O cargo dele será promovido de STAFF para ADMIN automaticamente.</>
              )}
            </span>
            <span className="block text-muted-foreground">
              Você continuará como ADMIN comum, mas perderá a coroa e os privilégios de dono (não
              poderá mais transferir titularidade, e seu cargo/ativação passarão a poder ser
              alterados por outros ADMINs).
            </span>
            <span className="block font-medium text-destructive">
              Esta ação não pode ser desfeita pelo sistema — só o novo dono poderá te devolver a
              titularidade.
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar transferência
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
