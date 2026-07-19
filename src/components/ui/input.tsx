import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Estilo canônico de campo de formulário — altura `h-9`, fundo transparente,
 * sombra sutil e anel de foco de 1px COLADO à borda (o antigo `ring-2` +
 * `ring-offset-2` desenhava um halo destacado, mais pesado).
 *
 * Todo controle de formulário (input, select, textarea, inputs com máscara)
 * reusa esta constante em vez de recopiar as classes — foi a cópia manual que
 * deixou o sistema com dois visuais diferentes de campo.
 */
export const INPUT_BASE_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'

type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          INPUT_BASE_CLASS,
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export { Input }
