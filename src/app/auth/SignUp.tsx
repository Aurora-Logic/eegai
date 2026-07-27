import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, Boxes, HandHeart, Truck } from 'lucide-react'
import { AuthLayout } from '@/components/shared/auth-layout'
import { RoleScene } from '@/components/illustrations/roles'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { HOME_FOR_ROLE, useSession } from '@/hooks/use-session'
import { ApiError } from '@/lib/api'
import { t } from '@/lib/i18n'
import { registerSchema, type RegisterInput } from '@/lib/validation/auth'

const ROLE_CHOICES = [
  {
    value: 'donor',
    icon: HandHeart,
    label: 'I want to give things',
    hint: 'Post items you no longer need.',
  },
  {
    value: 'ngo',
    icon: Boxes,
    label: "We're an organisation",
    hint: 'Claim items for the people you serve.',
  },
  {
    value: 'volunteer',
    icon: Truck,
    label: 'I can collect and deliver',
    hint: 'Move items across Coimbatore.',
  },
] as const

export default function SignUp() {
  const { user, signUp } = useSession()
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    watch,
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
      setFormError(error instanceof ApiError ? error.message : t('error.generic'))
    }
  })

  return (
    <AuthLayout
      title={t('auth.signUpTitle')}
      subtitle={t('auth.signUpSubtitle')}
      // Follows the role radio. That radio is the only decision on this page
      // that changes what the whole account becomes, and it is a small
      // low-contrast control whose consequence is invisible until much later.
      illustration={<RoleScene role={role} className="w-full max-w-sm" />}
      footer={
        <>
          {t('auth.haveAccount')}{' '}
          <Link to="/sign-in" className="underline underline-offset-4">
            {t('auth.signIn')}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t('auth.roleQuestion')}</legend>
          <Controller
            control={control}
            name="role"
            render={({ field }) => (
              <RadioGroup
                value={field.value}
                onValueChange={field.onChange}
                className="gap-2"
                aria-label={t('auth.roleQuestion')}
              >
                {ROLE_CHOICES.map((choice) => {
                  const Icon = choice.icon
                  const selected = role === choice.value
                  return (
                    <Label
                      key={choice.value}
                      htmlFor={`role-${choice.value}`}
                      className={cn(
                        'hairline flex cursor-pointer items-start gap-3 rounded-sm p-3 transition-colors',
                        selected ? 'bg-primary/15' : 'bg-card hover:bg-foreground/5',
                      )}
                    >
                      <RadioGroupItem
                        value={choice.value}
                        id={`role-${choice.value}`}
                        className="mt-0.5"
                      />
                      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{choice.label}</span>
                        <span className="block text-sm font-normal text-muted-foreground">
                          {choice.hint}
                        </span>
                      </span>
                    </Label>
                  )
                })}
              </RadioGroup>
            )}
          />
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
          {errors.phone ? <p className="text-sm text-destructive">{errors.phone.message}</p> : null}
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
          <Alert variant="destructive" role="alert">
            <AlertCircle className="size-4" aria-hidden />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? t('auth.creating') : t('auth.createAccount')}
        </Button>
      </form>
    </AuthLayout>
  )
}
