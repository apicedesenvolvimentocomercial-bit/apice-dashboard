'use client'

import { forwardRef } from 'react'

import { INPUT_BASE_CLASS } from '@/components/ui/input'
import { formatCpf } from '@/lib/masks'
import { cn } from '@/lib/utils'

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  /** Valor MASCARADO (`123.456.789-01`) — é o que vai para a action. */
  value?: string
  onChange?: React.ChangeEventHandler<HTMLInputElement>
}

function syntheticEvent(value: string): React.ChangeEvent<HTMLInputElement> {
  return { target: { value } } as React.ChangeEvent<HTMLInputElement>
}

// Cursor sempre no fim: edição no meio da string quebraria a extração de dígitos.
function cursorToEnd(el: HTMLInputElement) {
  el.setSelectionRange(el.value.length, el.value.length)
}

/**
 * Input de CPF com máscara `123.456.789-01`.
 *
 * O `onChange` emite o valor JÁ mascarado — o mesmo formato que `CPF_REGEX` e
 * `isValidCpf` exigem. Só dígitos entram (letra/símbolo é descartado pela
 * `formatCpf`); colar texto sujo (`123.456.789/01`) também converge para a máscara.
 */
export const CpfInput = forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, className, placeholder = '123.456.789-01', ...props }, ref) => {
    const display = formatCpf(value ?? '')
    const digits = display.replace(/\D/g, '')

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      onChange?.(syntheticEvent(formatCpf(e.target.value)))
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
      // Backspace precisa apagar um DÍGITO; sem isto o usuário ficaria preso
      // apagando separadores (`.`/`-`) que a máscara recria em seguida.
      if (e.key === 'Backspace') {
        e.preventDefault()
        onChange?.(syntheticEvent(formatCpf(digits.slice(0, -1))))
      }
      if (e.key === 'Delete') e.preventDefault()
    }

    return (
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        maxLength={14}
        value={display}
        placeholder={placeholder}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={(e) => cursorToEnd(e.currentTarget)}
        onFocus={(e) => cursorToEnd(e.currentTarget)}
        className={cn(INPUT_BASE_CLASS, className)}
        {...props}
      />
    )
  }
)
CpfInput.displayName = 'CpfInput'
