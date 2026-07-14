/**
 * Núcleo da extração: dado um objeto `Headers`, devolve o IP do cliente. Atrás de
 * proxy (Vercel/Supabase), o IP real vem em `x-forwarded-for` (lista; o 1º é o
 * cliente) ou `x-real-ip`. Fallback `'unknown'` agrupa o que não tem header —
 * pior caso é um throttle compartilhado, nunca um bypass. Server actions não
 * recebem `Request`; usam `getIpFromHeaders(await headers())`.
 */
export function getIpFromHeaders(headers: Headers): string {
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return headers.get('x-real-ip')?.trim() || 'unknown'
}

/** Extrai o IP do cliente de uma Request (route handlers / `authorize`). */
export function getRequestIp(req: Request): string {
  return getIpFromHeaders(req.headers)
}
