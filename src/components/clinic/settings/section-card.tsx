import { ChevronDown } from 'lucide-react'
import { forwardRef } from 'react'

import { FieldError as SharedFieldError } from '@/components/ui/field-error'
import { cn } from '@/lib/utils'

/**
 * Primitivos da tela Configurações — redesign Senno (Configurações-handoff §5,
 * "shell de seção"). Toda categoria renderiza dentro do MESMO card de seção
 * (radius 14, padding 24×26, sombra tingida) e reusa label/input/select/botões
 * daqui — mantém as 9 seções idênticas sem repetir string de classe.
 *
 * O CABEÇALHO (título/descrição/ação) mora FORA da caixa, acima dela: na visão
 * "Todas" as seções empilham e o título dentro do card não separava os grupos
 * o suficiente. O respiro entre grupos + o filete divisor ficam no shell
 * (`clinic-settings-shell`), não aqui.
 */

export const SETTINGS_LABEL = 'mb-[7px] block text-xs font-semibold text-muted-foreground'

export const SETTINGS_INPUT =
  'h-10 w-full rounded-[9px] border border-input bg-background px-3 text-[13.5px] text-foreground transition-shadow placeholder:text-muted-foreground/70 focus:border-ring focus:outline-none focus:[box-shadow:0_0_0_3px_hsl(var(--ring)/0.18)] disabled:cursor-not-allowed disabled:opacity-60'

export const SETTINGS_TEXTAREA =
  'w-full resize-y rounded-[9px] border border-input bg-background px-3 py-2.5 text-[13.5px] leading-normal text-foreground transition-shadow placeholder:text-muted-foreground/70 focus:border-ring focus:outline-none focus:[box-shadow:0_0_0_3px_hsl(var(--ring)/0.18)]'

/**
 * Primário na escala de Configurações: 40px para casar com os `SETTINGS_INPUT`
 * (h-10) ao lado. Fora desta tela a ação primária é o `ActionButton` (38px) —
 * não troque um pelo outro.
 */
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
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          'px-0.5',
          headerRight && 'flex flex-wrap items-start justify-between gap-x-4 gap-y-3'
        )}
      >
        <div className="min-w-0">
          <h2 className="m-0 text-[16.5px] font-semibold tracking-[-0.01em]">{title}</h2>
          {description && (
            <p className="m-0 mt-[5px] max-w-[70ch] text-[13px] leading-[1.55] text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {headerRight}
      </div>
      <section
        className={cn(
          'rounded-[14px] border border-border bg-card px-[26px] py-6 shadow-card max-sm:px-5',
          className
        )}
      >
        {children}
      </section>
    </div>
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

/**
 * Mensagem de validação inline (nunca alert()). Reexporta o primitivo canônico
 * só para acrescentar o respiro vertical das seções — a garantia de uma linha
 * (e a largura máxima) vem de `FieldError`.
 */
export function FieldError({ message }: { message?: string }) {
  return <SharedFieldError message={message} className="mt-1.5" />
}
