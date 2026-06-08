'use client'

import { Command as CommandPrimitive } from 'cmdk'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type SearchableOption = { value: string; label: string; sublabel?: string }

type Props = {
  value: string
  onChange: (value: string) => void
  options: SearchableOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  id?: string
  className?: string
  // Default true. Passe `false` quando o select vive DENTRO de um Dialog — sem
  // portal a lista rola por roda/trackpad (o portal a tira do lock de scroll do
  // Dialog, que bloqueia a roda e só deixa arrastar a barra).
  portal?: boolean
}

/**
 * Select com BUSCA (combobox) para listas grandes — Lead/Paciente sobretudo, onde
 * rolar item a item é inviável. Filtra por label + sublabel (ex.: nome + telefone)
 * via cmdk. Mesma "cara" de um Select shadcn (trigger outline + popover), drop-in.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Selecionar...',
  searchPlaceholder = 'Buscar...',
  emptyText = 'Nada encontrado.',
  disabled,
  id,
  className,
  portal = true,
}: Props) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !selected && 'text-muted-foreground',
            className
          )}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        portal={portal}
      >
        <CommandPrimitive className="flex flex-col overflow-hidden rounded-md bg-popover text-popover-foreground">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <CommandPrimitive.Input
              placeholder={searchPlaceholder}
              className="flex h-10 w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <CommandPrimitive.List className="max-h-60 overflow-y-auto overflow-x-hidden p-1">
            <CommandPrimitive.Empty className="py-6 text-center text-sm text-muted-foreground">
              {emptyText}
            </CommandPrimitive.Empty>
            {options.map((o) => (
              <CommandPrimitive.Item
                key={o.value}
                // Filtro por nome + sublabel (ex.: telefone) + id.
                value={`${o.label} ${o.sublabel ?? ''} ${o.value}`}
                onSelect={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
              >
                <Check
                  className={cn(
                    'h-4 w-4 shrink-0',
                    value === o.value ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <span className="flex-1 truncate">
                  {o.label}
                  {o.sublabel && (
                    <span className="ml-1.5 text-xs text-muted-foreground">{o.sublabel}</span>
                  )}
                </span>
              </CommandPrimitive.Item>
            ))}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </PopoverContent>
    </Popover>
  )
}
