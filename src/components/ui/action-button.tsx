import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Ação primária da página no redesign Senno (design.md §"Botões" → Primário):
 * dourado sólido, radius 9px, altura 38px (32px em contexto compacto), weight
 * 600, ícone 14–15px e hover por `brightness(1.05)`.
 *
 * É a fonte ÚNICA desse visual — não repita a string de classe à mão. As cópias
 * manuais já haviam derivado para três alturas (36/38/40px) e quatro paddings,
 * e duas delas tinham perdido o anel de foco.
 *
 * NÃO cobre a escala de Configurações (`SETTINGS_BTN_PRIMARY`, 40px): lá o botão
 * é propositalmente mais alto para casar com os inputs `h-10` da própria tela.
 */
const actionButtonVariants = cva(
  'inline-flex flex-none items-center justify-center gap-[7px] whitespace-nowrap rounded-[9px] bg-primary font-semibold text-primary-foreground transition-[filter] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:size-[15px] [&_svg]:shrink-0',
  {
    variants: {
      size: {
        default: 'h-[38px] px-3.5 text-[13px]',
        compact: 'h-8 px-3 text-[12.5px]',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
)

export interface ActionButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof actionButtonVariants> {
  asChild?: boolean
}

const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(function ActionButton(
  { className, size, asChild = false, ...props },
  ref
) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      ref={ref}
      className={cn(actionButtonVariants({ size, className }))}
      {...(asChild ? null : { type: 'button' as const })}
      {...props}
    />
  )
})

export { ActionButton, actionButtonVariants }
