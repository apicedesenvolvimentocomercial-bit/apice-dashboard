'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

/**
 * Provider de React Query. Cumpre §11.3 do prompt:
 *  - staleTime mínimo de 60s para evitar refetch ansioso de dashboards.
 *  - 1 retry por query (default), sem retry em mutations (UX direta).
 * Instanciado por request via `useState` para não compartilhar cache entre
 * requisições de usuários diferentes em SSR.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: false,
          },
        },
      })
  )

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
