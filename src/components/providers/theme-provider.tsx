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
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}
