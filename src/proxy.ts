import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { auth } from '@/server/auth'

const PUBLIC_ROUTES = [
  '/login',
  '/accept-invite',
  '/forgot-password',
  '/reset-password',
  '/privacidade',
]
// `/settings` não entra aqui: a página é compartilhada entre admin e dono
// de clínica ((account)/settings/page.tsx renderiza cards diferentes por role).
const ADMIN_ROUTES = ['/dashboard', '/clients', '/pipeline', '/activities', '/calendar', '/staff']
const CLIENT_ROUTES = [
  '/overview',
  '/insights',
  '/goals',
  '/crm',
  '/financial',
  '/patients',
  '/appointments',
  '/procedures',
]

/**
 * CSP por-request com nonce (defesa de profundidade contra XSS — `prompt/
 * seguranca-pendencias.md`). PROD: `script-src 'self' 'nonce-…' 'strict-dynamic'`
 * (só script com o nonce, ou carregado por um que tenha, executa). DEV: relaxa
 * p/ `'unsafe-eval' 'unsafe-inline'` (HMR/React Refresh do Next usam eval +
 * inline). `style-src 'unsafe-inline'`: Radix/shadcn/next-font injetam estilo
 * inline não-assinável (XSS via estilo é risco baixo). O Next lê o nonce do
 * header de CSP da request e o aplica aos seus <script>; o next-themes recebe
 * via prop (layout lê `x-nonce`). `connect-src` libera o ingest do Sentry.
 */
const isProd = process.env.NODE_ENV === 'production'

function buildCsp(nonce: string): string {
  const scriptSrc = isProd
    ? `'self' 'nonce-${nonce}' 'strict-dynamic'`
    : `'self' 'unsafe-eval' 'unsafe-inline'`

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    `connect-src 'self' https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ')
}

/**
 * Next.js 16 renomeou `middleware.ts` para `proxy.ts` — o export precisa
 * se chamar `proxy`. Faz o gate de auth (redirect por role) E injeta a CSP.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = buildCsp(nonce)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  // O Next lê o nonce DESTE header (na request) e o propaga aos seus <script>.
  requestHeaders.set('content-security-policy', csp)

  const withCsp = (res: NextResponse) => {
    res.headers.set('content-security-policy', csp)
    return res
  }
  const next = () => withCsp(NextResponse.next({ request: { headers: requestHeaders } }))

  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return next()
  }

  const session = await auth()

  if (!session?.user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return withCsp(NextResponse.redirect(loginUrl))
  }

  const role = session.user.role
  const isAdminOrStaff = role === 'ADMIN' || role === 'STAFF'
  const isClientUser = role === 'CLIENT_OWNER' || role === 'CLIENT_STAFF'

  const isAdminRoute = ADMIN_ROUTES.some((r) => pathname.startsWith(r))
  const isClientRoute = CLIENT_ROUTES.some((r) => pathname.startsWith(r))

  // Mandar client para a home dele (/overview) — `/dashboard` é admin-only
  // e tambem entra em ADMIN_ROUTES, o que criaria loop infinito de redirect.
  if (isAdminRoute && !isAdminOrStaff) {
    return withCsp(NextResponse.redirect(new URL('/overview', request.url)))
  }

  if (isClientRoute && !isClientUser) {
    return withCsp(NextResponse.redirect(new URL('/dashboard', request.url)))
  }

  if (pathname === '/') {
    if (isAdminOrStaff) return withCsp(NextResponse.redirect(new URL('/dashboard', request.url)))
    if (isClientUser) return withCsp(NextResponse.redirect(new URL('/overview', request.url)))
  }

  return next()
}

export const config = {
  // Pula assets estáticos e API; `missing` pula requests de prefetch — evita
  // nonce divergente entre prefetch e navegação (RSC cacheado com nonce velho).
  // O gate de auth ainda roda na navegação real (e há gate no topo de cada page).
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
