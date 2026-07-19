'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
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
import { FIELD_ERROR_SLOT, FIELD_ERROR_TEXT } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { PhoneInput } from '@/components/ui/phone-input'
import {
  EMAIL_REGEX,
  MAX_MONEY,
  PHONE_BR_REGEX,
  SAFE_TEXT_REGEX,
  formatMoneyBR,
  parseMoneyBR,
} from '@/lib/masks'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { createLeadAction } from '@/server/actions/lead-actions'

import type { ProcedureOption } from './schedule-lead-dialog'

// Espelha `leadSchema` de `server/actions/lead-actions` — mesmos limites, mesmas
// mensagens. O servidor continua sendo a autoridade; isto é só o feedback local.
const schema = z
  .object({
    name: z
      .string()
      .min(2, 'Nome obrigatório')
      .max(255, 'Nome muito grande')
      .regex(SAFE_TEXT_REGEX, 'Caracteres inválidos'),
    phone: z.string().regex(PHONE_BR_REGEX, 'Telefone incompleto').optional().or(z.literal('')),
    email: z
      .string()
      .max(255, 'E-mail muito grande')
      // Esta é a mensagem que o usuário vê na prática: o regex reprova antes do
      // `.email()` os casos incompletos (`klaus`, `klaus@mail`, `klaus@mail.`).
      .regex(EMAIL_REGEX, 'E-mail incompleto')
      .email('E-mail inválido')
      .optional()
      .or(z.literal('')),
    // Sem valor padrão: o usuário PRECISA escolher a origem conscientemente —
    // pré-selecionar "Outro" induzia a deixar como está e sujava o relatório de
    // origem de leads. Campo nasce vazio e é obrigatório.
    // O `preprocess` normaliza '' → undefined: sem ele, um valor vazio cairia no
    // erro padrão do zod, que despeja a lista inteira de enums na tela.
    source: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z.enum(['META_ADS', 'GOOGLE_ADS', 'ORGANIC', 'REFERRAL', 'WHATSAPP', 'WALK_IN', 'OTHER'], {
        required_error: 'Origem obrigatória',
        invalid_type_error: 'Origem obrigatória',
      })
    ),
  })
  // Telefone e e-mail são opcionais isoladamente, mas ao menos UM é exigido:
  // lead sem contato nenhum nasce inalcançável. Espelha `createLeadSchema`.
  .refine((d) => Boolean(d.phone?.trim() || d.email?.trim()), {
    message: 'Informe telefone ou e-mail',
    path: ['phone'],
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
  /** `source` viaja junto p/ o card otimista do kanban não exibir "Outro". */
  onCreated: (lead: { id: string; stageId: string; name: string; source: Values['source'] }) => void
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** Mesmo teto de `procedureInterestIds` no `leadSchema` da action. */
const MAX_PROCEDURES = 100

/** Caixa-baixa sem acento, para a busca de procedimentos casar "quimico"/"Químico". */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
}

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
    // Valida SÓ ao sair do campo — nunca enquanto o usuário digita (com
    // 'onTouched'/'onChange' o erro apareceria já na 1ª letra, antes de o
    // usuário ter chance de terminar). `reValidateMode` repete a regra depois
    // do primeiro submit, senão o RHF voltaria a validar a cada tecla.
    mode: 'onBlur',
    reValidateMode: 'onBlur',
    defaultValues: { name: '', phone: '', email: '', source: undefined },
  })

  // Procedimentos de interesse (>1) + valor estimado. O valor é preenchido
  // automaticamente com a soma dos preços ao marcar procedimentos; o usuário
  // pode sobrescrever manualmente depois (editou = não recalcula).
  const [selectedProcs, setSelectedProcs] = useState<string[]>([])
  const [estimatedValue, setEstimatedValue] = useState('')
  const [valueEdited, setValueEdited] = useState(false)
  const [valueError, setValueError] = useState<string | null>(null)
  const [procQuery, setProcQuery] = useState('')

  const loading = form.formState.isSubmitting

  /**
   * Blur que só valida campo PREENCHIDO. Sair de um campo vazio não acusa nada
   * — obrigatoriedade é cobrada no submit. Vale duplo para a regra cruzada
   * "telefone OU e-mail": no blur do telefone vazio o usuário ainda pode estar
   * a caminho do e-mail. Depois de um submit falho (`isSubmitted`) o blur volta
   * a validar, para o erro sumir assim que for corrigido.
   */
  function blurIfFilled(field: { onBlur: () => void }) {
    return (e: React.FocusEvent<HTMLInputElement>) => {
      if (e.target.value.trim() || form.formState.isSubmitted) field.onBlur()
    }
  }

  // Filtro da busca de procedimentos. Ignora acento e caixa — "botox" acha
  // "Botox" e "peeling" acha "Peeling Químico". Marcados que saem do filtro
  // continuam selecionados (o contador ao lado do rótulo mostra quantos são).
  const visibleProcs = useMemo(() => {
    const q = normalize(procQuery)
    if (!q) return procedures
    return procedures.filter((p) => normalize(p.name).includes(q))
  }, [procedures, procQuery])

  function sumPrices(ids: string[]): number {
    return procedures.filter((p) => ids.includes(p.id)).reduce((sum, p) => sum + p.price, 0)
  }

  function toggleProc(id: string) {
    const isSelected = selectedProcs.includes(id)
    if (!isSelected && selectedProcs.length >= MAX_PROCEDURES) {
      toast.error(`Máximo de ${MAX_PROCEDURES} procedimentos de interesse`)
      return
    }
    const next = isSelected ? selectedProcs.filter((x) => x !== id) : [...selectedProcs, id]
    setSelectedProcs(next)
    if (!valueEdited) {
      const total = sumPrices(next)
      setEstimatedValue(total > 0 ? formatMoneyBR(total) : '')
    }
  }

  function reset() {
    form.reset()
    setSelectedProcs([])
    setEstimatedValue('')
    setValueEdited(false)
    setValueError(null)
    setProcQuery('')
  }

  async function onSubmit(values: Values) {
    if (!defaultStageId) {
      toast.error('Etapa de destino inválida')
      return
    }

    // Valor estimado vive fora do react-hook-form (é preenchido pelos
    // procedimentos), então valida na mão contra os mesmos limites da action.
    const parsedValue = parseMoneyBR(estimatedValue)
    if (parsedValue !== undefined && (parsedValue <= 0 || parsedValue > MAX_MONEY)) {
      setValueError(parsedValue <= 0 ? 'Deve ser maior que zero' : 'Valor muito alto')
      return
    }
    setValueError(null)

    const result = await createLeadAction(clientId, {
      ...values,
      phone: values.phone || undefined,
      email: values.email || undefined,
      stageId: defaultStageId,
      procedureInterestIds: selectedProcs,
      estimatedValue: parsedValue,
    })

    if (!result.success) {
      toast.error(result.error.message)
      return
    }

    toast.success('Lead criado com sucesso')
    reset()
    onOpenChange(false)
    onCreated({
      id: result.data.id,
      stageId: result.data.stageId,
      name: result.data.name,
      source: values.source,
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      {/* `max-h`/scroll é rede de segurança para telas baixas: com os espaços
          reservados a altura é constante, então a barra não aparece e some. */}
      <DialogContent className="max-h-[92vh] max-w-md overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Novo Lead</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          {/* `space-y-3` (e não 4): com um slot de erro reservado sob CADA
              campo, o ritmo de 16px somava demais e o diálogo ficava arejado. */}
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Nome do lead"
                      maxLength={255}
                      {...field}
                      onBlur={blurIfFilled(field)}
                    />
                  </FormControl>
                  <FormMessage reserve />
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
                      <PhoneInput {...field} onBlur={blurIfFilled(field)} />
                    </FormControl>
                    <FormMessage reserve />
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
                      <Input
                        type="email"
                        placeholder="exemplo@mail.com"
                        maxLength={255}
                        {...field}
                        onBlur={(e) => {
                          blurIfFilled(field)(e)
                          // O erro da regra cruzada mora no path `phone`: sem
                          // revalidar o irmão, preencher só o e-mail deixaria a
                          // cobrança acesa debaixo do telefone para sempre.
                          if (form.formState.isSubmitted) void form.trigger('phone')
                        }}
                      />
                    </FormControl>
                    <FormMessage reserve />
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
                  {/* Controlado (`value`, não `defaultValue`): sem isto o gatilho
                      continuaria exibindo a origem antiga depois do `reset()`,
                      ao reabrir o diálogo. `?? ''` = nenhum item casa → mostra o
                      placeholder. */}
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a origem" />
                      </SelectTrigger>
                    </FormControl>
                    {/* `bg-background` casa com o fundo do dialog — o `bg-popover`
                        padrão é mais claro no dark e destoava do popup. */}
                    <SelectContent className="bg-background">
                      <SelectItem value="META_ADS">Meta Ads</SelectItem>
                      <SelectItem value="GOOGLE_ADS">Google Ads</SelectItem>
                      <SelectItem value="ORGANIC">Orgânico</SelectItem>
                      <SelectItem value="REFERRAL">Indicação</SelectItem>
                      <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                      <SelectItem value="WALK_IN">Presencial</SelectItem>
                      <SelectItem value="OTHER">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage reserve />
                </FormItem>
              )}
            />

            {/* Procedimentos de interesse (múltiplos) → somam no valor estimado.
                Caixa de ALTURA FIXA com busca: a lista rola por dentro, então
                nem o filtro nem a quantidade de procedimentos da clínica mudam
                a altura do diálogo. */}
            {/* `space-y-2` + slot reservado no fim = mesmo ritmo interno de um
                FormItem (rótulo · 8px · controle · 8px · linha de erro). Sem o
                slot, "Valor estimado" colava neste bloco enquanto todos os
                outros campos guardavam a linha de erro embaixo. */}
            <div className="space-y-2">
              {/* Altura FIXA + `items-center`: o contador aparece/some conforme
                  a seleção, e com `items-baseline` a linha se realinhava ao
                  ganhar texto — empurrando o rótulo. Travar a altura no tamanho
                  do rótulo (14px; o contador tem 12px) mantém o rótulo parado. */}
              <div className="flex h-3.5 items-center justify-between gap-2">
                <Label htmlFor="lead-proc-search">Procedimentos de interesse</Label>
                <span className="text-xs tabular-nums leading-none text-muted-foreground">
                  {selectedProcs.length > 0 ? `${selectedProcs.length} selecionado(s)` : ''}
                </span>
              </div>
              {procedures.length === 0 ? (
                <p className="flex h-[8.25rem] items-center rounded-md border border-input px-3 text-xs text-muted-foreground">
                  Nenhum procedimento cadastrado. Cadastre na aba Procedimentos.
                </p>
              ) : (
                <div className="rounded-md border border-input">
                  <div className="flex items-center gap-2 border-b border-input px-2.5">
                    <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <input
                      id="lead-proc-search"
                      type="text"
                      value={procQuery}
                      onChange={(e) => setProcQuery(e.target.value)}
                      placeholder="Buscar procedimento..."
                      className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                  <div className="h-24 space-y-1 overflow-y-auto p-2">
                    {visibleProcs.length === 0 ? (
                      <p className="px-2 py-1 text-xs text-muted-foreground">
                        Nenhum procedimento encontrado.
                      </p>
                    ) : (
                      visibleProcs.map((p) => {
                        const checked = selectedProcs.includes(p.id)
                        return (
                          <label
                            key={p.id}
                            className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 text-sm hover:bg-accent hover:text-accent-foreground"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleProc(p.id)}
                                className="h-4 w-4 shrink-0 cursor-pointer accent-primary"
                              />
                              <span className="truncate">{p.name}</span>
                            </span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">
                              {BRL.format(p.price)}
                            </span>
                          </label>
                        )
                      })
                    )}
                  </div>
                </div>
              )}
              {/* Este bloco não tem validação própria; o slot existe só para
                  igualar o espaçamento inferior dos campos vizinhos. */}
              <p className={FIELD_ERROR_SLOT} aria-hidden="true" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lead-estimated">Valor estimado (R$)</Label>
              <MoneyInput
                id="lead-estimated"
                value={estimatedValue}
                onChange={(e) => {
                  setEstimatedValue(e.target.value)
                  setValueEdited(true)
                  setValueError(null)
                }}
              />
              {/* Slot ÚNICO de uma linha: erro tem prioridade sobre a dica, e a
                  linha existe mesmo vazia — os dois juntos manteriam a altura
                  do diálogo oscilando. */}
              <p
                className={cn(
                  // Mesmas medidas do slot de erro compartilhado (inclusive o
                  // `-mb-1`), senão este campo destoaria do resto do diálogo.
                  valueError
                    ? FIELD_ERROR_TEXT
                    : `${FIELD_ERROR_SLOT} truncate text-xs leading-4 text-muted-foreground`
                )}
                title={valueError ?? undefined}
              >
                {valueError ??
                  (selectedProcs.length > 0 && !valueEdited
                    ? 'Soma dos procedimentos selecionados.'
                    : '')}
              </p>
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
