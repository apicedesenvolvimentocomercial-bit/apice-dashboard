import type { Metadata } from 'next'
import { Suspense } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { LoginForm } from '@/modules/settings/login-form'

export const metadata: Metadata = { title: 'Login' }

export default function LoginPage() {
  return (
    <div className="space-y-6 rounded-xl border bg-card p-8 text-card-foreground shadow-sm">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">Senno</h1>
        <p className="text-sm text-muted-foreground">Entre com sua conta para continuar</p>
      </div>
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
