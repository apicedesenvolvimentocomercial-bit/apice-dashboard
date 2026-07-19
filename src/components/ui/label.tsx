'use client'

import * as LabelPrimitive from '@radix-ui/react-label'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * `block` é o que faz o `leading-none` valer. Como `<label>` é INLINE por
 * padrão, a caixa de linha do rótulo era esticada pelo strut do container (24px
 * de line-height herdado) em vez dos 14px do próprio rótulo — ~10px de espaço
 * morto entre o rótulo e cada input, em todo formulário do sistema.
 *
 * Rótulo dentro de flex/grid já era blocificado pelo container, então lá isto
 * não muda nada; nenhum uso depende do rótulo fluir no meio de um texto.
 */
const labelVariants = cva(
  'block text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
)

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn(labelVariants(), className)} {...props} />
))
Label.displayName = LabelPrimitive.Root.displayName

export { Label }
