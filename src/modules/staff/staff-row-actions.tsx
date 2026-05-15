'use client'

import { Loader2, MoreHorizontal } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { setStaffActiveAction, updateStaffRoleAction } from '@/server/actions/staff-actions'

type Props = {
  userId: string
  isActive: boolean
  role: 'ADMIN' | 'STAFF'
  isSelf: boolean
  onEditPermissions: () => void
}

export function StaffRowActions({ userId, isActive, role, isSelf, onEditPermissions }: Props) {
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
        <DropdownMenuItem onSelect={() => onEditPermissions()} disabled={role === 'ADMIN'}>
          Editar permissões
        </DropdownMenuItem>
        {role === 'STAFF' ? (
          <DropdownMenuItem onSelect={() => changeRole('ADMIN')} disabled={isSelf}>
            Tornar ADMIN
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => changeRole('STAFF')} disabled={isSelf}>
            Rebaixar para STAFF
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={toggleActive} disabled={isSelf}>
          {isActive ? 'Desativar' : 'Reativar'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
