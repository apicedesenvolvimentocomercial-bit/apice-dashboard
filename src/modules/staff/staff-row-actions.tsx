'use client'

import { Crown, Loader2, MoreHorizontal } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { setStaffActiveAction, updateStaffRoleAction } from '@/server/actions/staff-actions'

type Props = {
  userId: string
  isActive: boolean
  role: 'ADMIN' | 'STAFF'
  isSelf: boolean
  /** Esta linha é o dono atual da organização. */
  isOwner: boolean
  /** O usuário logado é o dono — pode iniciar a transferência. */
  currentUserIsOwner: boolean
  onTransferOwnership: () => void
}

export function StaffRowActions({
  userId,
  isActive,
  role,
  isSelf,
  isOwner,
  currentUserIsOwner,
  onTransferOwnership,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  function toggleActive() {
    startTransition(async () => {
      const result = await setStaffActiveAction({ userId, isActive: !isActive })
      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      toast.success(!isActive ? 'Funcionário reativado' : 'Funcionário desativado')
      setOpen(false)
      router.refresh()
    })
  }

  function changeRole(newRole: 'ADMIN' | 'STAFF') {
    if (newRole === role) {
      setOpen(false)
      return
    }
    startTransition(async () => {
      const result = await updateStaffRoleAction({ userId, role: newRole })
      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      toast.success('Cargo atualizado')
      setOpen(false)
      router.refresh()
    })
  }

  // O dono não pode ter cargo alterado nem ser desativado por terceiros.
  // Para "remover" o dono, ele precisa transferir a titularidade primeiro.
  // Conceder/remover acesso total (ADMIN) é "mexer em ADMIN" → só o titular
  // (ledger agency-roles: ADMIN não mexe em ADMIN). O servidor reforça isto.
  const canChangeRole = !isOwner && !isSelf && currentUserIsOwner
  const canToggleActive = !isOwner && !isSelf
  const canTransferToThisUser = currentUserIsOwner && !isSelf && !isOwner && isActive

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={pending} aria-label="Ações">
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MoreHorizontal className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {role === 'STAFF' ? (
          <DropdownMenuItem onSelect={() => changeRole('ADMIN')} disabled={!canChangeRole}>
            Conceder acesso total
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => changeRole('STAFF')} disabled={!canChangeRole}>
            Remover acesso total
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={toggleActive} disabled={!canToggleActive}>
          {isActive ? 'Desativar' : 'Reativar'}
        </DropdownMenuItem>
        {currentUserIsOwner && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => onTransferOwnership()}
              disabled={!canTransferToThisUser}
            >
              <Crown className="mr-2 h-4 w-4 text-amber-500" />
              Transferir titularidade
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
