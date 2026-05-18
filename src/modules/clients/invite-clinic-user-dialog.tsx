'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { inviteClientOwnerAction } from '@/server/actions/client-actions'

const schema = z.object({
  email: z.string().email('Email inválido'),
  role: z.enum(['CLIENT_OWNER', 'CLIENT_STAFF']),
})

type Values = z.infer<typeof schema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  clientName: string
  defaultEmail?: string
}

export function InviteClinicUserDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  defaultEmail,
}: Props) {
  const router = useRouter()
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: defaultEmail ?? '', role: 'CLIENT_OWNER' },
  })

  useEffect(() => {
    if (open) {
      form.reset({ email: defaultEmail ?? '', role: 'CLIENT_OWNER' })
    }
  }, [open, defaultEmail, form])

  async function onSubmit(values: Values) {
    const result = await inviteClientOwnerAction({
      clientId,
      email: values.email,
      role: values.role,
    })
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
          <DialogTitle>Convidar usuário</DialogTitle>
          <DialogDescription>
            Envie um convite para acessar <strong>{clientName}</strong>. O usuário receberá um email
            com link para definir a senha.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="pessoa@clinica.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cargo</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="CLIENT_OWNER">Dono — acesso total à clínica</SelectItem>
                      <SelectItem value="CLIENT_STAFF">Funcionário — acesso operacional</SelectItem>
                    </SelectContent>
                  </Select>
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
