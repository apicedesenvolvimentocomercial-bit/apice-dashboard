'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createLeadAction } from '@/server/actions/lead-actions'

import type { ProcedureOption } from './schedule-lead-dialog'

const schema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  phone: z.string().optional(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  source: z.enum(['META_ADS', 'GOOGLE_ADS', 'ORGANIC', 'REFERRAL', 'WHATSAPP', 'WALK_IN', 'OTHER']),
})

type Values = z.infer<typeof schema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  /** Etapa de destino (a coluna onde o "+" foi clicado). Sem seletor de estágio. */
  defaultStageId: string
  /** Procedimentos da clínica (com preço) para "procedimentos de interesse". */
  procedures: ProcedureOption[]
  onCreated: (lead: { id: string; stageId: string; name: string }) => void
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function CreateLeadDialog({
  open,
  onOpenChange,
  clientId,
  defaultStageId,
  procedures,
  onCreated,
}: Props) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', phone: '', email: '', source: 'OTHER' },
  })

  // Procedimentos de interesse (>1) + valor estimado. O valor é preenchido
  // automaticamente com a soma dos preços ao marcar procedimentos; o usuário
  // pode sobrescrever manualmente depois (editou = não recalcula).
  const [selectedProcs, setSelectedProcs] = useState<string[]>([])
  const [estimatedValue, setEstimatedValue] = useState('')
  const [valueEdited, setValueEdited] = useState(false)

  const loading = form.formState.isSubmitting

  function sumPrices(ids: string[]): number {
    return procedures.filter((p) => ids.includes(p.id)).reduce((sum, p) => sum + p.price, 0)
  }

  function toggleProc(id: string) {
    setSelectedProcs((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      if (!valueEdited) {
        const total = sumPrices(next)
        setEstimatedValue(total > 0 ? String(total) : '')
      }
      return next
    })
  }

  function reset() {
    form.reset()
    setSelectedProcs([])
    setEstimatedValue('')
    setValueEdited(false)
  }

  async function onSubmit(values: Values) {
    if (!defaultStageId) {
      toast.error('Etapa de destino inválida')
      return
    }
    const result = await createLeadAction(clientId, {
      ...values,
      email: values.email || undefined,
      stageId: defaultStageId,
      procedureInterestIds: selectedProcs,
      estimatedValue: estimatedValue ? Number(estimatedValue) : undefined,
    })

    if (!result.success) {
      toast.error(result.error.message)
      return
    }

    toast.success('Lead criado com sucesso')
    reset()
    onOpenChange(false)
    onCreated({ id: result.data.id, stageId: result.data.stageId, name: result.data.name })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
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

            {/* Procedimentos de interesse (múltiplos) → somam no valor estimado */}
            <div className="space-y-1">
              <Label>Procedimentos de interesse</Label>
              {procedures.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhum procedimento cadastrado. Cadastre na aba Procedimentos.
                </p>
              ) : (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-input p-2">
                  {procedures.map((p) => {
                    const checked = selectedProcs.includes(p.id)
                    return (
                      <label
                        key={p.id}
                        className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 text-sm hover:bg-accent hover:text-accent-foreground"
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleProc(p.id)}
                            className="h-4 w-4 cursor-pointer accent-primary"
                          />
                          {p.name}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {BRL.format(p.price)}
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="lead-estimated">Valor estimado (R$)</Label>
              <Input
                id="lead-estimated"
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={estimatedValue}
                onChange={(e) => {
                  setEstimatedValue(e.target.value)
                  setValueEdited(true)
                }}
              />
              {selectedProcs.length > 0 && !valueEdited && (
                <p className="text-xs text-muted-foreground">
                  Preenchido automaticamente com a soma dos procedimentos de interesse.
                </p>
              )}
            </div>

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
