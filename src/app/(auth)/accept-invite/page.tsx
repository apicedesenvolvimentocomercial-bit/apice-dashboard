import type { Metadata } from 'next'
import { Suspense } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { AcceptInviteForm } from '@/modules/settings/accept-invite-form'

export const metadata: Metadata = { title: 'Aceitar convite ' }

export default function AcceptInvitePage() {
  return (
    <div className="space-y-6 rounded-xl border bg-card p-8 text-card-foreground shadow-sm">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">Criar sua conta</h1>
        <p className="text-sm text-muted-foreground">Você foi convidado para o Senno</p>
      </div>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <AcceptInviteForm />
      </Suspense>
    </div>
  )
}
