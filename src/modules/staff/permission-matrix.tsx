'use client'

import { Loader2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { updateStaffPermissionsAction } from '@/server/actions/staff-actions'

import { PERMISSION_MODULES } from './permission-modules'

type PermissionRow = {
  module: string
  canRead: boolean
  canWrite: boolean
  canDelete: boolean
}

type Props = {
  userId: string
  initial: PermissionRow[]
  onSaved?: () => void
}

function defaultsFor(): PermissionRow[] {
  return PERMISSION_MODULES.map((m) => ({
    module: m.key,
    canRead: false,
    canWrite: false,
    canDelete: false,
  }))
}

function mergeWithInitial(initial: PermissionRow[]): PermissionRow[] {
  const byModule = new Map(initial.map((p) => [p.module, p]))
  return defaultsFor().map((d) => byModule.get(d.module) ?? d)
}

export function PermissionMatrix({ userId, initial, onSaved }: Props) {
  const [rows, setRows] = useState<PermissionRow[]>(() => mergeWithInitial(initial))
  const [pending, startTransition] = useTransition()

  function toggle(module: string, key: 'canRead' | 'canWrite' | 'canDelete') {
    setRows((prev) =>
      prev.map((row) => {
        if (row.module !== module) return row
        const next = { ...row, [key]: !row[key] }
        // Coerência mínima: write/delete exigem read
        if (key === 'canRead' && !next.canRead) {
          next.canWrite = false
          next.canDelete = false
        }
        if ((key === 'canWrite' || key === 'canDelete') && next[key]) {
          next.canRead = true
        }
        return next
      })
    )
  }

  function save() {
    startTransition(async () => {
      const result = await updateStaffPermissionsAction({
        userId,
        permissions: rows,
      })
      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      toast.success('Permissões atualizadas')
      onSaved?.()
    })
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Módulo</th>
              <th className="px-3 py-2 text-center font-medium">Ler</th>
              <th className="px-3 py-2 text-center font-medium">Escrever</th>
              <th className="px-3 py-2 text-center font-medium">Excluir</th>
            </tr>
          </thead>
          <tbody>
            {PERMISSION_MODULES.map((mod) => {
              const row = rows.find((r) => r.module === mod.key)!
              return (
                <tr key={mod.key} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium">{mod.label}</div>
                    <div className="text-xs text-muted-foreground">{mod.description}</div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={row.canRead}
                      onChange={() => toggle(mod.key, 'canRead')}
                      aria-label={`Permitir leitura em ${mod.label}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={row.canWrite}
                      onChange={() => toggle(mod.key, 'canWrite')}
                      aria-label={`Permitir escrita em ${mod.label}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={row.canDelete}
                      onChange={() => toggle(mod.key, 'canDelete')}
                      aria-label={`Permitir exclusão em ${mod.label}`}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <Button onClick={save} disabled={pending}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar permissões
        </Button>
      </div>
    </div>
  )
}
