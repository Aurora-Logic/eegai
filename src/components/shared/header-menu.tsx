import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, CircleHelp, Download, LogOut, Moon, Sun, UserRound } from 'lucide-react'
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
 * The menu trigger: three courses of brickwork, not a hamburger.
 *
 * It is still three stacked bars, so nobody has to learn anything — the shape
 * that means "menu" everywhere else is intact. What changes is that the bars are
 * bricks, with the joints staggered the way a real running bond staggers them,
 * which is the same wall the product is named after and the same one the
 * illustrations draw. The one icon on a phone header is worth the two minutes.
 *
 * `currentColor` and 1.7 stroke to sit level with the lucide icons beside it in
 * the wider header.
 */
function WallMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="4" width="18" height="5" rx="1" />
      <rect x="3" y="9.5" width="18" height="5" rx="1" />
      <rect x="3" y="15" width="18" height="5" rx="1" />
      {/* The joints. Alternating between two positions is what reads as a bond
          rather than as three boxes with a line in each. */}
      <path d="M14 4v5" />
      <path d="M9 9.5v5" />
      <path d="M14 15v5" />
    </svg>
  )
}

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
          <Button
            variant="ghost"
            size="icon"
            className="min-h-11 [&_svg]:size-5"
            aria-label={t('menu.open')}
          >
            <WallMark />
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
            <Link to="/inbox">
              <Bell aria-hidden />
              Alerts
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
