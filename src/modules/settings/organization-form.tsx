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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { updateOrganizationAction } from '@/server/actions/settings-actions'

const schema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres'),
})

type Values = z.infer<typeof schema>

type Props = {
  initial: { name: string; slug: string }
}

export function OrganizationForm({ initial }: Props) {
  const router = useRouter()
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: initial.name },
  })

  async function onSubmit(values: Values) {
    const result = await updateOrganizationAction(values)
    if (!result.success) {
      toast.error(result.error.message)
      return
    }
    toast.success('Organização atualizada')
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
              <FormLabel>Nome da organização</FormLabel>
              <FormControl>
                <Input placeholder="Acme Consultoria" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormItem>
          <FormLabel>Slug</FormLabel>
          <FormControl>
            <Input value={initial.slug} disabled />
          </FormControl>
          <FormDescription>
            Identificador único da sua organização. Não pode ser alterado.
          </FormDescription>
        </FormItem>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar
        </Button>
      </form>
    </Form>
  )
}
