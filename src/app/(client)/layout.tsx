import { redirect } from 'next/navigation'

import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppTopbar } from '@/components/layout/app-topbar'
import { auth } from '@/server/auth'

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session?.user) redirect('/login')

  const role = session.user.role
  if (role !== 'CLIENT_OWNER' && role !== 'CLIENT_STAFF') redirect('/dashboard')

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar role={role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppTopbar user={session.user} />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
