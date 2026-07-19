'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
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
import { updateProfileAction } from '@/server/actions/settings-actions'

const schema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres'),
})

type Values = z.infer<typeof schema>

type Props = {
  initial: { name: string; email: string }
}

export function ProfileForm({ initial }: Props) {
  const router = useRouter()
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: initial.name },
  })

  async function onSubmit(values: Values) {
    const result = await updateProfileAction(values)
    if (!result.success) {
      toast.error(result.error.message)
      return
    }
    toast.success('Perfil atualizado')
    router.refresh()
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormItem>
          <FormLabel>Email</FormLabel>
          <FormControl>
            <Input value={initial.email} disabled />
          </FormControl>
        </FormItem>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar
        </Button>
      </form>
    </Form>
  )
}
