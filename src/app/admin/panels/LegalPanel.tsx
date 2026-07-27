import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Save } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ApiError, api } from '@/lib/api'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'

interface LegalDoc {
  slug: string
  title: string
  body: string
  version: number
  updated_at: string
}

const SLUGS = ['privacy', 'terms'] as const

/**
 * Editing the privacy policy and terms without a deploy.
 *
 * Plain text with three rules — '## ' for a section, '- ' for a list item, blank
 * lines between paragraphs. A rich text editor here would be a dependency, a
 * sanitising problem and a way to paste styled HTML into a legal document; three
 * conventions in a textarea are none of those.
 *
 * The count of unresolved [placeholders] is shown because it is the single fact
 * that decides whether these pages can be relied on. Publishing does not clear
 * it, and nothing here pretends the document is finished while any remain.
 */
export function LegalPanel() {
  const queryClient = useQueryClient()
  const [slug, setSlug] = useState<(typeof SLUGS)[number]>('privacy')
  const [draft, setDraft] = useState<{ title: string; body: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['legal', slug],
    queryFn: () => api.get<{ document: LegalDoc }>(`/legal/${slug}`),
  })

  const doc = data?.document

  // Reset the draft whenever a different document loads, so switching tabs does
  // not carry half-typed edits from one document into the other.
  useEffect(() => {
    if (doc) setDraft({ title: doc.title, body: doc.body })
    setError(null)
    setSaved(null)
  }, [doc?.slug, doc?.version, doc])

  const publish = useMutation({
    mutationFn: () => api.put<{ version: number }>(`/admin/legal/${slug}`, draft),
    onSuccess: async (result) => {
      setSaved(result.version)
      setError(null)
      await queryClient.invalidateQueries({ queryKey: ['legal'] })
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'That did not publish.'),
  })

  const placeholders = draft ? (draft.body.match(/\[[^\]]+\]/g) ?? []).length : 0
  const dirty = Boolean(doc && draft && (draft.title !== doc.title || draft.body !== doc.body))

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {SLUGS.map((option) => (
            <Button
              key={option}
              size="sm"
              variant={slug === option ? 'default' : 'outline'}
              className="min-h-11 capitalize"
              onClick={() => setSlug(option)}
            >
              {option}
            </Button>
          ))}
        </div>

        <Button asChild variant="ghost" size="sm" className="min-h-11">
          <Link to={`/${slug}`} target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden /> View the page
          </Link>
        </Button>
      </div>

      {isLoading || !draft || !doc ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="space-y-4">
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="muted">version {doc.version}</Badge>
            <span>updated {formatDate(doc.updated_at)}</span>
            {placeholders > 0 ? (
              <Badge variant="destructive">{placeholders} still to confirm</Badge>
            ) : (
              <Badge variant="success">nothing outstanding</Badge>
            )}
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="legal-title">Title</Label>
            <Input
              id="legal-title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="legal-body">Body</Label>
            <Textarea
              id="legal-body"
              value={draft.body}
              rows={24}
              className="font-mono text-sm leading-relaxed"
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              <code>## </code> starts a section, <code>- </code> a list item, a blank line separates
              paragraphs. Anything in [square brackets] is highlighted on the page as still to be
              confirmed.
            </p>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              className="min-h-11"
              disabled={!dirty || publish.isPending}
              onClick={() => publish.mutate()}
            >
              <Save aria-hidden /> {publish.isPending ? 'Publishing…' : 'Publish'}
            </Button>

            <p className={cn('text-sm', saved ? 'text-muted-foreground' : 'sr-only')} role="status">
              {saved ? `Published as version ${saved}.` : ''}
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            Publishing changes the page immediately. The version only increases when the words
            change, so a corrected title does not invalidate an agreement someone already gave.
          </p>
        </div>
      )}
    </section>
  )
}
