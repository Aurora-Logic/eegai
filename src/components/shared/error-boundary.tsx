import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'
import { lastRequestId } from '@/lib/api'

interface Props {
  children: ReactNode
  /** Shown instead of the default page — used for smaller, in-place failures. */
  fallback?: (reset: () => void) => ReactNode
}

interface State {
  error: Error | null
  requestId: string | null
}

/**
 * Catches render errors so a bug in one screen does not blank the whole app.
 *
 * The request id from the most recent API call is shown deliberately: it is the
 * one string a user can read out over the phone that maps to a server log line
 * and to the audit_log rows for that request.
 *
 * Class component because React has no hook equivalent — getDerivedStateFromError
 * and componentDidCatch have no functional API.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, requestId: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, requestId: lastRequestId() }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Sentry replaces this in M8; until then the console is the only sink and
    // swallowing it silently would be worse than noisy.
    console.error('[boundary]', error, info.componentStack)
  }

  reset = () => this.setState({ error: null, requestId: null })

  render() {
    if (!this.state.error) return this.props.children
    if (this.props.fallback) return this.props.fallback(this.reset)

    return (
      <main className="plaster-ground grid min-h-dvh place-items-center px-6 text-center">
        <div className="max-w-md">
          <h1 className="font-display text-display-md">{t('error.boundaryTitle')}</h1>
          <p className="mt-3 text-muted-foreground">{t('error.boundaryBody')}</p>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button onClick={() => window.location.reload()}>
              <RotateCcw aria-hidden /> {t('action.retry')}
            </Button>
            <Button variant="outline" onClick={() => (window.location.href = '/')}>
              {t('error.goHome')}
            </Button>
          </div>

          {this.state.requestId ? (
            <p className="mt-8 font-mono text-xs text-muted-foreground">
              {t('error.reference')} {this.state.requestId}
            </p>
          ) : null}
        </div>
      </main>
    )
  }
}
