'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/layout/theme-toggle'

export type NavItem = {
  href: string
  label: string
  icon: React.ElementType
}

function useActiveItem(pathname: string, navItems: NavItem[]) {
  const hrefs = navItems.map((i) => i.href)
  return (href: string) => {
    if (pathname === href) return true
    if (!pathname.startsWith(href + '/')) return false
    // Only active if no more-specific nav item also matches this pathname
    return !hrefs.some((h) => h !== href && h.startsWith(href) && pathname.startsWith(h))
  }
}

/**
 * Casca de navegação BURRA — sem nenhuma noção de domínio nem de role. Recebe a
 * lista de itens já montada pelo sidebar do domínio (admin ou clínica) e cuida
 * só do chrome (colapsar, marcação de ativo, render). Divisão total: cada
 * domínio tem seu próprio `*-sidebar` que decide os itens; esta casca é o único
 * pedaço compartilhado (Fase 5).
 */
export function SidebarShell({ navItems }: { navItems: NavItem[] }) {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const isActive = useActiveItem(pathname, navItems)

  return (
    <aside
      className={cn(
        'relative flex h-full flex-col border-r bg-card text-card-foreground',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* overflow-hidden here clips text during the width transition
          without affecting the absolutely-positioned toggle button */}
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex h-14 min-h-14 items-center border-b px-4">
          <span
            className={cn(
              'truncate text-sm font-bold text-primary',
              'transition-[transform,opacity] duration-200 ease-in-out',
              collapsed
                ? 'pointer-events-none -translate-x-2 opacity-0'
                : 'translate-x-0 opacity-100'
            )}
          >
            KPI Clinic OS
          </span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto py-2 pl-2 pr-3">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
                title={item.label}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span
                  className={cn(
                    'truncate whitespace-nowrap transition-[transform,opacity] duration-200 ease-in-out',
                    collapsed
                      ? 'pointer-events-none -translate-x-2 opacity-0'
                      : 'translate-x-0 opacity-100'
                  )}
                >
                  {item.label}
                </span>
              </Link>
            )
          })}
        </nav>

        {/* Rodapé: switch de tema (claro/escuro) no canto inferior esquerdo.
            Dentro do wrapper overflow-hidden → o rótulo recolhe junto com a nav. */}
        <div className="border-t py-2 pl-2 pr-3">
          <ThemeToggle collapsed={collapsed} />
        </div>
      </div>

      {/* z-10 keeps the button above the main content area */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-[10px] top-16 z-10 flex h-5 w-5 items-center justify-center rounded-full border bg-card shadow-sm hover:bg-accent"
        aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>
    </aside>
  )
}
