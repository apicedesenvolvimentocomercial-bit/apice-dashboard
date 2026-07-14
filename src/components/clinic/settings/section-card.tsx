import { ChevronDown } from 'lucide-react'
import { forwardRef } from 'react'

import { cn } from '@/lib/utils'

/**
 * Primitivos da tela Configurações — redesign Senno (Configurações-handoff §5,
 * "shell de seção"). Toda categoria renderiza dentro do MESMO card de seção
 * (radius 14, padding 24×26, sombra tingida) e reusa label/input/select/botões
 * daqui — mantém as 9 seções idênticas sem repetir string de classe.
 */

export const SETTINGS_LABEL = 'mb-[7px] block text-xs font-semibold text-muted-foreground'

export const SETTINGS_INPUT =
  'h-10 w-full rounded-[9px] border border-input bg-background px-3 text-[13.5px] text-foreground transition-shadow placeholder:text-muted-foreground/70 focus:border-ring focus:outline-none focus:[box-shadow:0_0_0_3px_hsl(var(--ring)/0.18)] disabled:cursor-not-allowed disabled:opacity-60'

export const SETTINGS_TEXTAREA =
  'w-full resize-y rounded-[9px] border border-input bg-background px-3 py-2.5 text-[13.5px] leading-normal text-foreground transition-shadow placeholder:text-muted-foreground/70 focus:border-ring focus:outline-none focus:[box-shadow:0_0_0_3px_hsl(var(--ring)/0.18)]'

export const SETTINGS_BTN_PRIMARY =
  'inline-flex h-10 flex-none items-center justify-center gap-[7px] rounded-[9px] bg-primary px-[18px] text-[13.5px] font-semibold text-primary-foreground transition-[filter] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60'

export const SETTINGS_BTN_GHOST =
  'inline-flex h-[34px] flex-none items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-[15px] text-[12.5px] font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60'

/** Rodapé de ação do card: separado por border-top, botão à direita. */
export const SETTINGS_FOOTER =
  'mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5'

/** Card de seção padrão (§5): toda categoria mora num destes. */
export function SettingsSectionCard({
  title,
  description,
  headerRight,
  children,
  className,
}: {
  title: string
  description?: React.ReactNode
  /** Ação alinhada ao cabeçalho (ex.: "Novo cargo" em Cargos — §14). */
  headerRight?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'rounded-[14px] border border-border bg-card px-[26px] py-6 shadow-card max-sm:px-5',
        className
      )}
    >
      <div className={cn('mb-5', headerRight && 'flex items-start justify-between gap-4')}>
        <div className="min-w-0">
          <h2 className="m-0 text-[16.5px] font-semibold tracking-[-0.01em]">{title}</h2>
          {description && (
            <p className="m-0 mt-[5px] text-[13px] leading-[1.55] text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {headerRight}
      </div>
      {children}
    </section>
  )
}

/** Select nativo com chevron overlay (§16.1) — compatível com RHF `register`. */
export const SettingsSelect = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function SettingsSelect({ className, children, ...props }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          'h-10 w-full cursor-pointer appearance-none rounded-[9px] border border-input bg-background pl-3 pr-[34px] text-[13.5px] text-foreground transition-shadow focus:border-ring focus:outline-none focus:[box-shadow:0_0_0_3px_hsl(var(--ring)/0.18)] disabled:cursor-not-allowed disabled:opacity-60',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  )
})

/** Mensagem de validação inline (nunca alert()). */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="m-0 mt-1.5 text-xs text-destructive">{message}</p>
}
