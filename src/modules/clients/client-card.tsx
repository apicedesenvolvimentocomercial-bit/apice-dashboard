'use client'

import type { ClientStatus } from '@prisma/client'
import { Building2, MoreHorizontal, Send, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { deleteClientAction } from '@/server/actions/client-actions'
import { getInitials } from '@/lib/utils'

import { InviteClinicUserDialog } from './invite-clinic-user-dialog'

const STATUS_LABELS: Record<ClientStatus, string> = {
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  ONBOARDING: 'Onboarding',
  CHURNED: 'Churned',
}

const STATUS_VARIANTS: Record<
  ClientStatus,
  'success' | 'warning' | 'info' | 'critical' | 'secondary'
> = {
  ACTIVE: 'success',
  INACTIVE: 'secondary',
  ONBOARDING: 'info',
  CHURNED: 'critical',
}

function HealthRing({ score }: { score: number | null }) {
  if (score == null) return <span className="text-xs text-muted-foreground">—</span>

  const color =
    score >= 81
      ? 'text-green-600'
      : score >= 61
        ? 'text-blue-500'
        : score >= 41
          ? 'text-amber-500'
          : 'text-red-600'

  return <span className={`text-lg font-bold ${color}`}>{score}</span>
}

type Props = {
  client: {
    id: string
    name: string
    city: string | null
    state: string | null
    status: ClientStatus
    healthScore: number | null
    _count: { users: number }
  }
}

export function ClientCard({ client }: Props) {
  const router = useRouter()
  const [inviteOpen, setInviteOpen] = useState(false)

  async function handleDelete() {
    if (!confirm(`Desativar "${client.name}"? Esta ação pode ser revertida.`)) return
    const result = await deleteClientAction(client.id)
    if (!result.success) {
      toast.error(result.error.message)
    } else {
      toast.success('Clínica desativada')
      router.refresh()
    }
  }

  return (
    <>
      <Card className="group relative transition-shadow hover:shadow-md">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 rounded-lg bg-primary/10">
              <AvatarFallback className="rounded-lg bg-primary/10 text-sm font-semibold text-primary">
                {getInitials(client.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold leading-tight">{client.name}</p>
              {(client.city || client.state) && (
                <p className="text-xs text-muted-foreground">
                  {[client.city, client.state].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANTS[client.status]}>{STATUS_LABELS[client.status]}</Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Mais opções">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => router.push(`/clients/${client.id}/overview`)}>
                  <Building2 className="mr-2 h-4 w-4" />
                  Ver dashboard
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setInviteOpen(true)}>
                  <Send className="mr-2 h-4 w-4" />
                  Convidar dono
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={handleDelete}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Desativar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {client._count.users} {client._count.users === 1 ? 'usuário' : 'usuários'}
            </div>
            <div className="flex flex-col items-end">
              <span className="text-xs text-muted-foreground">Health Score</span>
              <HealthRing score={client.healthScore} />
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full"
            onClick={() => router.push(`/clients/${client.id}/overview`)}
          >
            Ver dashboard
          </Button>
        </CardContent>
      </Card>
      <InviteClinicUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        clientId={client.id}
        clientName={client.name}
        lockedRole="CLIENT_OWNER"
      />
    </>
  )
}
