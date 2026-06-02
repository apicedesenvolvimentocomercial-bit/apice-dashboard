'use client'

import { Loader2, Plus } from 'lucide-react'
import { useCallback, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  createFixedAssetAction,
  deleteFixedAssetAction,
  disposeFixedAssetAction,
  listFixedAssetsAction,
} from '@/server/actions/fixed-asset-actions'

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

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dt = (d: string | Date) => new Date(d).toLocaleDateString('pt-BR')

export function AssetsTab({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, startTransition] = useTransition()

  const load = useCallback(() => {
    setLoading(true)
    listFixedAssetsAction(clientId).then((res) => {
      if (res.success) setRows(res.data as Row[])
      else toast.error(res.error.message)
      setLoading(false)
    })
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

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <NewAssetDialog clientId={clientId} onSaved={load} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Nenhum ativo cadastrado. Cadastre equipamentos/móveis (tangível) ou software (intangível)
          para a depreciação entrar na DRE.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Ativo</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Aquisição</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2 text-right">Vida útil</th>
                <th className="px-3 py-2 text-right">Deprec./mês</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((a) => (
                <tr key={a.id} className={a.disposedAt ? 'text-muted-foreground' : ''}>
                  <td className="px-3 py-2">
                    {a.name}
                    {a.category && (
                      <span className="ml-1 text-xs text-muted-foreground">· {a.category}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">
                      {a.kind === 'TANGIVEL' ? 'Tangível' : 'Intangível'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">{dt(a.acquisitionDate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{brl(a.acquisitionValue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{a.usefulLifeMonths} m</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {brl(a.monthlyDepreciation)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      {a.disposedAt ? (
                        <span className="text-xs">Baixado {dt(a.disposedAt)}</span>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            act(() => disposeFixedAssetAction(clientId, a.id), 'Ativo baixado')
                          }
                        >
                          Dar baixa
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          act(() => deleteFixedAssetAction(clientId, a.id), 'Ativo excluído')
                        }
                      >
                        Excluir
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function NewAssetDialog({ clientId, onSaved }: { clientId: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState({
    name: '',
    category: '',
    kind: 'TANGIVEL' as 'TANGIVEL' | 'INTANGIVEL',
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
        kind: form.kind,
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
        kind: 'TANGIVEL',
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
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Novo ativo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo ativo</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Laser CO2"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={form.kind}
                onValueChange={(v) => setForm((f) => ({ ...f, kind: v as typeof f.kind }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TANGIVEL">Tangível (depreciação)</SelectItem>
                  <SelectItem value="INTANGIVEL">Intangível (amortização)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Categoria (opcional)</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="Equipamento"
              />
            </div>
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
