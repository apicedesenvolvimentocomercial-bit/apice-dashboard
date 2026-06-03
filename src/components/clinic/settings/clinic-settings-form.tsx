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
import { SearchableSelect } from '@/components/shared/searchable-select'
import { CNAE_OPTIONS } from '@/lib/cnae-list'
import { updateClinicSettingsAction } from '@/server/actions/settings-actions'

const NO_CNAE = '__none__'

const schema = z.object({
  name: z.string().trim().min(2, 'Nome obrigatório'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  state: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
  taxRegime: z.enum(['SIMPLES', 'PRESUMIDO', 'REAL']),
  cnae: z.string().optional().or(z.literal('')),
})

type Values = z.infer<typeof schema>

type Props = {
  clientId: string
  initial: {
    name: string
    email: string | null
    phone: string | null
    city: string | null
    state: string | null
    notes: string | null
    taxRegime: 'SIMPLES' | 'PRESUMIDO' | 'REAL'
    cnae: string | null
  }
}

export function ClinicSettingsForm({ clientId, initial }: Props) {
  const router = useRouter()
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial.name,
      email: initial.email ?? '',
      phone: initial.phone ?? '',
      city: initial.city ?? '',
      state: initial.state ?? '',
      notes: initial.notes ?? '',
      taxRegime: initial.taxRegime,
      cnae: initial.cnae ?? '',
    },
  })

  async function onSubmit(values: Values) {
    const result = await updateClinicSettingsAction({ clientId, ...values })
    if (!result.success) {
      toast.error(result.error.message)
      return
    }
    toast.success('Dados da clínica atualizados')
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
              <FormLabel>Nome da clínica</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="contato@clinica.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
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
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="city"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cidade</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="state"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Estado</FormLabel>
                <FormControl>
                  <Input maxLength={2} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="taxRegime"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Regime tributário</FormLabel>
              <FormControl>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  {...field}
                >
                  <option value="SIMPLES">Simples Nacional</option>
                  <option value="PRESUMIDO">Lucro Presumido</option>
                  <option value="REAL">Lucro Real</option>
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="cnae"
          render={({ field }) => (
            <FormItem>
              <FormLabel>CNAE</FormLabel>
              <FormControl>
                <SearchableSelect
                  value={field.value || NO_CNAE}
                  onChange={(v) => field.onChange(v === NO_CNAE ? '' : v)}
                  placeholder="Selecionar CNAE..."
                  emptyText="Nenhum CNAE encontrado"
                  options={[
                    { value: NO_CNAE, label: 'Não informar' },
                    ...CNAE_OPTIONS.map((c) => ({
                      value: c.code,
                      label: `${c.code} — ${c.label}`,
                    })),
                  ]}
                />
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
              <FormLabel>Observações</FormLabel>
              <FormControl>
                <textarea
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Notas internas..."
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar
        </Button>
      </form>
    </Form>
  )
}
