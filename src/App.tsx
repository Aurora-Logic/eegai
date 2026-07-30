import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Landing from './app/Landing'
import SignIn from './app/auth/SignIn'
import { DevRoleSwitcher } from './components/shared/dev-role-switcher'
import { OfflineBanner } from './components/shared/offline-banner'
import { ProtectedRoute } from './components/shared/protected-route'
import { PwaPrompt } from './components/shared/pwa-prompt'
import { RouteFallback } from './components/shared/route-fallback'
import { useLocale } from './hooks/use-locale'
import { HOME_FOR_ROLE, useSession } from './hooks/use-session'

/**
 * Everything past the front door is split out of the initial bundle.
 *
 * The budget in PLAN.md §8 is 250KB gzipped and the single chunk was already at
 * 195KB before M5 and M6 added a screen each. Splitting by route is the cheapest
 * fix and it maps onto how the product is actually used: a donor never loads the
 * admin panels, and nobody loads `browser-image-compression` until they open the
 * post wizard.
 *
 * Landing and SignIn stay eager. They are the first paint for a signed-out
 * visitor, and a spinner on the front door to save 4KB is a bad trade.
 */
const SignUp = lazy(() => import('./app/auth/SignUp'))
const ForgotPassword = lazy(() => import('./app/auth/ForgotPassword'))
const DonorHome = lazy(() => import('./app/donor/DonorHome'))
const PostItem = lazy(() => import('./app/donor/PostItem'))
const DonationTimeline = lazy(() => import('./app/donor/DonationTimeline'))
const NgoWall = lazy(() => import('./app/ngo/NgoWall'))
const NgoItem = lazy(() => import('./app/ngo/NgoItem'))
const VolunteerHome = lazy(() => import('./app/volunteer/VolunteerHome'))
const AdminHome = lazy(() => import('./app/admin/AdminHome'))
const DonationTrail = lazy(() => import('./app/admin/DonationTrail'))
const Profile = lazy(() => import('./app/Profile'))
const Guide = lazy(() => import('./app/Guide'))
// Lazy for weight, not for behaviour: it renders only for a signed-in user, and
// eager it dragged the whole manual into the first paint of the landing page.
const FirstRunGuide = lazy(() =>
  import('./components/shared/first-run-guide').then((m) => ({ default: m.FirstRunGuide })),
)
const LegalDocument = lazy(() => import('./app/legal/LegalDocument'))
const NotFound = lazy(() => import('./app/NotFound'))

/** Sends a signed-in visitor to their own shell; everyone else to the landing page. */
function Root() {
  const { user, isLoading } = useSession()
  if (isLoading) return null
  return user ? <Navigate to={HOME_FOR_ROLE[user.role]} replace /> : <Landing />
}

export default function App() {
  // Subscribing here is what makes the language switch take effect everywhere:
  // t() reads the active locale at call time, so one re-render from the root
  // refreshes every string below without unmounting anything.
  useLocale()

  return (
    <>
      <OfflineBanner />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Root />} />
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/sign-up" element={<SignUp />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          <Route
            path="/donor"
            element={
              <ProtectedRoute allow={['donor']}>
                <DonorHome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/donor/post"
            element={
              <ProtectedRoute allow={['donor']}>
                <PostItem />
              </ProtectedRoute>
            }
          />
          {/* The M6 loop-closer: where an item got to, and what it did there. */}
          <Route
            path="/donor/items/:id"
            element={
              <ProtectedRoute allow={['donor']}>
                <DonationTimeline />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ngo"
            element={
              <ProtectedRoute allow={['ngo']}>
                <NgoWall />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ngo/items/:id"
            element={
              <ProtectedRoute allow={['ngo']}>
                <NgoItem />
              </ProtectedRoute>
            }
          />
          <Route
            path="/volunteer"
            element={
              <ProtectedRoute allow={['volunteer']}>
                <VolunteerHome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allow={['admin']}>
                <AdminHome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/items/:id"
            element={
              <ProtectedRoute allow={['admin']}>
                <DonationTrail />
              </ProtectedRoute>
            }
          />

          {/* Public, and reachable signed out — someone deciding whether to
              register must be able to read these first. */}
          {/* The manual. Signed in or not — someone can be told to read it
              before they have an account. */}
          <Route path="/guide" element={<Guide />} />

          {/* Every role edits their own record here; the page adapts. */}
          <Route
            path="/profile"
            element={
              <ProtectedRoute allow={['donor', 'ngo', 'volunteer', 'admin']}>
                <Profile />
              </ProtectedRoute>
            }
          />

          <Route path="/privacy" element={<LegalDocument />} />
          <Route path="/terms" element={<LegalDocument />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <PwaPrompt />
      <Suspense fallback={null}>
        <FirstRunGuide />
      </Suspense>
      <DevRoleSwitcher />
    </>
  )
}
