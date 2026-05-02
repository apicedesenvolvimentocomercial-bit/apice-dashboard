import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'CRM / Leads' }

export default function ClientCrmPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">CRM / Leads</h1>
        <p className="text-muted-foreground">Gerencie seus leads e o funil de vendas</p>
      </div>
    </div>
  )
}
