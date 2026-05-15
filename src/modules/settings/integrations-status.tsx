import { CheckCircle2, MinusCircle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import type { IntegrationStatus } from '@/server/integrations'

const LABELS: Record<IntegrationStatus['provider'], string> = {
  whatsapp: 'WhatsApp Business',
  metaAds: 'Meta Ads',
  googleAds: 'Google Ads',
}

const DESCRIPTIONS: Record<IntegrationStatus['provider'], string> = {
  whatsapp: 'Disparo de confirmações e lembretes (mock até a integração real).',
  metaAds: 'Sincronização de gasto e leads das campanhas.',
  googleAds: 'Sincronização de gasto e leads das campanhas.',
}

type Props = {
  statuses: IntegrationStatus[]
}

export function IntegrationsStatus({ statuses }: Props) {
  return (
    <div className="space-y-3">
      {statuses.map((s) => {
        const enabled = s.enabled
        const Icon = enabled ? CheckCircle2 : MinusCircle
        return (
          <div
            key={s.provider}
            className="flex items-start justify-between gap-3 rounded-md border p-3"
          >
            <div className="flex gap-3">
              <Icon
                className={
                  enabled ? 'mt-0.5 h-5 w-5 text-green-600' : 'mt-0.5 h-5 w-5 text-muted-foreground'
                }
              />
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{LABELS[s.provider]}</p>
                  {s.mock && (
                    <Badge variant="outline" className="text-[10px]">
                      mock
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{DESCRIPTIONS[s.provider]}</p>
                {s.connectedAccount && (
                  <p className="mt-1 text-xs text-muted-foreground">Conta: {s.connectedAccount}</p>
                )}
              </div>
            </div>
            <Badge variant={enabled ? 'success' : 'secondary'}>
              {enabled ? 'Habilitado' : 'Desabilitado'}
            </Badge>
          </div>
        )
      })}
      <p className="text-xs text-muted-foreground">
        Para habilitar uma integração defina a respectiva variável de ambiente (
        <code>WHATSAPP_API_ENABLED</code>, <code>META_ADS_ENABLED</code>,{' '}
        <code>GOOGLE_ADS_ENABLED</code>). Enquanto não houver credenciais reais o adapter Mock é
        usado.
      </p>
    </div>
  )
}
