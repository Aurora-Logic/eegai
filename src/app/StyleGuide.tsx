import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTheme } from '@/hooks/use-theme'
import { t } from '@/lib/i18n'

const BRAND = [
  { name: 'plaster', hex: '#EBE7DC', role: 'Limewash wall — page ground' },
  { name: 'indigo', hex: '#21324F', role: 'Block-print ink — all primary text' },
  { name: 'marigold', hex: '#E8A317', role: 'The giving colour — primary action, sparingly' },
  { name: 'kraft', hex: '#C9A87C', role: 'Cardboard/courier — cards, labels' },
  { name: 'moss', hex: '#4A6B4F', role: 'Received / success' },
  { name: 'vermilion', hex: '#C0442E', role: 'Rejected / destructive only' },
] as const

const SEMANTIC = [
  'background',
  'foreground',
  'card',
  'muted',
  'primary',
  'secondary',
  'accent',
  'success',
  'destructive',
  'border',
] as const

const TYPE_SCALE = [
  { cls: 'text-display-xl', label: 'display-xl · 56px', sample: 'Nothing on the wall yet' },
  { cls: 'text-display-lg', label: 'display-lg · 40px', sample: 'Nothing on the wall yet' },
  { cls: 'text-display-md', label: 'display-md · 28px', sample: 'Nothing on the wall yet' },
  { cls: 'text-display-sm', label: 'display-sm · 20px (floor)', sample: 'Nothing on the wall yet' },
] as const

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border py-10">
      <h2 className="mb-6 font-display text-display-md">{title}</h2>
      {children}
    </section>
  )
}

export default function StyleGuide() {
  const { theme, toggle } = useTheme()
  const [liftKey, setLiftKey] = useState(0)

  return (
    <main className="plaster-ground min-h-dvh">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-display-lg">{t('styleguide.title')}</h1>
            <p className="mt-2 text-muted-foreground">{t('styleguide.subtitle')}</p>
          </div>
          <Button variant="outline" size="icon" onClick={toggle} aria-label={t('theme.toggle')}>
            {theme === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}
          </Button>
        </header>

        <Section title={t('styleguide.colour')}>
          <h3 className="mb-3 font-display text-display-sm">Brand</h3>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {BRAND.map((c) => (
              <li key={c.name} className="hairline flex items-center gap-3 rounded-md bg-card p-3">
                {/* Swatches read the CSS variable directly — a templated
                    `bg-${name}` class would not survive Tailwind's static scan. */}
                <span
                  className="hairline size-10 shrink-0 rounded-sm"
                  style={{ backgroundColor: `hsl(var(--${c.name}))` }}
                />
                <span className="min-w-0">
                  <span className="block font-mono text-xs">
                    {c.name} · {c.hex}
                  </span>
                  <span className="block text-sm text-muted-foreground">{c.role}</span>
                </span>
              </li>
            ))}
          </ul>

          <h3 className="mb-3 mt-8 font-display text-display-sm">Semantic</h3>
          <ul className="flex flex-wrap gap-2">
            {SEMANTIC.map((name) => (
              <li key={name} className="hairline flex items-center gap-2 rounded-sm bg-card p-2">
                <span
                  className="hairline size-6 rounded-sm"
                  style={{ backgroundColor: `hsl(var(--${name}))` }}
                />
                <span className="font-mono text-xs">{name}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t('styleguide.type')}>
          <div className="space-y-6">
            {TYPE_SCALE.map((s) => (
              <div key={s.cls}>
                <span className="font-mono text-xs text-muted-foreground">{s.label}</span>
                <p className={`font-display ${s.cls} mt-1`}>{s.sample}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 space-y-4">
            <div>
              <span className="font-mono text-xs text-muted-foreground">
                body · Instrument Sans
              </span>
              <p className="mt-1">
                A donor photographs an item they no longer need, posts it, and a verified NGO claims
                it.
              </p>
            </div>
            <div>
              <span className="font-mono text-xs text-muted-foreground">
                body · Noto Sans Tamil fallback
              </span>
              <p className="mt-1" lang="ta">
                உங்களுக்குத் தேவையில்லாத பொருட்களை கோவையில் தேவைப்படுபவர்களுக்கு வழங்குங்கள்.
              </p>
            </div>
            <div>
              <span className="font-mono text-xs text-muted-foreground">
                utility · JetBrains Mono — AWB, OTPs, IDs, timestamps
              </span>
              <p className="mt-1 font-mono">AWB 7D8821946330 · OTP 4417 · 2026-07-27 18:40 IST</p>
            </div>
          </div>
        </Section>

        <Section title={t('styleguide.components')}>
          <div className="flex flex-wrap gap-3">
            <Button>{t('action.claim')}</Button>
            <Button variant="secondary">Schedule pickup</Button>
            <Button variant="outline">{t('action.back')}</Button>
            <Button variant="ghost">Skip</Button>
            <Button variant="destructive">Reject item</Button>
            <Button disabled>Disabled</Button>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <Badge>clothes</Badge>
            <Badge>like new</Badge>
            <Badge variant="success">Received</Badge>
            <Badge variant="destructive">Rejected</Badge>
            <Badge variant="muted">Awaiting pickup</Badge>
            <Badge variant="outline">80G</Badge>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Winter jackets ×4</CardTitle>
                <CardDescription>R.S. Puram · 641004</CardDescription>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Badge>clothes</Badge>
                <Badge>good</Badge>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-2 p-5">
                <Label htmlFor="sg-phone">Phone number</Label>
                <Input id="sg-phone" type="tel" inputMode="numeric" placeholder="98XXXXXXXX" />
                <p className="text-sm text-muted-foreground">
                  Tab to this field to check the focus ring.
                </p>
              </CardContent>
            </Card>
          </div>
        </Section>

        <Section title={t('styleguide.motion')}>
          <p className="mb-4 max-w-[52ch] text-muted-foreground">
            The brick lift-off is the only animation in the product. Everything else is instant.
            With <span className="font-mono text-xs">prefers-reduced-motion</span> set, the brick
            fades instead.
          </p>
          <div className="flex items-end gap-6">
            {/* The brick sits on the wall until you ask for it. Animating on
                mount would leave an empty square for anyone who scrolled down
                after the animation had already finished. */}
            <div
              key={liftKey}
              className={`hairline size-28 rounded-sm bg-kraft ${
                liftKey > 0 ? 'animate-brick-lift motion-reduce:animate-brick-fade' : ''
              }`}
            />
            <Button variant="outline" onClick={() => setLiftKey((k) => k + 1)}>
              {t('styleguide.liftDemo')}
            </Button>
          </div>
        </Section>

        <Section title="Empty state">
          <p className="text-muted-foreground">{t('empty.wall')}</p>
        </Section>

        <footer className="border-t border-border py-8">
          <Button variant="link" asChild>
            <Link to="/">Back to the wall</Link>
          </Button>
        </footer>
      </div>
    </main>
  )
}
