'use client'

import { useEffect } from 'react'
import { Toaster, toast } from 'sonner'

// Toaster do sonner com dispensar-ao-clicar. Sonner 1.x não expõe esse
// comportamento via prop, então delego um listener global em [data-sonner-toast]
// e ignoro cliques dentro de botões (mantém clicks em "Desfazer" etc.).
export function DismissibleToaster() {
  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest('button')) return
      const toastEl = target.closest<HTMLElement>('[data-sonner-toast]')
      if (!toastEl) return
      const id = toastEl.getAttribute('data-id')
      if (id) toast.dismiss(id)
      else toast.dismiss()
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  return <Toaster position="top-right" richColors toastOptions={{ className: 'cursor-pointer' }} />
}
