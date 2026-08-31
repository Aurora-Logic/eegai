import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Role } from '@/lib/state-machine'
import type { LoginInput, RegisterInput } from '@/lib/validation/auth'

export interface Profile {
  id: string
  full_name: string
  phone: string | null
  role: Role
  pincode: string | null
  lat: number | null
  lng: number | null
  is_active: boolean
  /** Which health donations this organisation may request. Empty for everyone else. */
  health_categories: string[]
}

export interface SessionUser {
  userId: string
  role: Role
  fullName: string
  profile: Profile
}

interface SessionContextValue {
  user: SessionUser | null
  isLoading: boolean
  signIn: (input: LoginInput) => Promise<void>
  signUp: (input: RegisterInput) => Promise<void>
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

/**
 * The only React Context in the app (PLAN.md §3). Everything else that is
 * server state lives in TanStack Query — including, underneath, this: the
 * session is a query so that a 401 anywhere can invalidate it.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['session'],
    queryFn: () => api.get<{ user: SessionUser | null }>('/auth/me'),
    // The cookie is httpOnly, so the only way to know if a session is still
    // good is to ask. Do that once per mount rather than per component.
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const signIn = useMutation({
    mutationFn: (input: LoginInput) => api.post<{ user: SessionUser }>('/auth/login', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['session'] }),
  })

  const signUp = useMutation({
    mutationFn: (input: RegisterInput) => api.post<{ user: SessionUser }>('/auth/register', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['session'] }),
  })

  const signOut = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => {
      // Drop everything, not just the session: the cache holds another user's
      // donations and they must not survive a sign-out on a shared phone.
      queryClient.clear()
    },
  })

  const value = useMemo<SessionContextValue>(
    () => ({
      user: data?.user ?? null,
      isLoading,
      signIn: async (input) => {
        await signIn.mutateAsync(input)
      },
      signUp: async (input) => {
        await signUp.mutateAsync(input)
      },
      signOut: async () => {
        await signOut.mutateAsync()
      },
    }),
    [data, isLoading, signIn, signUp, signOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext)
  if (!context) throw new Error('useSession must be used inside a SessionProvider')
  return context
}

/**
 * Where each role lands after signing in.
 *
 * The health lane leads: a donor arrives at nearby requests, and an
 * organisation approved to ask for blood or milk arrives at its requests. The
 * goods wall is still one tap away from both, it is simply no longer the front
 * door.
 *
 * This map is the fallback for the places that know a role but not yet a user —
 * the sign-up form, and the dev role switcher. `homeFor` is the real answer
 * wherever a user exists, because an organisation's landing screen depends on
 * whether an admin has approved it for a health category.
 */
export const HOME_FOR_ROLE: Record<Role, string> = {
  donor: '/health',
  ngo: '/ngo',
  volunteer: '/volunteer',
  admin: '/admin',
}

export function homeFor(user: Pick<SessionUser, 'role' | 'profile'>): string {
  if (user.role === 'ngo' && (user.profile.health_categories?.length ?? 0) > 0) {
    return '/ngo/needs'
  }
  return HOME_FOR_ROLE[user.role]
}
