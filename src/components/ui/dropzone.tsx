import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { ImagePlus, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A file dropzone in the shadcn idiom.
 *
 * shadcn/ui has no file-upload primitive in its registry, so this is written to
 * match the rest of components/ui rather than pulled in: cva variants, `cn`,
 * forwardRef, and nothing but our own tokens.
 *
 * Accessibility is the reason for the input/label pairing. The <input> is the
 * real control and stays in the tab order (visually hidden, not `display:none`,
 * which would remove it); the <label> is the visible target and picks up the
 * focus ring through `peer-focus-visible`. Keyboard users tab to it and press
 * Enter; pointer users click or drag onto it. A div with onClick would have
 * given neither.
 */
const dropzoneVariants = cva(
  'flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed px-6 py-10 text-center transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring',
  {
    variants: {
      state: {
        idle: 'border-foreground/25 bg-card hover:bg-foreground/5',
        // Marigold only while a file is actually over the target — it is the
        // giving colour and stays rare.
        active: 'border-primary bg-primary/10',
        disabled: 'pointer-events-none border-foreground/15 bg-muted opacity-60',
      },
    },
    defaultVariants: { state: 'idle' },
  },
)

export interface DropzoneProps
  extends
    Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type'>,
    Omit<VariantProps<typeof dropzoneVariants>, 'state'> {
  /** Called with whatever the user dropped or picked, already filtered by `accept`. */
  onFiles: (files: File[]) => void
  label: string
  hint?: string | undefined
  busy?: boolean | undefined
  /** Silently ignores anything beyond this count, so the caller's cap is respected. */
  maxFiles?: number | undefined
}

const Dropzone = React.forwardRef<HTMLInputElement, DropzoneProps>(
  (
    { className, onFiles, label, hint, busy = false, maxFiles, disabled, accept, id, ...props },
    ref,
  ) => {
    const generatedId = React.useId()
    const inputId = id ?? generatedId
    const [dragging, setDragging] = React.useState(false)
    // Drag events fire per child element; a counter avoids the highlight
    // flickering as the pointer crosses the icon and the text.
    const dragDepth = React.useRef(0)

    const isDisabled = disabled || busy

    const accepts = React.useCallback(
      (file: File) => {
        if (!accept) return true
        return accept
          .split(',')
          .map((rule) => rule.trim())
          .some((rule) =>
            rule.endsWith('/*') ? file.type.startsWith(rule.slice(0, -1)) : file.type === rule,
          )
      },
      [accept],
    )

    const emit = React.useCallback(
      (list: FileList | null) => {
        if (!list?.length) return
        const files = Array.from(list).filter(accepts)
        if (files.length) onFiles(maxFiles ? files.slice(0, maxFiles) : files)
      },
      [accepts, maxFiles, onFiles],
    )

    return (
      <div
        onDragEnter={(e) => {
          e.preventDefault()
          if (isDisabled) return
          dragDepth.current += 1
          setDragging(true)
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          e.preventDefault()
          dragDepth.current -= 1
          if (dragDepth.current <= 0) setDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          dragDepth.current = 0
          setDragging(false)
          if (!isDisabled) emit(e.dataTransfer.files)
        }}
      >
        <input
          ref={ref}
          id={inputId}
          type="file"
          accept={accept}
          disabled={isDisabled}
          // `sr-only` rather than `hidden`: the input must stay focusable.
          className="peer sr-only"
          onChange={(e) => {
            emit(e.target.files)
            // Reset so picking the same file twice still fires onChange.
            e.target.value = ''
          }}
          {...props}
        />
        <label
          htmlFor={inputId}
          className={cn(
            dropzoneVariants({
              state: isDisabled ? 'disabled' : dragging ? 'active' : 'idle',
            }),
            className,
          )}
        >
          {busy ? (
            <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
          ) : (
            <ImagePlus className="size-6 text-muted-foreground" aria-hidden />
          )}
          <span className="text-sm font-medium">{label}</span>
          {hint ? <span className="text-sm text-muted-foreground">{hint}</span> : null}
        </label>
      </div>
    )
  },
)
Dropzone.displayName = 'Dropzone'

export { Dropzone, dropzoneVariants }
