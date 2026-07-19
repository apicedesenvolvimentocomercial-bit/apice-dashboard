'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { signIn } from '@/lib/auth-client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
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
import { acceptInviteAction } from '@/server/actions/auth-actions'

const schema = z
  .object({
    name: z.string().min(2, 'Mínimo 2 caracteres'),
    password: z.string().min(8, 'Mínimo 8 caracteres'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Senhas não coincidem',
    path: ['confirmPassword'],
  })

type Values = z.infer<typeof schema>

export function AcceptInviteForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', password: '', confirmPassword: '' },
  })

  async function onSubmit(values: Values) {
    if (!token) {
      toast.error('Token de convite inválido ou expirado')
      return
    }
    setLoading(true)
    const result = await acceptInviteAction({ token, name: values.name, password: values.password })
    if (!result.success) {
      toast.error(result.error.message)
      setLoading(false)
      return
    }
    await signIn('credentials', {
      email: result.data.email,
      password: values.password,
      redirect: false,
    })
    router.push('/dashboard')
    router.refresh()
  }

  if (!token) {
    return <p className="text-center text-sm text-destructive">Token de convite inválido.</p>
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Seu nome</FormLabel>
              <FormControl>
                <Input placeholder="João Silva" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Criar senha</FormLabel>
              <FormControl>
                <Input type="password" placeholder="••••••••" {...field} />
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
              <FormLabel>Confirmar senha</FormLabel>
              <FormControl>
                <Input type="password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Criar conta e entrar
        </Button>
      </form>
    </Form>
  )
}
