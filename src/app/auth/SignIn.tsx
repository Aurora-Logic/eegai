import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { HOME_FOR_ROLE, useSession } from '@/hooks/use-session'
import { ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { loginSchema, type LoginInput } from '@/lib/validation/auth'

export default function SignIn() {
  const { user, signIn } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) })

  if (user) return <Navigate to={HOME_FOR_ROLE[user.role]} replace />

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await signIn(values)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from ?? '/', { replace: true })
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'That did not go through. Try again.',
      )
    }
  })

  return (
    <main className="plaster-ground grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-display-lg">{t('auth.signInTitle')}</h1>
        <p className="mt-2 text-muted-foreground">{t('auth.signInSubtitle')}</p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="phone">{t('auth.phone')}</Label>
            <Input
              id="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="98XXXXXXXX"
              aria-invalid={!!errors.phone}
              aria-describedby={errors.phone ? 'phone-error' : undefined}
              {...register('phone')}
            />
            {errors.phone ? (
              <p id="phone-error" className="text-sm text-destructive">
                {errors.phone.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">{t('auth.password')}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              {...register('password')}
            />
            {errors.password ? (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            ) : null}
          </div>

          {formError ? (
            <p role="alert" className="hairline rounded-sm bg-card p-3 text-sm text-destructive">
              {formError}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? t('auth.signingIn') : t('auth.signIn')}
          </Button>
        </form>

        <p className="mt-6 text-sm text-muted-foreground">
          {t('auth.noAccount')}{' '}
          <Link to="/sign-up" className="underline underline-offset-4">
            {t('auth.signUp')}
          </Link>
        </p>
      </div>
    </main>
  )
}
