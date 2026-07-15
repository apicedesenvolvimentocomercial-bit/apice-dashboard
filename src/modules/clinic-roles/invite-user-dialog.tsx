'use client'

import { Check, Copy, Loader2, Mail } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { inviteClientOwnerAction } from '@/server/actions/client-actions'

/**
 * Convite de pessoa p/ a clínica (lado CLÍNICA). Server-side a action exige
 * `staff:write` (titular ou cargo com "Pode convidar pessoas") + tenant belt.
 * O convidado entra como CLIENT_STAFF SEM cargo (deny-by-default: zero acesso
 * até o titular/gestor atribuir um cargo na lista de pessoas).
 */
export function InviteUserDialog({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()

  function reset(next: boolean) {
    setOpen(next)
    if (!next) {
      setEmail('')
      setInviteUrl(null)
      setCopied(false)
    }
  }

  function submit() {
    if (!email.includes('@')) {
      toast.error('Informe um email válido')
      return
    }
    startTransition(async () => {
      const result = await inviteClientOwnerAction({ clientId, email, role: 'CLIENT_STAFF' })
      if (!result.success) {
        toast.error(result.error.message)
        return
      }
      setInviteUrl(result.data.inviteUrl)
      toast.success('Convite criado — enviamos o link por email')
    })
  }

  async function copy() {
    if (!inviteUrl) return
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      {/* Trigger no padrão do redesign (Configurações-handoff §13.1): botão
          primário 40px com ícone de e-mail. */}
      <button
        type="button"
        onClick={() => reset(true)}
        className="inline-flex h-10 flex-none items-center justify-center gap-[7px] rounded-[9px] bg-primary px-[17px] text-[13.5px] font-semibold text-primary-foreground transition-[filter] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Mail className="h-[15px] w-[15px]" aria-hidden="true" />
        Convidar pessoa
      </button>

      <Dialog open={open} onOpenChange={reset}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Convidar pessoa para a clínica</DialogTitle>
            <DialogDescription>
              A pessoa recebe um link por email para criar a conta. Ela entra <b>sem cargo</b> — ou
              seja, sem nenhum acesso — até você atribuir um cargo na lista de pessoas.
            </DialogDescription>
          </DialogHeader>

          {inviteUrl ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Convite criado. Se o email não chegar, compartilhe o link diretamente (válido por 7
                dias):
              </p>
              <div className="flex items-center gap-2">
                <Input readOnly value={inviteUrl} className="text-xs" />
                <Button variant="outline" size="icon" onClick={copy} aria-label="Copiar link">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="pessoa@clinica.com"
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => reset(false)} disabled={pending}>
              {inviteUrl ? 'Fechar' : 'Cancelar'}
            </Button>
            {!inviteUrl && (
              <Button onClick={submit} disabled={pending}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar convite
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
