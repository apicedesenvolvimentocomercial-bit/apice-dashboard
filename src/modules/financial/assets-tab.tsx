'use client'

import { Box, HelpCircle, Loader2, MonitorSmartphone, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  createFixedAssetAction,
  deleteFixedAssetAction,
  disposeFixedAssetAction,
  listFixedAssetsAction,
} from '@/server/actions/fixed-asset-actions'
import {
  createEquipmentRentalAction,
  deleteCostAction,
  listEquipmentRentalsAction,
} from '@/server/actions/cost-actions'

type Row = {
  id: string
  name: string
  category: string | null
  kind: 'TANGIVEL' | 'INTANGIVEL'
  acquisitionValue: number
  residualValue: number
  acquisitionDate: string | Date
  usefulLifeMonths: number
  disposedAt: string | Date | null
  monthlyDepreciation: number
}

type RentalRow = {
  id: string
  description: string | null
  amount: number
  date: string | Date
  recurringDay: number | null
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dt = (d: string | Date) => new Date(d).toLocaleDateString('pt-BR')

/** Vida útil legível: ≥24 meses vira anos ("3 anos"); abaixo, meses ("18 m"). */
function lifeLabel(months: number): string {
  if (months >= 24) return `${Math.round(months / 12)} anos`
  if (months === 12) return '1 ano'
  return `${months} m`
}

/** Amortização acumulada até hoje, limitada ao valor amortizável. */
function accumulated(a: Row): number {
  const start = new Date(a.acquisitionDate).getTime()
  const end = a.disposedAt ? new Date(a.disposedAt).getTime() : Date.now()
  const monthsElapsed = Math.max(0, Math.floor((end - start) / (30.44 * 86_400_000)))
  const cap = Math.max(0, a.acquisitionValue - a.residualValue)
  return Math.min(a.monthlyDepreciation * Math.min(monthsElapsed, a.usefulLifeMonths), cap)
}

/** Cabeçalho de seção (handoff §10.1): h2 + "?" com tooltip + ação primária. */
function SectionHeader({
  title,
  hint,
  action,
}: {
  title: string
  hint: string
  action: React.ReactNode
}) {
  return (
    <div className="mb-3.5 flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-center gap-2">
        <h2 className="m-0 text-[length:clamp(15px,0.2vw+12.4px,16.5px)] font-semibold">{title}</h2>
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help text-muted-foreground" aria-label={`Sobre ${title}`}>
                <HelpCircle className="h-[15px] w-[15px]" aria-hidden="true" />
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-[240px] text-xs leading-normal">{hint}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      {action}
    </div>
  )
}

/** Estado vazio composto por seção (handoff §10.5). */
function SectionEmpty({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ElementType
  title: string
  desc: string
}) {
  return (
    <div className="flex flex-col items-center gap-[11px] rounded-[13px] border border-dashed border-border bg-card px-6 py-[46px] text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="text-sm font-semibold">{title}</div>
      <p className="-mt-1 max-w-[420px] text-[12.5px] text-muted-foreground">{desc}</p>
    </div>
  )
}

// Grids das tabelas (handoff §10.2/§10.4, adaptados aos dados reais).
const ASSET_GRID =
  'grid grid-cols-[minmax(0,1.7fr)_110px_120px_100px_130px_130px_150px] items-center gap-3.5'
const RENTAL_GRID =
  'grid grid-cols-[minmax(0,1.6fr)_110px_140px_110px_110px_76px] items-center gap-3.5'

const HEADER_ROW =
  'border-b border-border bg-muted/40 px-[18px] py-[11px] text-[11.5px] font-semibold uppercase tracking-[0.02em] text-muted-foreground'

/**
 * Aba Ativos — redesign Senno (Financeiro-handoff §10): seções empilhadas com
 * cabeçalho (título + tooltip de ajuda + ação primária), tabela num card com
 * rodapé de total e estado vazio composto POR SEÇÃO. Hoje o produto tem ativos
 * intangíveis (amortização na DRE) e equipamentos alugados (despesa fixa); a
 * seção de tangíveis com manutenção do protótipo depende de modelo novo.
 */
export function AssetsTab({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [rentals, setRentals] = useState<RentalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, startTransition] = useTransition()

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([listFixedAssetsAction(clientId), listEquipmentRentalsAction(clientId)])
      .then(([assetsRes, rentalsRes]) => {
        if (assetsRes.success) setRows(assetsRes.data as Row[])
        else toast.error(assetsRes.error.message)
        if (rentalsRes.success) setRentals(rentalsRes.data as RentalRow[])
      })
      .finally(() => setLoading(false))
  }, [clientId])

  useEffect(() => load(), [load])

  function act(fn: () => Promise<{ success: boolean; error?: { message: string } }>, ok: string) {
    startTransition(async () => {
      const res = await fn()
      if (!res.success) {
        toast.error(res.error?.message ?? 'Erro')
        return
      }
      toast.success(ok)
      load()
    })
  }

  const activeAssets = rows.filter((a) => !a.disposedAt)
  const totalAmortization = activeAssets.reduce((s, a) => s + a.monthlyDepreciation, 0)
  const totalRent = rentals.reduce((s, r) => s + r.amount, 0)

  return (
    <div className="flex flex-col gap-7">
      {/* ================= Ativos intangíveis (handoff §10.2) ================= */}
      <section>
        <SectionHeader
          title="Ativos intangíveis"
          hint="Software, licenças e marcas — geram amortização na DRE."
          action={<NewAssetDialog clientId={clientId} onSaved={load} />}
        />

        {loading ? (
          <div className="overflow-hidden rounded-[13px] border border-border bg-card shadow-card">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  ASSET_GRID,
                  'border-t border-border px-[18px] py-[13px] first:border-t-0'
                )}
              >
                {Array.from({ length: 7 }).map((_, j) => (
                  <div key={j} className="senno-shimmer h-3 w-4/5 rounded" />
                ))}
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <SectionEmpty
            icon={Box}
            title="Nenhum ativo intangível cadastrado"
            desc="Cadastre software, licenças ou marcas para a amortização entrar na DRE."
          />
        ) : (
          <div className="overflow-x-auto rounded-[13px] border border-border bg-card shadow-card">
            <div className="min-w-[900px]">
              <div className={cn(ASSET_GRID, HEADER_ROW)}>
                <div>Ativo</div>
                <div>Tipo</div>
                <div className="text-right">Valor</div>
                <div>Vida útil</div>
                <div className="text-right">Amort./mês</div>
                <div className="text-right">Acumulada</div>
                <div />
              </div>

              {rows.map((a) => (
                <div
                  key={a.id}
                  className={cn(
                    ASSET_GRID,
                    'border-t border-border px-[18px] py-[13px] transition-colors hover:bg-accent/50',
                    a.disposedAt && 'opacity-60'
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold">{a.name}</div>
                    <div className="truncate text-[11.5px] tabular-nums text-muted-foreground">
                      Adquirido em {dt(a.acquisitionDate)}
                    </div>
                  </div>
                  <div>
                    <span className="inline-flex whitespace-nowrap rounded-full bg-muted px-2.5 py-[3px] text-[11px] font-semibold leading-none text-foreground">
                      {a.category?.trim() || 'Intangível'}
                    </span>
                  </div>
                  <div className="text-right text-[12.5px] font-semibold tabular-nums">
                    {brl(a.acquisitionValue)}
                  </div>
                  <div className="text-[12.5px] tabular-nums text-muted-foreground">
                    {lifeLabel(a.usefulLifeMonths)}
                  </div>
                  <div className="text-right text-[12.5px] font-semibold tabular-nums text-destructive">
                    {brl(-a.monthlyDepreciation)}
                  </div>
                  <div className="text-right text-[12.5px] tabular-nums text-muted-foreground">
                    {brl(accumulated(a))}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    {a.disposedAt ? (
                      <span className="whitespace-nowrap text-[11.5px] tabular-nums text-muted-foreground">
                        Baixado {dt(a.disposedAt)}
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          act(() => disposeFixedAssetAction(clientId, a.id), 'Ativo baixado')
                        }
                        className="whitespace-nowrap text-[12.5px] font-semibold text-primary-text hover:underline disabled:opacity-50"
                      >
                        Dar baixa
                      </button>
                    )}
                    <button
                      type="button"
                      title="Excluir"
                      aria-label="Excluir ativo"
                      disabled={pending}
                      onClick={() =>
                        act(() => deleteFixedAssetAction(clientId, a.id), 'Ativo excluído')
                      }
                      className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/[0.12] hover:text-destructive disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}

              {/* Rodapé de total (handoff §10.2) */}
              <div className="flex items-center justify-between border-t border-border bg-muted/40 px-[18px] py-3">
                <span className="text-[12.5px] text-muted-foreground">
                  Amortização total no mês
                </span>
                <span className="text-[13px] font-bold tabular-nums text-destructive">
                  {brl(-totalAmortization)}
                </span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ================= Equipamentos alugados (handoff §10.4) ================= */}
      <section>
        <SectionHeader
          title="Equipamentos alugados"
          hint="Aluguel mensal recorrente — entra na DRE como despesa fixa (sem depreciação)."
          action={<NewRentalDialog clientId={clientId} onSaved={load} />}
        />

        {loading ? (
          <div className="overflow-hidden rounded-[13px] border border-border bg-card shadow-card">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  RENTAL_GRID,
                  'border-t border-border px-[18px] py-[13px] first:border-t-0'
                )}
              >
                {Array.from({ length: 6 }).map((_, j) => (
                  <div key={j} className="senno-shimmer h-3 w-4/5 rounded" />
                ))}
              </div>
            ))}
          </div>
        ) : rentals.length === 0 ? (
          <SectionEmpty
            icon={MonitorSmartphone}
            title="Nenhum equipamento alugado"
            desc="Cadastre o primeiro aluguel para vê-lo somar como despesa fixa."
          />
        ) : (
          <div className="overflow-x-auto rounded-[13px] border border-border bg-card shadow-card">
            <div className="min-w-[760px]">
              <div className={cn(RENTAL_GRID, HEADER_ROW)}>
                <div>Equipamento</div>
                <div>Início</div>
                <div className="text-right">Aluguel/mês</div>
                <div>Dia venc.</div>
                <div>Status</div>
                <div />
              </div>

              {rentals.map((r) => (
                <div
                  key={r.id}
                  className={cn(
                    RENTAL_GRID,
                    'border-t border-border px-[18px] py-[13px] transition-colors hover:bg-accent/50'
                  )}
                >
                  <div className="truncate text-[13px] font-semibold">
                    {r.description ?? 'Aluguel'}
                  </div>
                  <div className="text-[12.5px] tabular-nums text-foreground">{dt(r.date)}</div>
                  <div className="text-right text-[12.5px] font-semibold tabular-nums text-destructive">
                    {brl(-r.amount)}
                  </div>
                  <div className="text-[12.5px] tabular-nums text-muted-foreground">
                    {r.recurringDay ?? '—'}
                  </div>
                  <div>
                    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-ok-bg px-[11px] py-1 text-[11px] font-semibold leading-none text-ok">
                      Ativo
                    </span>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      title="Remover"
                      aria-label="Remover aluguel"
                      disabled={pending}
                      onClick={() =>
                        act(() => deleteCostAction(r.id, clientId), 'Aluguel removido')
                      }
                      className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/[0.12] hover:text-destructive disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}

              {/* Rodapé de total (handoff §10.4) */}
              <div className="flex items-center justify-between border-t border-border bg-muted/40 px-[18px] py-3">
                <span className="text-[12.5px] text-muted-foreground">
                  Despesa fixa de aluguel no mês
                </span>
                <span className="text-[13px] font-bold tabular-nums text-destructive">
                  {brl(-totalRent)}
                </span>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

// Botão primário do redesign (trigger dos dialogs de cadastro).
const PRIMARY_TRIGGER_CLASS =
  'inline-flex h-[38px] items-center gap-[7px] rounded-[9px] bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-[filter] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function NewRentalDialog({ clientId, onSaved }: { clientId: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState({ name: '', amount: '', startDate: '', recurringDay: '' })

  function submit() {
    const amount = Number(form.amount)
    if (form.name.trim().length < 2) return toast.error('Dê um nome ao equipamento')
    if (!(amount > 0)) return toast.error('Valor mensal inválido')
    if (!form.startDate) return toast.error('Informe a data de início')

    startTransition(async () => {
      const res = await createEquipmentRentalAction(clientId, {
        name: form.name,
        amount,
        startDate: form.startDate,
        recurringDay: form.recurringDay ? parseInt(form.recurringDay, 10) : undefined,
      })
      if (!res.success) {
        toast.error(res.error.message)
        return
      }
      toast.success('Aluguel cadastrado')
      setOpen(false)
      setForm({ name: '', amount: '', startDate: '', recurringDay: '' })
      onSaved()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className={PRIMARY_TRIGGER_CLASS}>
          <Plus className="h-[15px] w-[15px]" aria-hidden="true" />
          Novo aluguel
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo aluguel de equipamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Equipamento</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Laser alugado"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Aluguel mensal</Label>
              <Input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Dia do vencimento (opcional)</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={form.recurringDay}
                onChange={(e) => setForm((f) => ({ ...f, recurringDay: e.target.value }))}
                placeholder="Dia da data início"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Início</Label>
            <DateInput
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Cadastrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NewAssetDialog({ clientId, onSaved }: { clientId: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState({
    name: '',
    category: '',
    acquisitionValue: '',
    residualValue: '',
    acquisitionDate: '',
    usefulLifeMonths: '',
  })

  function submit() {
    const acquisitionValue = Number(form.acquisitionValue)
    const usefulLifeMonths = parseInt(form.usefulLifeMonths, 10)
    if (form.name.trim().length < 2) return toast.error('Dê um nome ao ativo')
    if (!(acquisitionValue > 0)) return toast.error('Valor de aquisição inválido')
    if (!(usefulLifeMonths > 0)) return toast.error('Vida útil (meses) inválida')
    if (!form.acquisitionDate) return toast.error('Informe a data de aquisição')

    startTransition(async () => {
      const res = await createFixedAssetAction(clientId, {
        name: form.name,
        category: form.category || undefined,
        kind: 'INTANGIVEL',
        acquisitionValue,
        residualValue: form.residualValue ? Number(form.residualValue) : undefined,
        acquisitionDate: form.acquisitionDate,
        usefulLifeMonths,
      })
      if (!res.success) {
        toast.error(res.error.message)
        return
      }
      toast.success('Ativo cadastrado')
      setOpen(false)
      setForm({
        name: '',
        category: '',
        acquisitionValue: '',
        residualValue: '',
        acquisitionDate: '',
        usefulLifeMonths: '',
      })
      onSaved()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className={PRIMARY_TRIGGER_CLASS}>
          <Plus className="h-[15px] w-[15px]" aria-hidden="true" />
          Novo ativo
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo ativo intangível</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Ativos intangíveis (software, licenças, marcas) entram na DRE pela amortização.
            Depreciação de equipamentos foi descontinuada.
          </p>
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Licença do software de gestão"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Categoria (opcional)</Label>
            <Input
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="Software"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor de aquisição</Label>
              <Input
                type="number"
                step="0.01"
                value={form.acquisitionValue}
                onChange={(e) => setForm((f) => ({ ...f, acquisitionValue: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Valor residual (opcional)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.residualValue}
                onChange={(e) => setForm((f) => ({ ...f, residualValue: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data de aquisição</Label>
              <DateInput
                value={form.acquisitionDate}
                onChange={(e) => setForm((f) => ({ ...f, acquisitionDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Vida útil (meses)</Label>
              <Input
                type="number"
                value={form.usefulLifeMonths}
                onChange={(e) => setForm((f) => ({ ...f, usefulLifeMonths: e.target.value }))}
                placeholder="60"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Cadastrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
