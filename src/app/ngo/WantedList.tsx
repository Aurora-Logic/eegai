import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Megaphone } from 'lucide-react'
import { EmptyState } from '@/components/shared/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ApiError, api, issueText } from '@/lib/api'
import { formatRelative } from '@/lib/dates'
import { t, type StringKey } from '@/lib/i18n'
import { CATEGORIES, type Category } from '@/lib/validation/donation'

export interface Wanted {
  id: string
  organisation_name: string
  category: Category
  title: string
  quantity: number
  note: string | null
  pincode: string | null
  status: string
  created_at: string
  expires_at: string
}

/**
 * What this organisation has asked for.
 *
 * A request reserves nothing. The wall's first-claim rule already decides who
 * gets an item, and a second mechanism promising a donor's post to one
 * organisation would only disagree with it — so this says what is needed and
 * stops there.
 */
export function WantedList() {
  const queryClient = useQueryClient()
  const [posting, setPosting] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['wanted', 'mine'],
    queryFn: () => api.get<{ requests: Wanted[] }>('/wanted/mine'),
  })

  const close = useMutation({
    mutationFn: (id: string) => api.post(`/wanted/${id}/close`, { status: 'fulfilled' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wanted'] }),
  })

  const requests = data?.requests ?? []
  const open = requests.filter((r) => r.status === 'open')

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Donors see these while deciding what to give. Nothing is reserved for you — the first
          organisation to claim an item still gets it.
        </p>
        <Button onClick={() => setPosting(true)}>
          <Megaphone aria-hidden /> Ask for something
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : requests.length === 0 ? (
        <EmptyState
          title="You have not asked for anything"
          hint="Say what you actually need — 40 school bags before June — and donors see it on their own screen."
          action={<Button onClick={() => setPosting(true)}>Ask for something</Button>}
        />
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => (
            <li key={r.id} className="hairline rounded-sm bg-card p-4">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.title}</span>
                <Badge variant="tag">{t(`category.${r.category}` as StringKey)}</Badge>
                <Badge variant="outline">{r.quantity} needed</Badge>
                {r.status !== 'open' ? <Badge variant="muted">{r.status}</Badge> : null}
              </p>
              {r.note ? <p className="mt-1 text-sm text-muted-foreground">{r.note}</p> : null}
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                asked {formatRelative(r.created_at)}
                {r.status === 'open' ? ` · until ${formatRelative(r.expires_at)}` : ''}
              </p>
              {r.status === 'open' ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  disabled={close.isPending}
                  onClick={() => close.mutate(r.id)}
                >
                  We have enough
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {open.length === 0 && requests.length > 0 ? null : null}
      {posting ? <AskDialog onClose={() => setPosting(false)} /> : null}
    </section>
  )
}

function AskDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [category, setCategory] = useState<Category>('stationery')
  const [title, setTitle] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const post = useMutation({
    mutationFn: () =>
      api.post('/wanted', { category, title, quantity, note: note.trim() || undefined }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['wanted'] })
      onClose()
    },
    onError: (e) =>
      setError(issueText(e) ?? (e instanceof ApiError ? e.message : 'That did not go through.')),
  })

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>What do you need?</DialogTitle>
          <DialogDescription>
            Donors see this with your name and area. Say the thing and the number, not a general
            appeal — "40 school bags" is answerable, "any help" is not.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="w-title">What you need</Label>
            <Input
              id="w-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="School bags for 40 children"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="w-category">Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                <SelectTrigger id="w-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`category.${c}` as StringKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w-qty">How many</Label>
              <Input
                id="w-qty"
                type="number"
                min={1}
                max={10000}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="w-note">Anything a donor should know (optional)</Label>
            <Textarea
              id="w-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Before the school year starts in June."
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button
            className="min-h-11 w-full"
            disabled={post.isPending || title.trim().length < 3}
            onClick={() => post.mutate()}
          >
            {post.isPending ? 'Posting…' : 'Post what we need'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
