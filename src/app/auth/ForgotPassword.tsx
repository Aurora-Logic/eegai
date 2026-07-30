import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { PhoneCall } from 'lucide-react'
import { AuthLayout } from '@/components/shared/auth-layout'
import { ReturningScene } from '@/components/illustrations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'

/**
 * "I have forgotten my password."
 *
 * There is no SMS gateway, so the usual reset link has nowhere to go. What
 * exists instead is a person: the request lands in the admin queue, someone
 * rings back and reads out a new password. That is slower than a link and it is
 * the honest version of what this product can actually do today.
 *
 * The answer is the same whether or not the number is registered. "No such
 * account" would turn this page into a way to find out which numbers have one.
 */
export default function ForgotPassword() {
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')

  const ask = useMutation({
    mutationFn: () => api.post('/auth/forgot-password', { phone: phone.trim(), note: note.trim() }),
  })

  const valid = /^[6-9]\d{9}$/.test(phone.trim())

  return (
    <AuthLayout
      title={t('auth.forgotTitle')}
      subtitle={t('auth.forgotBody')}
      illustration={<ReturningScene className="w-full max-w-sm" />}
      footer={
        <Link to="/sign-in" className="inline-block py-2 underline underline-offset-4">
          {t('auth.signIn')}
        </Link>
      }
    >
      {ask.isSuccess ? (
        <p role="status" className="hairline mt-8 rounded-sm bg-card p-4">
          {t('auth.forgotSent')}
        </p>
      ) : (
        <form
          className="mt-8 space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) ask.mutate()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="forgot-phone">{t('auth.phone')}</Label>
            <Input
              id="forgot-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="98XXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="forgot-note">Anything we should know? (optional)</Label>
            <Textarea
              id="forgot-note"
              rows={3}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="I have changed phones and cannot sign in."
            />
          </div>

          <Button type="submit" className="min-h-12 w-full" disabled={!valid || ask.isPending}>
            <PhoneCall aria-hidden /> {ask.isPending ? 'Sending…' : t('auth.forgotSend')}
          </Button>

          {/* Said plainly rather than implied. Someone waiting for a text that
              is never coming will assume the product is broken. */}
          <p className="text-sm text-muted-foreground">
            We cannot text you a link yet, so this reaches a person rather than a robot.
          </p>
        </form>
      )}
    </AuthLayout>
  )
}
