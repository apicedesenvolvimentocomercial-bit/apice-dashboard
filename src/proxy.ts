import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { auth } from '@/server/auth'

const PUBLIC_ROUTES = ['/login', '/accept-invite', '/forgot-password', '/reset-password']
const ADMIN_ROUTES = [
  '/dashboard',
  '/clients',
  '/pipeline',
  '/activities',
  '/calendar',
  '/reports',
  '/staff',
  '/settings',
]
const CLIENT_ROUTES = ['/crm', '/financial', '/patients', '/appointments', '/procedures']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next()
  }

  const session = await auth()

  if (!session?.user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const role = session.user.role
  const isAdminOrStaff = role === 'ADMIN' || role === 'STAFF'
  const isClientUser = role === 'CLIENT_OWNER' || role === 'CLIENT_STAFF'

  const isAdminRoute = ADMIN_ROUTES.some((r) => pathname.startsWith(r))
  const isClientRoute = CLIENT_ROUTES.some((r) => pathname.startsWith(r))

  if (isAdminRoute && !isAdminOrStaff) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (isClientRoute && !isClientUser) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (pathname === '/') {
    if (isAdminOrStaff) return NextResponse.redirect(new URL('/dashboard', request.url))
    if (isClientUser) return NextResponse.redirect(new URL('/crm', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
