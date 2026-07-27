import * as React from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface ComboboxOption {
  value: string
  label: string
  /** Second line, and also searchable — e.g. a pincode under an area name. */
  detail?: string
}

/**
 * Searchable single-select, composed from shadcn's Command and Popover exactly
 * as the shadcn docs describe — the registry ships the pieces, not the pattern.
 *
 * Used wherever a plain Select would mean scrolling a long list on a phone:
 * a donor picking their area out of ~40, an admin picking an NGO.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'Nothing found.',
  id,
  className,
  disabled,
  'aria-invalid': ariaInvalid,
}: {
  options: ComboboxOption[]
  value: string | undefined
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  id?: string
  className?: string
  disabled?: boolean
  'aria-invalid'?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const selected = options.find((option) => option.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={ariaInvalid}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', className)}
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        // The list can be long; keep it inside the viewport on a short screen.
        collisionPadding={12}
      >
        <Command
          filter={(itemValue, search) => {
            const option = options.find((o) => o.value === itemValue)
            if (!option) return 0
            const haystack = `${option.label} ${option.detail ?? ''}`.toLowerCase()
            return haystack.includes(search.toLowerCase()) ? 1 : 0
          }}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={(next) => {
                    onChange(next)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 size-4 shrink-0',
                      option.value === value ? 'opacity-100' : 'opacity-0',
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block truncate">{option.label}</span>
                    {option.detail ? (
                      <span className="block font-mono text-xs text-muted-foreground">
                        {option.detail}
                      </span>
                    ) : null}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
