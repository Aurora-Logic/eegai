import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { LanguageSwitcher } from '@/components/shared/language-switcher'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/dates'
import { t } from '@/lib/i18n'

interface LegalDoc {
  slug: string
  title: string
  body: string
  version: number
  updated_at: string
}

/**
 * Renders the tiny convention the body is stored in.
 *
 * '## ' starts a section, '- ' is a list item, blank lines separate paragraphs.
 * Three rules, forty lines, no Markdown parser — PLAN.md §10 forbids adding a
 * dependency casually, and a legal page does not need tables or footnotes.
 *
 * Anything in [square brackets] is a fact belonging to the operator that has not
 * been decided yet, and is marked rather than rendered as though it were settled.
 */
function Body({ text }: { text: string }) {
  const blocks: React.ReactNode[] = []
  let list: string[] = []

  function flushList(key: string) {
    if (list.length === 0) return
    blocks.push(
      <ul key={key} className="list-disc space-y-1 pl-5">
        {list.map((item, i) => (
          <li key={i}>
            <Marked text={item} />
          </li>
        ))}
      </ul>,
    )
    list = []
  }

  text.split('\n\n').forEach((block, index) => {
    const trimmed = block.trim()
    if (!trimmed) return

    if (trimmed.startsWith('## ')) {
      flushList(`l${index}`)
      blocks.push(
        <h2 key={index} className="pt-2 font-display text-display-sm">
          {trimmed.slice(3)}
        </h2>,
      )
      return
    }

    if (trimmed.startsWith('- ')) {
      list = trimmed.split('\n').map((line) => line.replace(/^-\s*/, ''))
      flushList(`l${index}`)
      return
    }

    flushList(`l${index}`)
    blocks.push(
      <p key={index}>
        <Marked text={trimmed} />
      </p>,
    )
  })

  flushList('last')
  return <>{blocks}</>
}

/** Highlights the [outstanding] placeholders so nobody mistakes one for a fact. */
function Marked({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\[[^\]]+\])/g).map((part, i) =>
        part.startsWith('[') && part.endsWith(']') ? (
          <mark
            key={i}
            className="rounded-sm bg-primary/25 px-1 font-mono text-[0.9em] text-foreground"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

/**
 * Privacy and terms, read from the database.
 *
 * These were JSX until an admin needed to change a retention period without a
 * deploy. The warning below is shown to readers, not just developers: someone
 * relying on this document is entitled to know it has not been through a lawyer,
 * and that stays true until the placeholders are gone.
 */
export default function LegalDocument() {
  // Derived from the path rather than a prop, so /privacy and /terms can share
  // one lazy chunk without App.tsx knowing anything about document slugs.
  const slug = useLocation().pathname.replace(/^\//, '') || 'privacy'

  const { data, isLoading, isError } = useQuery({
    queryKey: ['legal', slug],
    queryFn: () => api.get<{ document: LegalDoc }>(`/legal/${slug}`),
  })

  const doc = data?.document
  const unresolved = doc ? /\[[^\]]+\]/.test(doc.body) : false

  return (
    <div className="plaster-ground min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-6 pt-6">
        <Link to="/" className="flex items-baseline gap-2">
          <span lang="ta" className="font-display text-display-md leading-none">
            {t('app.nameScript')}
          </span>
          <span className="sr-only">{t('app.name')}</span>
        </Link>
        <LanguageSwitcher />
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-16 pt-8">
        {isLoading ? (
          <Skeleton className="h-96 w-full" />
        ) : isError || !doc ? (
          <p role="alert" className="text-destructive">
            That document could not be loaded.
          </p>
        ) : (
          <>
            <h1 className="font-display text-display-lg">{doc.title}</h1>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              Version {doc.version} · updated {formatDate(doc.updated_at)}
            </p>

            {unresolved ? (
              <p className="hairline mt-6 rounded-sm border-primary/40 bg-card p-4 text-sm">
                <strong className="font-medium">This is a working draft.</strong> It has not been
                reviewed by a lawyer, and the operating entity for this service is not yet decided.
                Anything highlighted is still to be confirmed. Do not rely on this document until
                that has happened.
              </p>
            ) : null}

            <div className="mt-8 space-y-4 text-pretty leading-relaxed">
              <Body text={doc.body} />
            </div>
          </>
        )}

        <div className="mt-12 flex flex-wrap gap-3 border-t border-border pt-6">
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/">
              <ArrowLeft aria-hidden /> {t('error.goHome')}
            </Link>
          </Button>
          <Button asChild variant="ghost" className="min-h-11">
            <Link to="/privacy">{t('legal.privacy')}</Link>
          </Button>
          <Button asChild variant="ghost" className="min-h-11">
            <Link to="/terms">{t('legal.terms')}</Link>
          </Button>
        </div>
      </main>
    </div>
  )
}
