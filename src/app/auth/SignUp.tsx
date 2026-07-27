import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { HOME_FOR_ROLE, useSession } from '@/hooks/use-session'
import { ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { registerSchema, type RegisterInput } from '@/lib/validation/auth'

const ROLE_CHOICES = [
  { value: 'donor', label: 'I want to give things', hint: 'Post items you no longer need.' },
  { value: 'ngo', label: "We're an organisation", hint: 'Claim items for the people you serve.' },
  { value: 'volunteer', label: 'I can collect and deliver', hint: 'Move items across Nashik.' },
] as const

export default function SignUp() {
  const { user, signUp } = useSession()
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { role: 'donor' },
  })

  const role = watch('role')

  if (user) return <Navigate to={HOME_FOR_ROLE[user.role]} replace />

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await signUp(values)
      navigate(HOME_FOR_ROLE[values.role], { replace: true })
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'That did not go through. Try again.',
      )
    }
  })

  return (
    <main className="plaster-ground grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-display-lg">{t('auth.signUpTitle')}</h1>
        <p className="mt-2 text-muted-foreground">{t('auth.signUpSubtitle')}</p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{t('auth.roleQuestion')}</legend>
            {ROLE_CHOICES.map((choice) => (
              <label
                key={choice.value}
                className={cn(
                  'hairline flex cursor-pointer flex-col gap-0.5 rounded-sm p-3 transition-colors',
                  role === choice.value ? 'bg-primary/15' : 'bg-card hover:bg-foreground/5',
                )}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    value={choice.value}
                    checked={role === choice.value}
                    onChange={() => setValue('role', choice.value)}
                    className="accent-primary"
                  />
                  <span className="text-sm font-medium">{choice.label}</span>
                </span>
                <span className="pl-6 text-sm text-muted-foreground">{choice.hint}</span>
              </label>
            ))}
            {errors.role ? <p className="text-sm text-destructive">{errors.role.message}</p> : null}
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="fullName">
              {role === 'ngo' ? t('auth.orgName') : t('auth.fullName')}
            </Label>
            <Input id="fullName" autoComplete="name" {...register('fullName')} />
            {errors.fullName ? (
              <p className="text-sm text-destructive">{errors.fullName.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">{t('auth.phone')}</Label>
            <Input
              id="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="98XXXXXXXX"
              {...register('phone')}
            />
            {errors.phone ? (
              <p className="text-sm text-destructive">{errors.phone.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">{t('auth.password')}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              {...register('password')}
            />
            <p className="text-sm text-muted-foreground">{t('auth.passwordHint')}</p>
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
            {isSubmitting ? t('auth.creating') : t('auth.createAccount')}
          </Button>
        </form>

        <p className="mt-6 text-sm text-muted-foreground">
          {t('auth.haveAccount')}{' '}
          <Link to="/sign-in" className="underline underline-offset-4">
            {t('auth.signIn')}
          </Link>
        </p>
      </div>
    </main>
  )
}
