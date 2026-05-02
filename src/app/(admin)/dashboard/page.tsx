import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Dashboard' }

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Visão executiva consolidada de todas as clínicas</p>
      </div>
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-muted-foreground">
          Cadastre sua primeira clínica para ver os dados aqui.
        </p>
      </div>
    </div>
  )
}
