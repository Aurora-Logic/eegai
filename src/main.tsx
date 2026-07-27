import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { ErrorBoundary } from './components/shared/error-boundary'
import { SessionProvider } from './hooks/use-session'
import './globals.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Donors and NGOs are on patchy 4G. Refetching on every window focus
      // burns their data for no benefit; the wall gets freshness from an
      // explicit invalidation after a claim instead.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: 2,
    },
  },
})

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element #root is missing from index.html')

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <SessionProvider>
            <App />
          </SessionProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
