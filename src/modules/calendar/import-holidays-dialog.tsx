'use client'

import { Download, Loader2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addOrgHolidaysBulkAction } from '@/server/actions/org-holiday-actions'

type BrasilHoliday = { date: string; localName: string; name: string }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Datas já cadastradas — usado pra avisar duplicatas antes do envio. */
  existingDates: string[]
}

export function ImportHolidaysDialog({ open, onOpenChange, existingDates }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [fetching, setFetching] = useState(false)
  const [preview, setPreview] = useState<BrasilHoliday[] | null>(null)

  async function fetchPreview() {
    const y = Number(year)
    if (!Number.isInteger(y) || y < 2000 || y > 2100) {
      toast.error('Ano inválido')
      return
    }
    setFetching(true)
    try {
      const res = await fetch(`https://brasilapi.com.br/api/feriados/v1/${y}`)
      if (!res.ok) throw new Error(`BrasilAPI retornou ${res.status}`)
      const data: BrasilHoliday[] = await res.json()
      setPreview(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao buscar feriados')
    } finally {
      setFetching(false)
    }
  }

  function handleImport() {
    if (!preview || preview.length === 0) return
    const existingSet = new Set(existingDates)
    const toAdd = preview
      .filter((h) => !existingSet.has(h.date))
      .map((h) => ({ date: h.date, name: h.name }))
    if (toAdd.length === 0) {
      toast.info('Todos os feriados já estão cadastrados')
      return
    }
    startTransition(async () => {
      const res = await addOrgHolidaysBulkAction(toAdd)
      if (!res.success) {
        toast.error(res.error.message)
        return
      }
      toast.success(`${res.data.added} feriados importados`)
      setPreview(null)
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Importar feriados do Brasil</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Importa feriados nacionais do BrasilAPI para o ano escolhido. Os feriados ficam visíveis
            pra toda a organização.
          </p>

          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="holiday-year">Ano</Label>
              <Input
                id="holiday-year"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="2026"
              />
            </div>
            <Button onClick={fetchPreview} disabled={fetching || pending}>
              {fetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span className="ml-1">Buscar</span>
            </Button>
          </div>

          {preview && (
            <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border p-2 text-sm">
              {preview.length === 0 ? (
                <p className="px-1 py-1 text-muted-foreground">Nada retornado pela API.</p>
              ) : (
                preview.map((h) => {
                  const exists = existingDates.includes(h.date)
                  return (
                    <div
                      key={h.date}
                      className="flex items-center justify-between gap-2 rounded px-2 py-1"
                    >
                      <span className="text-xs text-muted-foreground">{h.date}</span>
                      <span className="flex-1 truncate">{h.name}</span>
                      {exists && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          já cadastrado
                        </span>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={handleImport} disabled={pending || !preview || preview.length === 0}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Importar{' '}
              {preview ? `(${preview.filter((h) => !existingDates.includes(h.date)).length})` : ''}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
