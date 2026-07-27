import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main className="plaster-ground flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-display-md">There's nothing at this address.</h1>
      <p className="max-w-[36ch] text-muted-foreground">
        The link may be out of date. The wall is where you left it.
      </p>
      <Button asChild variant="outline">
        <Link to="/">Go to the wall</Link>
      </Button>
    </main>
  )
}
