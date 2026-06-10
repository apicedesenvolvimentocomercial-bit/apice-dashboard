import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { headers } from 'next/headers'
import { CookieConsent } from '@/components/cookie-consent'
import { DismissibleToaster } from '@/components/dismissible-toaster'
import { ThemeProvider } from '@/components/providers/theme-provider'

import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default: 'Senno',
    template: '%s | Senno',
  },
  description: 'Sistema operacional para gestão e crescimento de clínicas estéticas',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Nonce de CSP setado pelo middleware; fia até o next-themes (único <script>
  // inline). Ler headers() torna o layout dinâmico — esperado p/ CSP com nonce.
  const nonce = (await headers()).get('x-nonce') ?? undefined
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider nonce={nonce}>
          {children}
          <CookieConsent />
          <DismissibleToaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
