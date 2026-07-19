'use client'

import { forwardRef } from 'react'

import { INPUT_BASE_CLASS } from '@/components/ui/input'
import { sanitizeInteger } from '@/lib/masks'
import { cn } from '@/lib/utils'

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  /** Valor como string de dígitos — converta com `Number()` antes de enviar. */
  value?: string
  onChange?: React.ChangeEventHandler<HTMLInputElement>
  /** Quantos dígitos cabem. Derive do teto do campo no zod da action. */
  maxDigits?: number
}

function syntheticEvent(value: string): React.ChangeEvent<HTMLInputElement> {
  return { target: { value } } as React.ChangeEvent<HTMLInputElement>
}

/**
 * Input de inteiro positivo: aceita apenas dígitos. Qualquer outro caractere é
 * descartado na digitação (não é validação a posteriori — o caractere não entra).
 *
 * Não usa `type="number"`: o input nativo deixa passar `e`, `+`, `-`, `.` e
 * notação científica, e a seta do spinner esconde o teto real do campo. Aqui o
 * `.int()` do zod é garantido antes de o valor existir.
 */
export const IntegerInput = forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, className, maxDigits, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        value={sanitizeInteger(value ?? '', maxDigits)}
        onChange={(e) => onChange?.(syntheticEvent(sanitizeInteger(e.target.value, maxDigits)))}
        className={cn(INPUT_BASE_CLASS, className)}
        {...props}
      />
    )
  }
)
IntegerInput.displayName = 'IntegerInput'
