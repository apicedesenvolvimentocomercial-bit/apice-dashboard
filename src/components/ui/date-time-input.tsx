'use client'

import * as React from 'react'

import { DateInput } from '@/components/ui/date-input'
import { TimeInput } from '@/components/ui/time-input'
import { cn } from '@/lib/utils'

/**
 * Campo de "data e hora" — substitui `<input type="datetime-local">`, cujo popup
 * é o do SO (mesmo problema do `type="date"`: não estilizável, fora do chrome).
 *
 * Visual: UM campo com borda única contendo DOIS controles (o padrão que já
 * existia no diálogo de atividade) — `DateInput` com o nosso calendário +
 * `TimeInput`. O `value` continua no formato do `datetime-local`
 * ("YYYY-MM-DDTHH:mm") e o `onChange` emite um evento sintético com ele, então
 * a troca é drop-in para quem já lia `e.target.value`.
 */

type DateTimeInputProps = {
  /** "YYYY-MM-DDTHH:mm" ou '' (vazio/incompleto). */
  value: string
  onChange: React.ChangeEventHandler<HTMLInputElement>
  onBlur?: React.FocusEventHandler<HTMLInputElement>
  /** Vai no campo de data (o `<Label htmlFor>` aponta p/ ele). */
  id?: string
  /** Limites em "YYYY-MM-DDTHH:mm"; só a parte de DATA chega ao calendário. */
  min?: string
  max?: string
  disabled?: boolean
  /** Pinta a borda de `destructive` (o erro em si é do `FieldError` do form). */
  invalid?: boolean
  /** Classe da CAIXA (é ela que tem a borda), não de um dos inputs. */
  className?: string
}

function syntheticEvent(value: string): React.ChangeEvent<HTMLInputElement> {
  return { target: { value } } as React.ChangeEvent<HTMLInputElement>
}

export function DateTimeInput({
  value,
  onChange,
  onBlur,
  id,
  min,
  max,
  disabled,
  invalid,
  className,
}: DateTimeInputProps) {
  const [date, setDate] = React.useState(() => value.slice(0, 10))
  const [time, setTime] = React.useState(() => value.slice(11, 16))

  // Metade preenchida não forma um datetime válido, então emitimos '' até as
  // duas existirem. Isso faz o pai devolver '' — que NÃO pode apagar o que o
  // usuário já digitou. Guardamos o último valor emitido p/ distinguir esse eco
  // de um reset de verdade (diálogo reabrindo), que aí sim limpa os dois campos.
  const emitted = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (value === emitted.current) return
    setDate(value.slice(0, 10))
    setTime(value.slice(11, 16))
  }, [value])

  function emit(nextDate: string, nextTime: string) {
    const combined = nextDate && nextTime ? `${nextDate}T${nextTime}` : ''
    emitted.current = combined
    onChange(syntheticEvent(combined))
  }

  return (
    <div
      className={cn(
        'flex h-9 rounded-md border border-input shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring',
        invalid && 'border-destructive focus-within:ring-destructive',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    >
      <DateInput
        id={id}
        value={date}
        onChange={(e) => {
          setDate(e.target.value)
          emit(e.target.value, time)
        }}
        onBlur={onBlur}
        disabled={disabled}
        min={min?.slice(0, 10)}
        max={max?.slice(0, 10)}
        containerClassName="h-full min-w-0 flex-1"
        className="h-full w-full rounded-none border-0 shadow-none focus-visible:ring-0"
      />
      <div className="h-5 w-px flex-none self-center bg-border" aria-hidden="true" />
      <TimeInput
        lang="pt-BR"
        value={time}
        onChange={(e) => {
          setTime(e.target.value)
          emit(date, e.target.value)
        }}
        onBlur={onBlur}
        // Hora sem data não vira nada — espelha a regra do campo de atividade.
        disabled={disabled || !date}
        aria-label="Hora"
        // Largura da hora é FIXA e a da data flexível, então cada pixel a mais
        // aqui sai do lado da data. 104px = "00:00" + px-3 + a bitola do ícone.
        containerClassName="h-full w-[104px] flex-none"
        className="h-full w-full rounded-none border-0 shadow-none focus-visible:ring-0"
      />
    </div>
  )
}
