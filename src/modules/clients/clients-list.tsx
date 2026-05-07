'use client'

import { Building2, Plus } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import type { ClientWithStats } from '@/server/repositories/client-repository'

import { ClientCard } from './client-card'
import { CreateClientDialog } from './create-client-dialog'

type Props = {
  clients: ClientWithStats[]
}

export function ClientsList({ clients }: Props) {
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clínicas</h1>
          <p className="text-muted-foreground">
            {clients.length} {clients.length === 1 ? 'clínica cadastrada' : 'clínicas cadastradas'}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nova clínica
        </Button>
      </div>

      {clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
          <Building2 className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <h3 className="text-lg font-medium">Nenhuma clínica cadastrada</h3>
          <p className="mb-6 mt-1 text-sm text-muted-foreground">
            Cadastre sua primeira clínica para começar a acompanhar os KPIs.
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Cadastrar primeira clínica
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}
        </div>
      )}

      <CreateClientDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  )
}
