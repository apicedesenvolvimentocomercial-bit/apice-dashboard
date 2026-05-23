import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { CookieConsent } from '@/components/cookie-consent'
import { DismissibleToaster } from '@/components/dismissible-toaster'
import { QueryProvider } from '@/components/providers/query-provider'

import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default: 'KPI Clinic OS',
    template: '%s | KPI Clinic OS',
  },
  description: 'Sistema operacional para gestão e crescimento de clínicas estéticas',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={inter.className}>
        <QueryProvider>{children}</QueryProvider>
        <CookieConsent />
        <DismissibleToaster />
      </body>
    </html>
  )
}
