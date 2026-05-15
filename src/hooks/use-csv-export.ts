'use client'

import { useState } from 'react'

type ExportOptions = {
  clientId: string
  resource: 'revenues' | 'costs' | 'leads' | 'patients' | 'appointments'
  from?: string
  to?: string
  filename?: string
}

export function useCsvExport() {
  const [loading, setLoading] = useState(false)

  async function exportCsv({ clientId, resource, from, to }: ExportOptions) {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const url = `/api/export/${clientId}/${resource}?${params.toString()}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = disposition.match(/filename="([^"]+)"/)
      const filename = match?.[1] ?? `${resource}.csv`
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = filename
      link.click()
      URL.revokeObjectURL(link.href)
    } finally {
      setLoading(false)
    }
  }

  return { exportCsv, loading }
}
