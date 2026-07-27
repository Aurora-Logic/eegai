import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Expand, ImageOff, X } from 'lucide-react'
import { photoUrl } from '@/lib/api'
import { cn } from '@/lib/utils'

/**
 * Every photo on an item, not just the cover.
 *
 * A donor is asked for up to five photos and an NGO was only ever shown the
 * first one — so the decision to claim was being made on a fifth of the evidence
 * the donor took the trouble to provide.
 *
 * Built on CSS scroll-snap rather than a carousel library (PLAN.md §10 forbids
 * casual dependencies). That choice does the work of three: native momentum
 * swiping on a phone, two-finger scroll on a trackpad, and the arrow buttons for
 * a mouse in Chrome on a desktop. A JS carousel would have had to reimplement
 * all three and would have got the touch physics wrong.
 *
 * The arrows are not decoration for pointer users — they are the keyboard path.
 * Scroll-snap alone is unreachable without a pointer.
 */
export function PhotoGallery({
  photos,
  alt,
  className,
}: {
  photos: { path: string }[]
  alt: string
  className?: string | undefined
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState<Set<string>>(new Set())
  const [zoomed, setZoomed] = useState(false)

  const count = photos.length

  const scrollTo = useCallback((next: number) => {
    const track = trackRef.current
    if (!track) return
    track.scrollTo({ left: track.clientWidth * next, behavior: 'smooth' })
  }, [])

  // Derive the index from where the track actually is, rather than trusting the
  // last button pressed — a swipe changes position without going through us.
  const onScroll = () => {
    const track = trackRef.current
    if (!track || track.clientWidth === 0) return
    setIndex(Math.round(track.scrollLeft / track.clientWidth))
  }

  useEffect(() => {
    if (!zoomed) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomed(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomed])

  if (count === 0) {
    return (
      <div
        className={cn(
          'grid aspect-[4/3] place-items-center rounded-sm bg-muted text-muted-foreground',
          className,
        )}
      >
        <ImageOff className="size-6" aria-hidden />
        <span className="sr-only">No photos</span>
      </div>
    )
  }

  return (
    <>
      <div className={cn('relative overflow-hidden rounded-sm bg-muted', className)}>
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          // A listbox-ish role would overpromise; this is a scrollable region.
          role="group"
          aria-label={`${alt} — ${count} photo${count === 1 ? '' : 's'}`}
        >
          {photos.map((photo, i) => (
            <div key={photo.path} className="w-full shrink-0 snap-center">
              {failed.has(photo.path) ? (
                <div className="grid aspect-[4/3] place-items-center text-muted-foreground">
                  <ImageOff className="size-6" aria-hidden />
                </div>
              ) : (
                <img
                  src={photoUrl(photo.path)}
                  alt={`${alt} — photo ${i + 1} of ${count}`}
                  className="block w-full"
                  // The first photo is above the fold on every screen that uses
                  // this; lazy-loading it would delay the thing people came for.
                  loading={i === 0 ? 'eager' : 'lazy'}
                  onError={() => setFailed((f) => new Set(f).add(photo.path))}
                />
              )}
            </div>
          ))}
        </div>

        {count > 1 ? (
          <>
            <Arrow
              side="left"
              disabled={index === 0}
              onClick={() => scrollTo(index - 1)}
              label="Previous photo"
            />
            <Arrow
              side="right"
              disabled={index === count - 1}
              onClick={() => scrollTo(index + 1)}
              label="Next photo"
            />
            <span className="absolute bottom-2 right-2 rounded-sm bg-background/90 px-2 py-0.5 font-mono text-xs">
              {index + 1}/{count}
            </span>
          </>
        ) : null}

        <button
          type="button"
          onClick={() => setZoomed(true)}
          aria-label="View this photo full screen"
          className="absolute right-2 top-2 rounded-sm bg-background/90 p-2 hover:bg-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Expand className="size-4" aria-hidden />
        </button>

        {/* Position is announced rather than left to the visual counter. */}
        <p role="status" aria-live="polite" className="sr-only">
          Photo {index + 1} of {count}
        </p>
      </div>

      {count > 1 ? (
        <ul className="mt-2 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {photos.map((photo, i) => (
            <li key={photo.path}>
              <button
                type="button"
                onClick={() => scrollTo(i)}
                aria-label={`Show photo ${i + 1}`}
                aria-current={i === index}
                className={cn(
                  'block size-14 overflow-hidden rounded-sm border-2 transition-colors',
                  i === index ? 'border-primary' : 'border-transparent opacity-60',
                )}
              >
                <img
                  src={photoUrl(photo.path)}
                  alt=""
                  className="size-full object-cover"
                  loading="lazy"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Full-screen view. A plain fixed overlay rather than the Dialog
          primitive — this is one image and a close button, and pulling the
          Radix dialog into every screen that shows an item costs more than it
          returns here. */}
      {zoomed ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-background/95 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${alt} — photo ${index + 1} of ${count}`}
          onClick={() => setZoomed(false)}
        >
          <img
            src={photoUrl(photos[index]!.path)}
            alt={`${alt} — photo ${index + 1} of ${count}`}
            className="max-h-full max-w-full object-contain"
          />
          <button
            type="button"
            onClick={() => setZoomed(false)}
            aria-label="Close"
            className="hairline absolute right-4 top-4 rounded-sm bg-card p-3"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
      ) : null}
    </>
  )
}

function Arrow({
  side,
  disabled,
  onClick,
  label,
}: {
  side: 'left' | 'right'
  disabled: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-background/90 hover:bg-background disabled:opacity-0',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        side === 'left' ? 'left-2' : 'right-2',
      )}
    >
      {side === 'left' ? (
        <ChevronLeft className="size-5" aria-hidden />
      ) : (
        <ChevronRight className="size-5" aria-hidden />
      )}
    </button>
  )
}
