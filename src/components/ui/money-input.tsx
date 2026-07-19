'use client'

import { forwardRef } from 'react'

import { INPUT_BASE_CLASS } from '@/components/ui/input'
import { sanitizeMoneyBR } from '@/lib/masks'
import { cn } from '@/lib/utils'

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  /** Valor em pt-BR (`1234,56`) — converta com `parseMoneyBR` antes de enviar. */
  value?: string
  onChange?: React.ChangeEventHandler<HTMLInputElement>
}

function syntheticEvent(value: string): React.ChangeEvent<HTMLInputElement> {
  return { target: { value } } as React.ChangeEvent<HTMLInputElement>
}

/**
 * Input monetário pt-BR: aceita apenas dígitos e UMA vírgula, com no máximo 2
 * casas de centavos. Qualquer outro caractere é descartado na digitação (não é
 * validação a posteriori — o caractere simplesmente não entra).
 *
 * Não usa `type="number"`: o input nativo aceitaria `e`/`+`/`-` e notação
 * científica, e usa ponto como separador decimal.
 */
export const MoneyInput = forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, className, placeholder = '0,00', ...props }, ref) => {
    return (
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        value={sanitizeMoneyBR(value ?? '')}
        placeholder={placeholder}
        onChange={(e) => onChange?.(syntheticEvent(sanitizeMoneyBR(e.target.value)))}
        className={cn(INPUT_BASE_CLASS, className)}
        {...props}
      />
    )
  }
)
MoneyInput.displayName = 'MoneyInput'
