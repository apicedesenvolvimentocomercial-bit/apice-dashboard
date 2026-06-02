import 'server-only'

/**
 * Ponto de extensão p/ ASSINATURA por-provider do webhook (seguranca-pendencias #2,
 * opção híbrida). HOJE retorna `true` — não há adapter real plugado, e a autenticação
 * efetiva vem do token por-clínica (`webhook-token.ts`), que já isola cross-tenant.
 *
 * Quando o app real de cada provider for registrado, validar AQUI o HMAC do raw body
 * ANTES de processar (o segredo de assinatura vem GRÁTIS do painel do provider):
 *
 *   meta-ads / whatsapp → header `x-hub-signature-256`:
 *     const expected = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex')
 *     return timingSafeEqualStr(req.headers.get('x-hub-signature-256'), expected)
 *
 *   google-ads → conforme o esquema do provider.
 *
 * Assinatura prova a ORIGEM (veio do provider); o token continua resolvendo a
 * CLÍNICA (Meta manda evento de uma page/conta → ainda precisa do mapa por-clínica).
 * Por isso as duas camadas coexistem.
 */
export function verifyProviderSignature(
  _provider: string,
  _req: Request,
  _rawBody: string
): boolean {
  // TODO(adapters reais): validar HMAC por provider. Ver doc acima.
  return true
}
