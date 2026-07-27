import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { photoUrl } from '@/lib/api'
import { cn } from '@/lib/utils'

/**
 * Reorderable photo strip. The first photo is the one that shows on the wall,
 * so the order is a real decision, not a detail.
 *
 * Drag-and-drop uses the native HTML5 API rather than dnd-kit — PLAN.md §10
 * says not to add dependencies casually, and reordering a list of at most five
 * tiles does not need a library.
 *
 * The arrow buttons are not a fallback, they are the accessible path: pointer
 * drag is unusable by keyboard and painful on a 360px phone, which is the
 * target device.
 */
export function PhotoGrid({
  paths,
  onReorder,
  onRemove,
}: {
  paths: string[]
  onReorder: (next: string[]) => void
  onRemove: (path: string) => void
}) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const liveRegion = useRef<HTMLParagraphElement>(null)

  function move(from: number, to: number) {
    if (to < 0 || to >= paths.length || from === to) return
    const next = [...paths]
    const [moved] = next.splice(from, 1)
    if (moved === undefined) return
    next.splice(to, 0, moved)
    onReorder(next)

    if (liveRegion.current) {
      liveRegion.current.textContent = `Photo moved to position ${to + 1} of ${paths.length}.`
    }
  }

  if (paths.length === 0) return null

  return (
    <>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {paths.map((path, index) => (
          <li
            key={path}
            draggable
            onDragStart={(e) => {
              setDraggingIndex(index)
              e.dataTransfer.effectAllowed = 'move'
              // Firefox will not start a drag without data set.
              e.dataTransfer.setData('text/plain', String(index))
            }}
            onDragEnd={() => {
              setDraggingIndex(null)
              setOverIndex(null)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              if (overIndex !== index) setOverIndex(index)
            }}
            onDrop={(e) => {
              e.preventDefault()
              const from = draggingIndex ?? Number(e.dataTransfer.getData('text/plain'))
              if (!Number.isNaN(from)) move(from, index)
              setDraggingIndex(null)
              setOverIndex(null)
            }}
            className={cn(
              'hairline relative overflow-hidden rounded-sm bg-card transition-opacity',
              draggingIndex === index && 'opacity-40',
              overIndex === index && draggingIndex !== index && 'outline outline-2 outline-primary',
            )}
          >
            <img
              src={photoUrl(path)}
              alt={`Photo ${index + 1} of ${paths.length}`}
              className="block aspect-square w-full object-cover"
              draggable={false}
            />

            {index === 0 ? (
              <span className="absolute left-1 top-1 rounded-sm bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">
                Cover
              </span>
            ) : null}

            <button
              type="button"
              onClick={() => onRemove(path)}
              className="absolute right-1 top-1 rounded-sm bg-background/90 p-1 hover:bg-background"
              aria-label={`Remove photo ${index + 1}`}
            >
              <X className="size-4" aria-hidden />
            </button>

            <div className="flex items-center justify-between bg-background/90 px-1 py-0.5">
              <button
                type="button"
                onClick={() => move(index, index - 1)}
                disabled={index === 0}
                className="rounded-sm p-1 disabled:opacity-30"
                aria-label={`Move photo ${index + 1} earlier`}
              >
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <span className="font-mono text-xs text-muted-foreground">{index + 1}</span>
              <button
                type="button"
                onClick={() => move(index, index + 1)}
                disabled={index === paths.length - 1}
                className="rounded-sm p-1 disabled:opacity-30"
                aria-label={`Move photo ${index + 1} later`}
              >
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <p ref={liveRegion} role="status" aria-live="polite" className="sr-only" />
    </>
  )
}
