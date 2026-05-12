'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
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
import { createLeadAction } from '@/server/actions/lead-actions'
import type { KanbanStage } from './types'

const schema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  phone: z.string().optional(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  source: z.enum(['META_ADS', 'GOOGLE_ADS', 'ORGANIC', 'REFERRAL', 'WHATSAPP', 'WALK_IN', 'OTHER']),
  stageId: z.string().min(1),
  procedureInterest: z.string().optional(),
  estimatedValue: z.string().optional(),
})

type Values = z.infer<typeof schema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  stages: KanbanStage[]
  defaultStageId?: string
  onCreated: (lead: { id: string; stageId: string; name: string }) => void
}

export function CreateLeadDialog({
  open,
  onOpenChange,
  clientId,
  stages,
  defaultStageId,
  onCreated,
}: Props) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      source: 'OTHER',
      stageId: defaultStageId ?? '',
      procedureInterest: '',
      estimatedValue: '',
    },
  })

  const loading = form.formState.isSubmitting

  async function onSubmit(values: Values) {
    const result = await createLeadAction(clientId, {
      ...values,
      email: values.email || undefined,
      estimatedValue: values.estimatedValue ? Number(values.estimatedValue) : undefined,
    })

    if (!result.success) {
      toast.error(result.error.message)
      return
    }

    toast.success('Lead criado com sucesso')
    form.reset()
    onOpenChange(false)
    onCreated({ id: result.data.id, stageId: result.data.stageId, name: result.data.name })
  }

  const activeStages = stages.filter((s) => !s.isWon && !s.isLost)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Novo Lead</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome *</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome do lead" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl>
                      <Input placeholder="(11) 99999-9999" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="email@exemplo.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Origem *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Origem" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="META_ADS">Meta Ads</SelectItem>
                        <SelectItem value="GOOGLE_ADS">Google Ads</SelectItem>
                        <SelectItem value="ORGANIC">Orgânico</SelectItem>
                        <SelectItem value="REFERRAL">Indicação</SelectItem>
                        <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                        <SelectItem value="WALK_IN">Presencial</SelectItem>
                        <SelectItem value="OTHER">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="stageId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estágio *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Estágio" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {activeStages.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="procedureInterest"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Procedimento de interesse</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Harmonização facial" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="estimatedValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor estimado (R$)</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" step="0.01" placeholder="0,00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar lead
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
