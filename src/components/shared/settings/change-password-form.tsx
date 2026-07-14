'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { signOut } from '@/lib/auth-client'
import { changePasswordAction } from '@/server/actions/settings-actions'

const schema = z
  .object({
    currentPassword: z.string().min(6, 'Senha atual obrigatória'),
    newPassword: z.string().min(8, 'Nova senha deve ter pelo menos 8 caracteres'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
  })

type Values = z.infer<typeof schema>

export function ChangePasswordForm() {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })

  async function onSubmit(values: Values) {
    const result = await changePasswordAction({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    })
    if (!result.success) {
      toast.error(result.error.message)
      return
    }
    // A troca de senha invalidou TODAS as sessões (inclusive esta). Avisa e
    // força novo login — sem isso o próximo request cairia num 401 seco.
    form.reset()
    toast.success('Senha alterada. Faça login novamente para continuar.')
    setTimeout(() => signOut({ callbackUrl: '/login' }), 1500)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Senha atual</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nova senha</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirmar nova senha</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Alterar senha
        </Button>
      </form>
    </Form>
  )
}
