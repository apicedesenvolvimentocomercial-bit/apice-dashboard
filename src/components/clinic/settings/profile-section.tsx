'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Lock } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { signOut } from '@/lib/auth-client'
import { changePasswordAction, updateProfileAction } from '@/server/actions/settings-actions'

import {
  FieldError,
  SETTINGS_BTN_PRIMARY,
  SETTINGS_INPUT,
  SETTINGS_LABEL,
  SettingsSectionCard,
} from './section-card'

/**
 * Seção Perfil — redesign Senno (Configurações-handoff §7). Nome + e-mail no
 * grid 2col e o bloco "Alterar senha" (3col) no MESMO card, com um único
 * "Salvar alterações" no rodapé (o protótipo unifica os dois forms antigos).
 *
 * Desvios documentados vs. protótipo:
 * - O e-mail é o LOGIN e não é editável no produto (não existe action p/
 *   trocá-lo) — campo desabilitado, não "E-mail para visualização".
 * - Senha preenchida → `changePasswordAction` invalida TODAS as sessões
 *   (sessionVersion), então o submit avisa e força novo login; por isso o
 *   nome é salvo ANTES da senha (a sessão morre no segundo passo).
 */

const schema = z
  .object({
    name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres'),
    currentPassword: z.string(),
    newPassword: z.string(),
    confirmPassword: z.string(),
  })
  .superRefine((d, ctx) => {
    // Bloco de senha é opcional em conjunto: vazio = só perfil; qualquer campo
    // preenchido exige os três válidos.
    if (!d.currentPassword && !d.newPassword && !d.confirmPassword) return
    if (d.currentPassword.length < 6) {
      ctx.addIssue({
        code: 'custom',
        path: ['currentPassword'],
        message: 'Senha atual obrigatória',
      })
    }
    if (d.newPassword.length < 8) {
      ctx.addIssue({ code: 'custom', path: ['newPassword'], message: 'Mínimo 8 caracteres' })
    }
    if (d.newPassword !== d.confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: 'As senhas não coincidem',
      })
    }
  })

type Values = z.infer<typeof schema>

type Props = {
  initial: { name: string; email: string }
}

export function ProfileSection({ initial }: Props) {
  const router = useRouter()
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial.name,
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  })

  async function onSubmit(values: Values) {
    if (values.name !== initial.name) {
      const res = await updateProfileAction({ name: values.name })
      if (!res.success) {
        toast.error(res.error.message)
        return
      }
    }

    if (values.newPassword) {
      const res = await changePasswordAction({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      })
      if (!res.success) {
        toast.error(res.error.message)
        return
      }
      // A troca invalidou todas as sessões (inclusive esta) — avisa e força
      // novo login; sem isso o próximo request cairia num 401 seco.
      reset({ name: values.name, currentPassword: '', newPassword: '', confirmPassword: '' })
      toast.success('Senha alterada. Faça login novamente para continuar.')
      setTimeout(() => signOut({ callbackUrl: '/login' }), 1500)
      return
    }

    toast.success('Perfil atualizado')
    router.refresh()
  }

  return (
    <SettingsSectionCard
      title="Perfil"
      description="Atualize seus dados de acesso e como seu nome aparece para a equipe."
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {/* Grid de identidade (§7.1) */}
        <div className="grid grid-cols-1 gap-x-[18px] gap-y-4 lg:grid-cols-2">
          <div>
            <label htmlFor="profile-name" className={SETTINGS_LABEL}>
              Nome pessoal
            </label>
            <input id="profile-name" type="text" className={SETTINGS_INPUT} {...register('name')} />
            <FieldError message={errors.name?.message} />
          </div>
          <div>
            <label htmlFor="profile-email" className={SETTINGS_LABEL}>
              E-mail de acesso
            </label>
            <input
              id="profile-email"
              type="email"
              className={SETTINGS_INPUT}
              value={initial.email}
              disabled
            />
            <p className="m-0 mt-1.5 text-xs text-muted-foreground">
              É o seu login — não pode ser alterado.
            </p>
          </div>
        </div>

        {/* Bloco "Alterar senha" (§7.2) */}
        <div className="mt-6 border-t border-border pt-[22px]">
          <div className="mb-4 flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h3 className="m-0 text-[13.5px] font-semibold">Alterar senha</h3>
          </div>
          <div className="grid grid-cols-1 gap-x-[18px] gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="profile-current-password" className={SETTINGS_LABEL}>
                Senha atual
              </label>
              <input
                id="profile-current-password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                className={SETTINGS_INPUT}
                {...register('currentPassword')}
              />
              <FieldError message={errors.currentPassword?.message} />
            </div>
            <div>
              <label htmlFor="profile-new-password" className={SETTINGS_LABEL}>
                Nova senha
              </label>
              <input
                id="profile-new-password"
                type="password"
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
                className={SETTINGS_INPUT}
                {...register('newPassword')}
              />
              <FieldError message={errors.newPassword?.message} />
            </div>
            <div>
              <label htmlFor="profile-confirm-password" className={SETTINGS_LABEL}>
                Confirmar nova senha
              </label>
              <input
                id="profile-confirm-password"
                type="password"
                placeholder="Repita a nova senha"
                autoComplete="new-password"
                className={SETTINGS_INPUT}
                {...register('confirmPassword')}
              />
              <FieldError message={errors.confirmPassword?.message} />
            </div>
          </div>
        </div>

        {/* Rodapé de ação (§7.3) */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <p className="m-0 text-[12.5px] text-muted-foreground">
            Alterações de nome e senha são aplicadas imediatamente.
          </p>
          <button type="submit" className={SETTINGS_BTN_PRIMARY} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Salvar alterações
          </button>
        </div>
      </form>
    </SettingsSectionCard>
  )
}
