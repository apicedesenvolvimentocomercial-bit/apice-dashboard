'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { UserCheck, Plus, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { PatientWithStats } from '@/server/repositories/patient-repository'

import { CreatePatientDialog } from './create-patient-dialog'
import { PatientDrawer } from './patient-drawer'

type Props = {
  patients: PatientWithStats[]
  clientId: string
}

export function PatientsList({ patients, clientId }: Props) {
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [drawerPatientId, setDrawerPatientId] = useState<string | null>(null)

  const filtered = patients.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.phone?.includes(search) ?? false) ||
      (p.email?.toLowerCase().includes(search.toLowerCase()) ?? false)
  )

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pacientes</h1>
          <p className="text-muted-foreground">
            {patients.length}{' '}
            {patients.length === 1 ? 'paciente cadastrado' : 'pacientes cadastrados'}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo paciente
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, telefone ou e-mail..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
          <UserCheck className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <h3 className="text-lg font-medium">
            {search ? 'Nenhum paciente encontrado' : 'Nenhum paciente cadastrado'}
          </h3>
          {!search && (
            <>
              <p className="mb-6 mt-1 text-sm text-muted-foreground">
                Pacientes criados via CRM (leads ganhos) aparecem aqui automaticamente.
              </p>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Cadastrar paciente
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Nome</th>
                <th className="hidden px-4 py-3 text-left font-medium md:table-cell">Telefone</th>
                <th className="hidden px-4 py-3 text-left font-medium lg:table-cell">E-mail</th>
                <th className="hidden px-4 py-3 text-left font-medium sm:table-cell">1ª visita</th>
                <th className="px-4 py-3 text-center font-medium">Agendamentos</th>
                <th className="px-4 py-3 text-left font-medium">Tags</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((patient) => (
                <tr
                  key={patient.id}
                  className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/50"
                  onClick={() => setDrawerPatientId(patient.id)}
                >
                  <td className="px-4 py-3 font-medium">{patient.name}</td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                    {patient.phone ?? '—'}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                    {patient.email ?? '—'}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                    {patient.firstVisitAt
                      ? format(new Date(patient.firstVisitAt), 'dd/MM/yyyy', { locale: ptBR })
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                      {patient._count.appointments}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {patient.tags.slice(0, 2).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                      {patient.tags.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{patient.tags.length - 2}
                        </Badge>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreatePatientDialog
        open={createOpen}
        clientId={clientId}
        onOpenChange={setCreateOpen}
        onCreated={() => router.refresh()}
      />

      <PatientDrawer
        open={drawerPatientId !== null}
        patientId={drawerPatientId}
        clientId={clientId}
        onClose={() => setDrawerPatientId(null)}
        onUpdated={() => {
          setDrawerPatientId(null)
          router.refresh()
        }}
      />
    </>
  )
}
