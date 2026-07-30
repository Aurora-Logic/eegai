import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CircleHelp, Download, LogOut, Menu, Moon, Sun, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { IosInstallSheet } from '@/components/shared/install-button'
import { useLocale } from '@/hooks/use-locale'
import { useSession } from '@/hooks/use-session'
import { useTheme } from '@/hooks/use-theme'
import { LOCALES, LOCALE_NAMES, setLocale, t } from '@/lib/i18n'
import { promptInstall, useInstallKind } from '@/lib/install'

/**
 * Everything the header offers, as one menu — the phone form of the icon row.
 *
 * Six unlabelled icon buttons plus a back arrow and the wordmark need about
 * 400px of header. A 360px phone does not have it, so they were being squeezed
 * below a thumb's width and the row still ran to the edge.
 *
 * Collapsing them is also the better design at that size, not merely the one
 * that fits: every action gains a name. "Language" as a globe and "Install" as
 * a download arrow are guesses on a first visit, and this is the screen where
 * someone is most likely to be on their first visit.
 *
 * The languages sit in the same menu rather than behind a submenu. Three
 * options do not earn a second layer, and a submenu on a touch screen is a
 * long-press or a fiddly hover away.
 */
export function HeaderMenu() {
  const { signOut } = useSession()
  const { theme, toggle } = useTheme()
  const locale = useLocale()
  const installKind = useInstallKind()
  const [showIosSheet, setShowIosSheet] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="min-h-11" aria-label={t('menu.open')}>
            <Menu aria-hidden />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem asChild className="min-h-11 gap-2">
            <Link to="/profile">
              <UserRound aria-hidden />
              {t('menu.profile')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="min-h-11 gap-2">
            <Link to="/guide">
              <CircleHelp aria-hidden />
              {t('guide.open')}
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t('menu.language')}</DropdownMenuLabel>
          {LOCALES.map((option) => (
            <DropdownMenuItem
              key={option}
              onSelect={() => void setLocale(option)}
              aria-current={option === locale}
              className="min-h-11 gap-2"
            >
              {/* Marked with a dot rather than by disabling the current row:
                  most screen readers skip a disabled item, which would hide the
                  very thing someone is checking. */}
              <span
                aria-hidden
                className={
                  option === locale ? 'size-1.5 rounded-full bg-primary' : 'size-1.5 rounded-full'
                }
              />
              {LOCALE_NAMES[option]}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          {installKind !== 'unavailable' ? (
            <DropdownMenuItem
              className="min-h-11 gap-2"
              onSelect={() => {
                if (installKind === 'prompt') void promptInstall()
                else setShowIosSheet(true)
              }}
            >
              <Download aria-hidden />
              {t('pwa.installTitle')}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem className="min-h-11 gap-2" onSelect={toggle}>
            {theme === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}
            {t('theme.toggle')}
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => void signOut()}>
            <LogOut aria-hidden />
            {t('auth.signOut')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Outside the menu on purpose — choosing an item closes the menu, and a
          sheet rendered inside it would unmount with the thing that opened it. */}
      <IosInstallSheet open={showIosSheet} onClose={() => setShowIosSheet(false)} />
    </>
  )
}
