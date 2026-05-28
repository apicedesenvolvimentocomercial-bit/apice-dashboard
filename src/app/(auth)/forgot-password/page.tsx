import type { Metadata } from 'next'

import { ForgotPasswordForm } from '@/modules/settings/forgot-password-form'

export const metadata: Metadata = { title: 'Esqueci a senha | Senno' }

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6 rounded-xl border bg-card p-8 text-card-foreground shadow-sm">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">Recuperar senha</h1>
        <p className="text-sm text-muted-foreground">
          Enviaremos um link de recuperação para seu e-mail
        </p>
      </div>
      <ForgotPasswordForm />
    </div>
  )
}
