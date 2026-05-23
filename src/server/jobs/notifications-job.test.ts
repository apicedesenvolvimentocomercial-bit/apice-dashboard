import { describe, expect, it } from 'vitest'

import { domainRouting } from './notifications-job'

// Roteamento por domínio do cron de notificações (Fase 8 / §4 da reforma).
// Invariante de isolamento: notificação de clínica precisa carregar clientId e
// apontar a rota PT — senão não aparece no sino da clínica (que filtra clientId)
// e/ou vaza pra rota admin.
describe('domainRouting', () => {
  it('atividade de clínica usa rota PT e carrega o clientId', () => {
    expect(domainRouting({ domain: 'CLINIC', clientId: 'clinic-A' })).toEqual({
      link: '/atividades',
      clientId: 'clinic-A',
    })
  })

  it('atividade da agência usa rota admin e nunca propaga clientId', () => {
    // Mesmo se vier um clientId etiquetado (CRM), o domínio admin não o repassa.
    expect(domainRouting({ domain: 'ADMIN', clientId: 'clinic-A' })).toEqual({
      link: '/activities',
      clientId: null,
    })
    expect(domainRouting({ domain: 'ADMIN', clientId: null })).toEqual({
      link: '/activities',
      clientId: null,
    })
  })

  it('clínica sem clientId não é mascarada como admin (link continua PT)', () => {
    expect(domainRouting({ domain: 'CLINIC', clientId: null })).toEqual({
      link: '/atividades',
      clientId: null,
    })
  })
})
