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

const ROLE_VALUES = ['CLIENT_OWNER', 'CLIENT_STAFF'] as const
type ClinicRole = (typeof ROLE_VALUES)[number]

const schema = z.object({
  email: z.string().email('Email inválido'),
  role: z.enum(ROLE_VALUES),
})

type Values = z.infer<typeof schema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  clientName: string
  defaultEmail?: string
  /**
   * Quando definido, esconde o seletor de cargo e força esse role no envio.
   * Usado pelo "Convidar dono" do card de clínica (sempre CLIENT_OWNER) para
   * manter o fluxo curto. Sem `lockedRole`, mostra o seletor.
   */
  lockedRole?: ClinicRole
}

export function InviteClinicUserDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  defaultEmail,
  lockedRole,
}: Props) {
  const router = useRouter()
  const initialRole: ClinicRole = lockedRole ?? 'CLIENT_OWNER'

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: defaultEmail ?? '', role: initialRole },
  })

  useEffect(() => {
    if (open) form.reset({ email: defaultEmail ?? '', role: initialRole })
  }, [open, defaultEmail, initialRole, form])

  async function onSubmit(values: Values) {
    const result = await inviteClientOwnerAction({
      clientId,
      email: values.email,
      role: lockedRole ?? values.role,
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

  const isOwnerOnly = lockedRole === 'CLIENT_OWNER'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isOwnerOnly ? 'Convidar dono da clínica' : 'Convidar usuário'}</DialogTitle>
          <DialogDescription>
            {isOwnerOnly ? (
              <>
                Envie um convite para o dono de <strong>{clientName}</strong> acessar o sistema.
              </>
            ) : (
              <>
                Envie um convite para acessar <strong>{clientName}</strong>. O usuário receberá um
                email com link para definir a senha.
              </>
            )}
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
                    <Input
                      type="email"
                      placeholder={isOwnerOnly ? 'dono@clinica.com' : 'pessoa@clinica.com'}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {!lockedRole && (
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
                        <SelectItem value="CLIENT_STAFF">
                          Funcionário — acesso operacional
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
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
