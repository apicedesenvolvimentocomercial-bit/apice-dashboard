'use client'

import { useState } from 'react'
import { FileDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

type Props = {
  clientId: string
  from?: string
  to?: string
}

export function PdfDownloadButton({ clientId, from, to }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleDownload() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const res = await fetch(`/api/reports/${clientId}/pdf?${params.toString()}`)
      if (!res.ok) throw new Error('Falha ao gerar relatório')
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = disposition.match(/filename="([^"]+)"/)
      const filename = match?.[1] ?? 'relatorio.pdf'
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = filename
      link.click()
      URL.revokeObjectURL(link.href)
    } catch {
      toast.error('Erro ao gerar PDF')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button size="sm" variant="outline" disabled={loading} onClick={handleDownload}>
      <FileDown className="mr-1.5 h-3.5 w-3.5" />
      {loading ? 'Gerando...' : 'Baixar PDF'}
    </Button>
  )
}
