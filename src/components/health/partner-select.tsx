import { useQuery } from '@tanstack/react-query'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { healthApi, type OfferCategory } from '@/lib/health-client'

/** The verified organisations that take this donation, to choose one from. */
export function PartnerSelect({
  category,
  label,
  value,
  onChange,
  error,
}: {
  category: OfferCategory
  label: string
  value: string
  onChange: (id: string) => void
  error?: string | undefined
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['health', 'partners', category],
    queryFn: () => healthApi.partners(category),
  })
  const partners = data?.partners ?? []
  const chosen = partners.find((p) => p.ngo_id === value)

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`partner-${category}`}>{label}</Label>
      {isLoading ? (
        <Skeleton className="h-9 w-full" />
      ) : partners.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No verified organisation takes this yet. Check back soon.
        </p>
      ) : (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={`partner-${category}`}>
            <SelectValue placeholder="Choose one" />
          </SelectTrigger>
          <SelectContent>
            {partners.map((p) => (
              <SelectItem key={p.ngo_id} value={p.ngo_id}>
                {p.name}
                {p.pincode ? ` · ${p.pincode}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {chosen?.address ? (
        <p className="text-xs text-muted-foreground">
          {chosen.address}
          {chosen.visit_instructions ? ` — ${chosen.visit_instructions}` : ''}
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
