'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { signIn } from '@/lib/auth-client'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { getLoginCooldownAction } from '@/server/actions/login-throttle-actions'

import Link from 'next/link'

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

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
})

type LoginValues = z.infer<typeof loginSchema>

// mm:ss (ou só Xs abaixo de 1 min) para o aviso de cooldown.
function formatCooldown(totalSec: number): string {
  if (totalSec < 60) return `${totalSec}s`
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}min${s > 0 ? ` ${String(s).padStart(2, '0')}s` : ''}`
}

export function LoginForm() {
  const searchParams = useSearchParams()
  // Default '/' deixa o root page + middleware despacharem o usuário para a
  // home correta conforme o role (ADMIN -> /dashboard, CLIENT_OWNER -> /overview).
  const callbackUrl = searchParams.get('callbackUrl') ?? '/'
  const [loading, setLoading] = useState(false)
  // Segundos de cooldown anti-brute-force (0 = liberado). Conta regressiva na UI.
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown((s) => (s <= 1 ? 0 : s - 1)), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  async function onSubmit(values: LoginValues) {
    if (cooldown > 0) return
    setLoading(true)
    const result = await signIn('credentials', {
      email: values.email,
      password: values.password,
      redirect: false,
    })

    if (result?.error) {
      setLoading(false)
      // Pergunta ao servidor se a origem entrou em cooldown (anti-brute-force) p/
      // avisar o tempo de espera em vez de só repetir "senha inválida".
      const secs = await getLoginCooldownAction(values.email).catch(() => 0)
      if (secs > 0) {
        setCooldown(secs)
        toast.error(`Muitas tentativas. Aguarde ${formatCooldown(secs)} e tente novamente.`)
      } else {
        toast.error('Email ou senha inválidos')
      }
      return
    }

    // Full reload para descartar o RSC cache do Next.js que pode trazer estado
    // do usuário anterior (ex.: admin -> dono na mesma aba) e causar loop de
    // redirect no middleware antes do cookie novo ser lido.
    window.location.assign(callbackUrl)
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
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Senha</FormLabel>
              <FormControl>
                <Input type="password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex items-center justify-between">
          <span />
          <Link
            href="/forgot-password"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Esqueci a senha
          </Link>
        </div>
        <Button type="submit" className="w-full" disabled={loading || cooldown > 0}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {cooldown > 0 ? `Aguarde ${formatCooldown(cooldown)}` : 'Entrar'}
        </Button>
        {cooldown > 0 && (
          <p className="text-center text-sm text-destructive">
            Muitas tentativas de login. Por segurança, aguarde {formatCooldown(cooldown)} antes de
            tentar de novo.
          </p>
        )}
      </form>
    </Form>
  )
}
