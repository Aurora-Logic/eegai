import { Toaster as Sonner } from 'sonner'
import { useTheme } from '@/hooks/use-theme'

type ToasterProps = React.ComponentProps<typeof Sonner>

/**
 * Vendored from shadcn, with one change: the stock version imports `useTheme`
 * from next-themes, which this project does not use. It reads our own theme
 * hook instead, so toasts follow the plaster/indigo inversion.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-card group-[.toaster]:text-card-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
