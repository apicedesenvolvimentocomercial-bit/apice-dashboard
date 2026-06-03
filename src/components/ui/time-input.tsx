'use client'

import * as React from 'react'
import { Clock } from 'lucide-react'

import { cn } from '@/lib/utils'

type TimeInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>

/**
 * Input de horário (`<input type="time">`) com ícone de relógio à direita para
 * deixar claro que é um campo de hora e dar um alvo de clique que abre o seletor
 * nativo (`showPicker`). O indicador nativo do webkit é escondido em favor do
 * nosso ícone. Mantém o visual do `Input` padrão (mesma altura/borda/tokens).
 */
const TimeInput = React.forwardRef<HTMLInputElement, TimeInputProps>(
  ({ className, disabled, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement | null>(null)
    const setRefs = (el: HTMLInputElement | null) => {
      innerRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el
    }

    function openPicker() {
      const el = innerRef.current
      if (!el || el.disabled) return
      // showPicker abre o relógio nativo; fallback p/ focus onde não há suporte.
      if (typeof el.showPicker === 'function') {
        try {
          el.showPicker()
        } catch {
          el.focus()
        }
      } else {
        el.focus()
      }
    }

    return (
      <div className="relative">
        <input
          ref={setRefs}
          type="time"
          disabled={disabled}
          className={cn(
            'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-9 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-calendar-picker-indicator]:hidden',
            className
          )}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={openPicker}
          disabled={disabled}
          aria-label="Abrir seletor de horário"
          className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <Clock className="h-4 w-4" />
        </button>
      </div>
    )
  }
)
TimeInput.displayName = 'TimeInput'

export { TimeInput }
