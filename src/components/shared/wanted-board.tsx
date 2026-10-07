import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { HandHeart } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { Wanted } from '@/app/ngo/WantedList'
import { api } from '@/lib/api'
import { t, type StringKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/**
 * What organisations have asked for, on the donor's own screen.
 *
 * The wall has always worked one way: a donor guesses what is useful and an
 * organisation takes it or does not. This is the other direction — somebody
 * about to clear a cupboard can see that a school down the road needs exactly
 * the bags in it.
 *
 * "Post this" carries the category and the words across to the form. It does
 * not reserve anything: the first organisation to claim the item still gets
 * it, and promising otherwise here would be a promise the wall cannot keep.
 */
export function WantedBoard({ className, limit = 4 }: { className?: string; limit?: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['wanted', 'open'],
    queryFn: () => api.get<{ requests: Wanted[] }>('/wanted'),
  })

  if (isLoading) return <Skeleton className={cn('h-28 w-full', className)} />

  const requests = (data?.requests ?? []).slice(0, limit)
  if (requests.length === 0) return null

  return (
    <section className={className}>
      <h2 className="font-display text-display-sm">What organisations need</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Asked for by verified organisations near you. Posting one of these is not a promise to
        anybody — the first organisation to claim your item still gets it.
      </p>

      <ul className="mt-3 space-y-3">
        {requests.map((r) => (
          <li key={r.id} className="hairline rounded-sm bg-card p-4">
            <p className="flex flex-wrap items-center gap-2">
              <HandHeart className="size-4 shrink-0 text-primary" aria-hidden />
              <span className="font-medium">{r.title}</span>
              <Badge variant="tag">{t(`category.${r.category}` as StringKey)}</Badge>
              <Badge variant="outline">{r.quantity} needed</Badge>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {r.organisation_name}
              {r.pincode ? ` · ${r.pincode}` : ''}
            </p>
            {r.note ? <p className="mt-1 text-sm">{r.note}</p> : null}
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link to={`/donor/post?category=${r.category}&title=${encodeURIComponent(r.title)}`}>
                I can give this
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
