'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

/**
 * Toggle de tema do topbar (redesign — handoff §3.2): botão 38px com sol/lua
 * sobrepostos; o swap (rotação+fade) é 100% CSS dirigido pela classe `.dark`
 * no <html> (classes `senno-theme-*` em globals.css) — sem estado visual no
 * React, logo sem flash de hidratação.
 */
export function TopbarThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      title="Alternar tema"
      aria-label="Alternar tema claro/escuro"
      className="relative h-[38px] w-[38px] flex-none overflow-hidden rounded-[9px] border border-border bg-background text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="senno-theme-ico senno-theme-sun" aria-hidden="true">
        <Sun className="h-[17px] w-[17px]" />
      </span>
      <span className="senno-theme-ico senno-theme-moon" aria-hidden="true">
        <Moon className="h-[17px] w-[17px]" />
      </span>
    </button>
  )
}
