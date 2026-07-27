import { Languages } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useLocale } from '@/hooks/use-locale'
import { LOCALES, LOCALE_NAMES, setLocale } from '@/lib/i18n'

/**
 * English, Tamil, Hindi.
 *
 * Each language is listed in its own script and never translated: someone who
 * reads only Tamil needs to find தமிழ், not the Tamil word for "Tamil" rendered
 * in a language they cannot read. For the same reason the trigger is an icon
 * rather than the word "Language".
 *
 * The current language is marked with a dot rather than by disabling its row —
 * a disabled item is skipped by most screen readers, which would hide the very
 * thing the user is trying to confirm.
 */
export function LanguageSwitcher() {
  const locale = useLocale()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="min-h-11"
          aria-label={`Language — ${LOCALE_NAMES[locale]}`}
        >
          <Languages aria-hidden />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        {LOCALES.map((option) => (
          <DropdownMenuItem
            key={option}
            onSelect={() => void setLocale(option)}
            aria-current={option === locale}
            className="min-h-11 gap-2"
          >
            <span
              aria-hidden
              className={
                option === locale ? 'size-1.5 rounded-full bg-primary' : 'size-1.5 rounded-full'
              }
            />
            {LOCALE_NAMES[option]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
