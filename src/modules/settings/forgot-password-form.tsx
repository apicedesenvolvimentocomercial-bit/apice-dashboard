'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import Link from 'next/link'
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
import { forgotPasswordAction } from '@/server/actions/auth-actions'

const schema = z.object({
  email: z.string().email('Email inválido'),
})

type Values = z.infer<typeof schema>

export function ForgotPasswordForm() {
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  })

  async function onSubmit(values: Values) {
    setLoading(true)
    await forgotPasswordAction(values)
    setLoading(false)
    setSent(true)
    toast.success('Se o email estiver cadastrado, você receberá as instruções em breve.')
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-muted-foreground">Verifique sua caixa de entrada e spam.</p>
        <Link href="/login" className="text-sm text-primary underline">
          Voltar para o login
        </Link>
      </div>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="seu@email.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Enviar link de recuperação
        </Button>
        <div className="text-center">
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
            Voltar para o login
          </Link>
        </div>
      </form>
    </Form>
  )
}
