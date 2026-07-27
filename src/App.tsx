import { Route, Routes } from 'react-router-dom'
import Landing from './app/Landing'
import StyleGuide from './app/StyleGuide'
import NotFound from './app/NotFound'

/**
 * Route table for M0. The four role shells (/donor, /ngo, /volunteer, /admin)
 * and the auth flow land in M1 behind a per-role protected wrapper.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      {/* Throwaway. Delete once the wall is built — PLAN.md §9 M0. */}
      <Route path="/style-guide" element={<StyleGuide />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
