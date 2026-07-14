'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { SearchableSelect } from '@/components/shared/searchable-select'
import { CNAE_OPTIONS } from '@/lib/cnae-list'
import { updateClinicSettingsAction } from '@/server/actions/settings-actions'

import {
  FieldError,
  SETTINGS_BTN_PRIMARY,
  SETTINGS_INPUT,
  SETTINGS_LABEL,
  SETTINGS_TEXTAREA,
  SettingsSectionCard,
  SettingsSelect,
} from './section-card'

/**
 * Seção Clínica — redesign Senno (Configurações-handoff §9). Grid 2col: nome
 * em largura cheia; e-mail/telefone/cidade/estado/regime/CNAE em 1 col;
 * observações em largura cheia. Rodapé com "Salvar dados da clínica".
 *
 * Desvios documentados vs. protótipo:
 * - Estado = select com as 27 UFs (o protótipo listava só 7 — sem razão p/
 *   limitar) + "Não informar".
 * - Regime tributário SEM a opção MEI — o enum real (`TaxRegime`) só tem
 *   Simples/Presumido/Real e a DRE depende dele.
 * - CNAE usa o combobox com busca já existente (lista oficial longa), não o
 *   input de texto do protótipo.
 */

const NO_CNAE = '__none__'

const UFS = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const

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
  const {
    register,
    control,
    handleSubmit,
    formState: { isSubmitting, errors },
  } = useForm<Values>({
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
    <SettingsSectionCard
      title="Clínica"
      description="Dados cadastrais usados em documentos, recibos e integrações fiscais."
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="grid grid-cols-1 gap-x-[18px] gap-y-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <label htmlFor="clinic-name" className={SETTINGS_LABEL}>
              Nome da clínica
            </label>
            <input id="clinic-name" type="text" className={SETTINGS_INPUT} {...register('name')} />
            <FieldError message={errors.name?.message} />
          </div>

          <div>
            <label htmlFor="clinic-email" className={SETTINGS_LABEL}>
              E-mail
            </label>
            <input
              id="clinic-email"
              type="email"
              placeholder="contato@clinica.com"
              className={SETTINGS_INPUT}
              {...register('email')}
            />
            <FieldError message={errors.email?.message} />
          </div>
          <div>
            <label htmlFor="clinic-phone" className={SETTINGS_LABEL}>
              Telefone
            </label>
            <input
              id="clinic-phone"
              type="text"
              placeholder="(11) 99999-9999"
              className={SETTINGS_INPUT}
              {...register('phone')}
            />
          </div>

          <div>
            <label htmlFor="clinic-city" className={SETTINGS_LABEL}>
              Cidade
            </label>
            <input id="clinic-city" type="text" className={SETTINGS_INPUT} {...register('city')} />
          </div>
          <div>
            <label htmlFor="clinic-state" className={SETTINGS_LABEL}>
              Estado
            </label>
            <SettingsSelect id="clinic-state" {...register('state')}>
              <option value="">Não informar</option>
              {UFS.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </SettingsSelect>
          </div>

          <div>
            <label htmlFor="clinic-tax-regime" className={SETTINGS_LABEL}>
              Regime tributário
            </label>
            <SettingsSelect id="clinic-tax-regime" {...register('taxRegime')}>
              <option value="SIMPLES">Simples Nacional</option>
              <option value="PRESUMIDO">Lucro Presumido</option>
              <option value="REAL">Lucro Real</option>
            </SettingsSelect>
          </div>
          <div>
            <label htmlFor="clinic-cnae" className={SETTINGS_LABEL}>
              CNAE
            </label>
            <Controller
              control={control}
              name="cnae"
              render={({ field }) => (
                <SearchableSelect
                  id="clinic-cnae"
                  value={field.value || NO_CNAE}
                  onChange={(v) => field.onChange(v === NO_CNAE ? '' : v)}
                  placeholder="Selecionar CNAE..."
                  emptyText="Nenhum CNAE encontrado"
                  className="h-10 rounded-[9px] border-input bg-background text-[13.5px] tabular-nums"
                  options={[
                    { value: NO_CNAE, label: 'Não informar' },
                    ...CNAE_OPTIONS.map((c) => ({
                      value: c.code,
                      label: `${c.code} — ${c.label}`,
                    })),
                  ]}
                />
              )}
            />
          </div>

          <div className="lg:col-span-2">
            <label htmlFor="clinic-notes" className={SETTINGS_LABEL}>
              Observações
            </label>
            <textarea
              id="clinic-notes"
              rows={3}
              placeholder="Informações internas sobre a clínica…"
              className={SETTINGS_TEXTAREA}
              {...register('notes')}
            />
          </div>
        </div>

        {/* Rodapé de ação (§9.2) */}
        <div className="mt-[22px] flex justify-end border-t border-border pt-5">
          <button type="submit" className={SETTINGS_BTN_PRIMARY} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Salvar dados da clínica
          </button>
        </div>
      </form>
    </SettingsSectionCard>
  )
}
