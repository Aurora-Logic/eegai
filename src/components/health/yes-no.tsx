import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

/**
 * A spec-style Y/N question.
 *
 * `null` until answered, so an untouched question is visibly unanswered rather
 * than quietly "no" — for "is it clean and dry" that difference matters.
 */
export function YesNo({
  id,
  label,
  value,
  onChange,
  error,
}: {
  id: string
  label: string
  value: boolean | null
  onChange: (next: boolean) => void
  error?: string | undefined
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{label}</legend>
      <RadioGroup
        value={value === null ? '' : value ? 'yes' : 'no'}
        onValueChange={(v) => onChange(v === 'yes')}
        className="flex gap-2"
        aria-label={label}
      >
        {(['yes', 'no'] as const).map((option) => (
          <Label
            key={option}
            htmlFor={`${id}-${option}`}
            className="hairline flex min-h-11 min-w-20 cursor-pointer items-center gap-2 rounded-sm bg-card px-3 has-[[data-state=checked]]:bg-primary/15"
          >
            <RadioGroupItem value={option} id={`${id}-${option}`} />
            {option === 'yes' ? 'Yes' : 'No'}
          </Label>
        ))}
      </RadioGroup>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </fieldset>
  )
}
