'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
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
  FormDescription,
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
import { createPipelineDealAction } from '@/server/actions/pipeline-deal-actions'

const schema = z.object({
  clientId: z.string().min(1, 'Selecione uma clínica'),
  value: z.string().optional(),
  probability: z.string().optional(),
  expectedCloseAt: z.string().optional(),
  notes: z.string().optional(),
})

type Values = z.infer<typeof schema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  availableClients: { id: string; name: string; status: string }[]
}

export function CreateDealDialog({ open, onOpenChange, availableClients }: Props) {
  const router = useRouter()
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      clientId: '',
      value: '',
      probability: '',
      expectedCloseAt: '',
      notes: '',
    },
  })

  async function onSubmit(values: Values) {
    const result = await createPipelineDealAction({
      clientId: values.clientId,
      value: values.value ? Number(values.value) : undefined,
      probability: values.probability ? Number(values.probability) : undefined,
      expectedCloseAt: values.expectedCloseAt || undefined,
      notes: values.notes || undefined,
    })
    if (!result.success) {
      toast.error(result.error.message)
      return
    }
    toast.success('Negociação criada')
    onOpenChange(false)
    form.reset()
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova negociação</DialogTitle>
          <DialogDescription>
            Adicione uma clínica ao pipeline para acompanhar o avanço comercial.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="clientId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Clínica</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableClients.length === 0 && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          Todas as clínicas já estão no pipeline.
                        </div>
                      )}
                      {availableClients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Apenas clínicas sem negociação ativa aparecem aqui.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor estimado (R$)</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" placeholder="5000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="probability"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Probabilidade (%)</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" max="100" step="5" placeholder="30" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="expectedCloseAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Previsão de fechamento</FormLabel>
                  <FormControl>
                    <DateInput {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl>
                    <textarea
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={form.formState.isSubmitting || availableClients.length === 0}
              >
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
