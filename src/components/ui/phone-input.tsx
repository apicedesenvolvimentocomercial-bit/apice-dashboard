'use client'

import { forwardRef } from 'react'

import { INPUT_BASE_CLASS } from '@/components/ui/input'
import { formatPhoneBR } from '@/lib/masks'
import { cn } from '@/lib/utils'

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  /** Valor MASCARADO (`(11) 91234-1234`) — é o que vai para a action. */
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
 * Input de telefone celular BR com máscara `(11) 91234-1234`.
 *
 * O `onChange` emite o valor JÁ mascarado — o mesmo formato que `PHONE_BR_REGEX`
 * exige no zod da action. Separadores são reconstruídos a cada tecla, então
 * colar texto sujo (`+55 11 91234-1234`) também converge para a máscara.
 */
export const PhoneInput = forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, className, placeholder = '(11) 91234-1234', ...props }, ref) => {
    const display = formatPhoneBR(value ?? '')
    const digits = display.replace(/\D/g, '')

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      onChange?.(syntheticEvent(formatPhoneBR(e.target.value)))
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
      // Backspace precisa apagar um DÍGITO; sem isto o usuário ficaria preso
      // apagando separadores que a máscara recria em seguida.
      if (e.key === 'Backspace') {
        e.preventDefault()
        onChange?.(syntheticEvent(formatPhoneBR(digits.slice(0, -1))))
      }
      if (e.key === 'Delete') e.preventDefault()
    }

    return (
      <input
        ref={ref}
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        maxLength={15}
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
PhoneInput.displayName = 'PhoneInput'
