'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

/**
 * Provider de tema (claro/escuro) via next-themes. Aplica a classe `.dark` no
 * <html> (Tailwind `darkMode: ['class']`), de onde os tokens semânticos de
 * `globals.css` resolvem por cascata — nenhuma tela precisa consumir o hook.
 *
 * `attribute="class"` + `disableTransitionOnChange` evita flash de transição ao
 * trocar. `defaultTheme="system"` faz a app seguir o SO até o usuário escolher
 * explicitamente claro/escuro nas configurações; `enableSystem` habilita esse
 * terceiro modo (a preferência mora no localStorage, sem persistência no banco).
 */
export function ThemeProvider({
  children,
  nonce,
}: {
  children: React.ReactNode
  /** Nonce de CSP (vem do middleware) aplicado ao <script> inline que o
   * next-themes injeta p/ setar a classe de tema antes da pintura. Sem ele a
   * CSP `script-src 'strict-dynamic'` bloquearia o script → flash de tema. */
  nonce?: string
}) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      nonce={nonce}
    >
      {children}
    </NextThemesProvider>
  )
}
