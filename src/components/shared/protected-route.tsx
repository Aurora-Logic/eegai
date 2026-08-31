import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { homeFor, useSession } from '@/hooks/use-session'
import type { Role } from '@/lib/state-machine'

/**
 * Route-level gate. RLS is the real boundary — this exists so a signed-in donor
 * who types /admin gets sent home instead of staring at an empty screen.
 */
export function ProtectedRoute({ allow, children }: { allow: Role[]; children: ReactNode }) {
  const { user, isLoading } = useSession()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="plaster-ground grid min-h-dvh place-items-center">
        <p className="text-muted-foreground">One moment.</p>
      </div>
    )
  }

  if (!user) {
    // Remember where they were headed so sign-in can send them back.
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />
  }

  if (!allow.includes(user.role)) {
    return <Navigate to={homeFor(user)} replace />
  }

  return <>{children}</>
}
