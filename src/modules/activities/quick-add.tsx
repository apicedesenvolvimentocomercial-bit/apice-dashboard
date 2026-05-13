'use client'

import { Plus } from 'lucide-react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { quickAddActivityAction } from '@/server/actions/activity-actions'

export function QuickAdd() {
  const [title, setTitle] = useState('')
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    startTransition(async () => {
      const res = await quickAddActivityAction(title)
      if (res.success) {
        toast.success('Tarefa criada')
        setTitle('')
        router.refresh()
      } else {
        toast.error(res.error.message)
      }
    })
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-xl items-center gap-2">
      <Input
        placeholder="Adicionar tarefa rápida (Enter para salvar)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={pending}
      />
      <Button type="submit" size="sm" disabled={pending || !title.trim()}>
        <Plus className="mr-1 h-4 w-4" />
        Adicionar
      </Button>
    </form>
  )
}
