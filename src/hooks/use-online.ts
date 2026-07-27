import { useEffect, useState } from 'react'

/**
 * Tracks connectivity. `navigator.onLine` only proves a network interface is
 * up, not that anything is reachable — good enough to explain a failure to a
 * donor on patchy 4G, not good enough to gate a write on.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}
