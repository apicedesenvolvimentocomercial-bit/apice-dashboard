'use client'

import { forwardRef, useEffect, useRef, useState } from 'react'
import { INPUT_BASE_CLASS } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// ─── smart mask engine ───────────────────────────────────────────────────────

type MaskResult = { display: string; paddedDigits: string }

function processField(
  d: string,
  pos: number,
  maxFirst: number,
  maxValue: number
): { advance: boolean; chunk: string; consumed: number } | null {
  if (pos >= d.length) return null
  const first = parseInt(d[pos])
  if (first > maxFirst) {
    return { advance: true, chunk: '0' + d[pos], consumed: 1 }
  }
  if (pos + 1 < d.length) {
    const raw = parseInt(d[pos] + d[pos + 1])
    const chunk = String(Math.min(raw, maxValue)).padStart(2, '0')
    return { advance: true, chunk, consumed: 2 }
  }
  return { advance: false, chunk: d[pos], consumed: 1 }
}

function applyDateMask(raw: string): MaskResult {
  const d = raw.replace(/\D/g, '')
  let pos = 0,
    pd = '',
    display = ''

  const day = processField(d, pos, 3, 31)
  if (!day) return { display, paddedDigits: pd }
  pd += day.chunk
  pos += day.consumed
  if (day.advance) {
    display = day.chunk + '/'
  } else {
    return { display: day.chunk, paddedDigits: day.chunk }
  }

  const month = processField(d, pos, 1, 12)
  if (!month) return { display, paddedDigits: pd }
  pd += month.chunk
  pos += month.consumed
  if (month.advance) {
    display += month.chunk + '/'
  } else {
    display += month.chunk
    return { display, paddedDigits: pd }
  }

  const yearLen = Math.min(4, d.length - pos)
  const year = d.slice(pos, pos + yearLen)
  pd += year
  display += year

  return { display, paddedDigits: pd }
}

// ─── converters ──────────────────────────────────────────────────────────────

// Raw digits = exactly what the user typed (no auto-padded zeros)
// These are tracked separately so backspace removes 1 user-typed digit, not 1 padded digit.

function isoToRawDate(iso: string): string {
  if (!iso || iso.length < 10) return ''
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return ''
  return d + m + y // "DDMMYYYY" = 8 chars
}

function paddedToISO(pd: string): string {
  if (pd.length < 8) return ''
  return `${pd.slice(4, 8)}-${pd.slice(2, 4)}-${pd.slice(0, 2)}`
}

function syntheticEvent(value: string): React.ChangeEvent<HTMLInputElement> {
  return { target: { value } } as React.ChangeEvent<HTMLInputElement>
}

// Force cursor to end — prevents mid-string insertion which breaks digit extraction
function cursorToEnd(el: HTMLInputElement) {
  const len = el.value.length
  el.setSelectionRange(len, len)
}

// ─── shared ──────────────────────────────────────────────────────────────────

type BaseProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange'
> & {
  value?: string
  onChange?: React.ChangeEventHandler<HTMLInputElement>
}

// ─── DateInput ───────────────────────────────────────────────────────────────

export const DateInput = forwardRef<HTMLInputElement, BaseProps>(
  ({ value, onChange, className, placeholder = 'DD/MM/AAAA', ...props }, ref) => {
    const [rawDigits, setRawDigits] = useState(() => isoToRawDate(value ?? ''))
    const rawRef = useRef(rawDigits)
    rawRef.current = rawDigits

    const { display, paddedDigits } = applyDateMask(rawDigits)

    // Only sync from external value if it differs from what we'd produce
    useEffect(() => {
      const currentISO = paddedToISO(applyDateMask(rawRef.current).paddedDigits)
      if (currentISO !== (value ?? '')) {
        setRawDigits(isoToRawDate(value ?? ''))
      }
    }, [value])

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      if (paddedDigits.length >= 8) return // already complete, reject new digits
      const inputDigits = e.target.value.replace(/\D/g, '')
      const currentDisplayDigits = display.replace(/\D/g, '')
      if (inputDigits.length <= currentDisplayDigits.length) return
      const newTypedDigits = inputDigits.slice(currentDisplayDigits.length)
      const newRaw = (rawDigits + newTypedDigits).slice(0, 8)
      const { paddedDigits: pd } = applyDateMask(newRaw)
      setRawDigits(newRaw)
      onChange?.(syntheticEvent(paddedToISO(pd)))
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
      if (e.key === 'Backspace') {
        e.preventDefault()
        const newRaw = rawDigits.slice(0, -1)
        const { paddedDigits: pd } = applyDateMask(newRaw)
        setRawDigits(newRaw)
        onChange?.(syntheticEvent(paddedToISO(pd)))
      }
      if (e.key === 'Delete') e.preventDefault()
    }

    return (
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
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
DateInput.displayName = 'DateInput'
