import { Navigate, Route, Routes } from 'react-router-dom'
import Landing from './app/Landing'
import StyleGuide from './app/StyleGuide'
import NotFound from './app/NotFound'
import SignIn from './app/auth/SignIn'
import SignUp from './app/auth/SignUp'
import DonorHome from './app/donor/DonorHome'
import PostItem from './app/donor/PostItem'
import NgoWall from './app/ngo/NgoWall'
import VolunteerHome from './app/volunteer/VolunteerHome'
import AdminHome from './app/admin/AdminHome'
import { OfflineBanner } from './components/shared/offline-banner'
import { ProtectedRoute } from './components/shared/protected-route'
import { PwaPrompt } from './components/shared/pwa-prompt'
import { HOME_FOR_ROLE, useSession } from './hooks/use-session'

/** Sends a signed-in visitor to their own shell; everyone else to the landing page. */
function Root() {
  const { user, isLoading } = useSession()
  if (isLoading) return null
  return user ? <Navigate to={HOME_FOR_ROLE[user.role]} replace /> : <Landing />
}

export default function App() {
  return (
    <>
      <OfflineBanner />
      <Routes>
        <Route path="/" element={<Root />} />
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/sign-up" element={<SignUp />} />

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
        <Route
          path="/ngo"
          element={
            <ProtectedRoute allow={['ngo']}>
              <NgoWall />
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

        {/* Throwaway. Delete once the wall is built — PLAN.md §9 M0. */}
        <Route path="/style-guide" element={<StyleGuide />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <PwaPrompt />
    </>
  )
}
