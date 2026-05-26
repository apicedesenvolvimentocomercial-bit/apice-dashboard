'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

/**
 * Provider de tema (claro/escuro) via next-themes. Aplica a classe `.dark` no
 * <html> (Tailwind `darkMode: ['class']`), de onde os tokens semânticos de
 * `globals.css` resolvem por cascata — nenhuma tela precisa consumir o hook.
 *
 * `attribute="class"` + `disableTransitionOnChange` evita flash de transição ao
 * trocar. `defaultTheme="light"` mantém o comportamento atual (app nascia fixo
 * no claro) como fallback antes da primeira escolha do usuário.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}
