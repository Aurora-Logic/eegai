import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Flag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ApiError, api } from '@/lib/api'

type Subject = 'health_request' | 'ngo' | 'donation' | 'profile'

/**
 * Telling us something went wrong. Brief §4: an admin handles complaints, and
 * until now there was no way to make one.
 *
 * Deliberately one box and no category picker. A dropdown of complaint types
 * is a thing product teams add and people then pick the wrong one from; what
 * an operator actually needs is the sentence, and they have the phone number.
 */
export function ReportDialog({
  subjectType,
  subjectId,
  about,
  label = 'Report a problem',
}: {
  subjectType: Subject
  subjectId?: string | undefined
  about: string
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const file = useMutation({
    mutationFn: () =>
      api.post('/inbox/reports', { subjectType, subjectId: subjectId ?? null, detail }),
    onSuccess: () => {
      setSent(true)
      setError(null)
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'That did not go through.'),
  })

  function close() {
    setOpen(false)
    setDetail('')
    setSent(false)
    setError(null)
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Flag aria-hidden /> {label}
      </Button>

      {open ? (
        <AlertDialog open onOpenChange={(next) => !next && close()}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{sent ? 'Thank you' : 'What went wrong?'}</AlertDialogTitle>
              <AlertDialogDescription>
                {sent
                  ? 'Somebody will read this and get back to you. You can see what came of it under your complaints.'
                  : `About ${about}. Tell us what happened in your own words — we will call you if we need more.`}
              </AlertDialogDescription>
            </AlertDialogHeader>

            {sent ? (
              <Button className="min-h-11" onClick={close}>
                Done
              </Button>
            ) : (
              <>
                <Textarea
                  rows={4}
                  aria-label="What went wrong"
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  placeholder="I went at the time we agreed and reception said they had no record of it."
                />

                {error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}

                <AlertDialogFooter>
                  <AlertDialogCancel className="min-h-11">Cancel</AlertDialogCancel>
                  <Button
                    className="min-h-11"
                    disabled={detail.trim().length < 10 || file.isPending}
                    onClick={() => file.mutate()}
                  >
                    {file.isPending ? 'Sending…' : 'Send it'}
                  </Button>
                </AlertDialogFooter>
              </>
            )}
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  )
}
