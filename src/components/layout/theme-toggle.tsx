'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'

/**
 * Switch claro/escuro do rodapé da sidebar. Único consumidor de `useTheme()` na
 * app (CLAUDE.md: o hook vive só no botão de troca, nunca nas telas — os tokens
 * semânticos resolvem o resto por cascata da classe `.dark`).
 *
 * `mounted` evita mismatch de hidratação: no SSR o tema real é desconhecido, então
 * só renderizamos o ícone correto após montar no cliente. `collapsed` espelha o
 * estado da SidebarShell para esconder o rótulo junto com os itens de navegação.
 */
export function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const isDark = resolvedTheme === 'dark'
  const next = isDark ? 'light' : 'dark'
  const label = isDark ? 'Modo claro' : 'Modo escuro'

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      )}
      title={label}
      aria-label={label}
    >
      {/* Antes de montar, mostra o sol como placeholder neutro (sem piscar). */}
      {mounted && isDark ? (
        <Sun className="h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span
        className={cn(
          'truncate whitespace-nowrap transition-[transform,opacity] duration-200 ease-in-out',
          collapsed ? 'pointer-events-none -translate-x-2 opacity-0' : 'translate-x-0 opacity-100'
        )}
      >
        {mounted ? label : 'Tema'}
      </span>
    </button>
  )
}
