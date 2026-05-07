'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { inviteClientOwnerAction } from '@/server/actions/client-actions'

const schema = z.object({
  email: z.string().email('Email inválido'),
})

type Values = z.infer<typeof schema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  clientName: string
}

export function InviteOwnerDialog({ open, onOpenChange, clientId, clientName }: Props) {
  const router = useRouter()
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  })

  async function onSubmit(values: Values) {
    const result = await inviteClientOwnerAction({ clientId, email: values.email })
    if (!result.success) {
      toast.error(result.error.message)
      return
    }
    toast.success('Convite enviado com sucesso!')
    onOpenChange(false)
    form.reset()
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convidar dono da clínica</DialogTitle>
          <DialogDescription>
            Envie um convite para o dono de <strong>{clientName}</strong> acessar o sistema.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email do dono</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="dono@clinica.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar convite
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
