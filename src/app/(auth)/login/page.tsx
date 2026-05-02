import type { Metadata } from 'next'
import { Suspense } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { LoginForm } from '@/modules/settings/login-form'

export const metadata: Metadata = { title: 'Login | KPI Clinic OS' }

export default function LoginPage() {
  return (
    <div className="space-y-6 rounded-xl border bg-white p-8 shadow-sm dark:bg-zinc-900">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">KPI Clinic OS</h1>
        <p className="text-sm text-muted-foreground">Entre com sua conta para continuar</p>
      </div>
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
