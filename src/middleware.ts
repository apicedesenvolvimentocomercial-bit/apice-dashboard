import { NextResponse } from 'next/server'

import { auth } from '@/server/auth'

export default auth((req) => {
  const session = req.auth
  const { pathname } = req.nextUrl

  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const role = session.user.role
  const isAdmin = role === 'ADMIN' || role === 'STAFF'
  const isClient = role === 'CLIENT_OWNER' || role === 'CLIENT_STAFF'

  const isAdminRoute = pathname.startsWith('/clients') || pathname.startsWith('/dashboard')

  const isClientRoute =
    pathname.startsWith('/crm') ||
    pathname.startsWith('/patients') ||
    pathname.startsWith('/appointments')

  if (isAdminRoute && !isAdmin) {
    return NextResponse.redirect(new URL('/crm', req.url))
  }

  if (isClientRoute && !isClient) {
    return NextResponse.redirect(new URL('/clients', req.url))
  }
})

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon\\.ico|login|accept-invite).*)'],
}
