/**
 * Extrai o IP do cliente de uma Request (para rate-limiting). Atrás de proxy
 * (Vercel/Supabase), o IP real vem em `x-forwarded-for` (lista; o 1º é o cliente)
 * ou `x-real-ip`. Fallback `'unknown'` agrupa o que não tem header — pior caso é
 * um throttle compartilhado, nunca um bypass.
 */
export function getRequestIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const real = req.headers.get('x-real-ip')?.trim()
  return real || 'unknown'
}
