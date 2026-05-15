'use client'

import { Plus, Users } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { StaffUser } from '@/server/repositories/user-repository'

import { InviteStaffDialog } from './invite-staff-dialog'
import { PermissionMatrix } from './permission-matrix'
import { StaffRowActions } from './staff-row-actions'

type Props = {
  rows: StaffUser[]
  currentUserId: string
}

export function StaffList({ rows, currentUserId }: Props) {
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const editing = editingId ? rows.find((r) => r.id === editingId) : null

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Equipe</h1>
          <p className="text-muted-foreground">
            {rows.length} {rows.length === 1 ? 'membro' : 'membros'} na organização.
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Convidar funcionário
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
          <Users className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <h3 className="text-lg font-medium">Nenhum funcionário ainda</h3>
          <p className="mb-6 mt-1 text-sm text-muted-foreground">
            Convide o primeiro membro da sua equipe.
          </p>
          <Button onClick={() => setInviteOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Convidar
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Nome</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Cargo</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Último login</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((user) => (
                <tr key={user.id} className="border-t">
                  <td className="px-4 py-3">
                    <div className="font-medium">
                      {user.name}
                      {user.id === currentUserId && (
                        <span className="ml-2 text-xs text-muted-foreground">(você)</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'}>
                      {user.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={user.isActive ? 'default' : 'outline'}>
                      {user.isActive ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleDateString('pt-BR')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <StaffRowActions
                      userId={user.id}
                      isActive={user.isActive}
                      role={user.role as 'ADMIN' | 'STAFF'}
                      isSelf={user.id === currentUserId}
                      onEditPermissions={() => setEditingId(user.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <InviteStaffDialog open={inviteOpen} onOpenChange={setInviteOpen} />

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Permissões de {editing?.name}</DialogTitle>
            <DialogDescription>
              Ajuste finamente o que este funcionário pode ler, escrever ou excluir em cada módulo.
              Os defaults do cargo já são aplicados — sobreposições aqui têm prioridade.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <PermissionMatrix
              userId={editing.id}
              initial={editing.permissions}
              onSaved={() => setEditingId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
