import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * A password box you can look inside.
 *
 * Typing a password blind on a phone keyboard is where most sign-in failures
 * start, and the usual fix — asking for it twice — only doubles the typing.
 *
 * Hidden by default, revealed only while the person asks for it. The button is
 * a real button so it is reachable by keyboard, it is excluded from the tab
 * order on purpose (tab should go from the password to Sign in, not to a
 * decoration), and it never submits the form around it.
 */
const PasswordInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => {
  const [shown, setShown] = React.useState(false)

  return (
    <div className="relative">
      <Input
        {...props}
        ref={ref}
        type={shown ? 'text' : 'password'}
        className={cn('pr-12', className)}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShown((v) => !v)}
        // aria-pressed rather than a changing label: a screen reader then
        // announces the state of one control instead of two different ones.
        aria-pressed={shown}
        aria-label={shown ? 'Hide password' : 'Show password'}
        title={shown ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        {shown ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  )
})
PasswordInput.displayName = 'PasswordInput'

export { PasswordInput }
