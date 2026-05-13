import type { Metadata } from 'next'
import Link from 'next/link'

import { ResetPasswordForm } from '@/modules/settings/reset-password-form'

export const metadata: Metadata = { title: 'Redefinir senha | KPI Clinic OS' }

type Props = { searchParams: Promise<{ token?: string }> }

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token } = await searchParams

  if (!token) {
    return (
      <div className="space-y-4 rounded-xl border bg-white p-8 text-center shadow-sm dark:bg-zinc-900">
        <h1 className="text-2xl font-bold">Link inválido</h1>
        <p className="text-sm text-muted-foreground">
          O link de recuperação não contém um token. Solicite um novo.
        </p>
        <Link href="/forgot-password" className="inline-block text-sm text-primary underline">
          Solicitar novo link
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6 rounded-xl border bg-white p-8 shadow-sm dark:bg-zinc-900">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">Redefinir senha</h1>
        <p className="text-sm text-muted-foreground">Escolha uma nova senha para sua conta</p>
      </div>
      <ResetPasswordForm token={token} />
    </div>
  )
}
