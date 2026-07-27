import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

/**
 * Colours resolve through the CSS variables declared in src/globals.css so that
 * light/dark inversion happens in one place. `<alpha-value>` keeps Tailwind's
 * opacity modifiers (`bg-primary/20`) working against HSL triplets.
 */
const hsl = (token: string) => `hsl(var(--${token}) / <alpha-value>)`

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand, by their real names — for the rare case a component needs the
        // literal colour rather than its semantic role.
        plaster: hsl('plaster'),
        indigo: hsl('indigo'),
        marigold: hsl('marigold'),
        kraft: hsl('kraft'),
        moss: hsl('moss'),
        vermilion: hsl('vermilion'),

        // Semantic — what components should actually reach for.
        border: hsl('border'),
        input: hsl('input'),
        ring: hsl('ring'),
        background: hsl('background'),
        foreground: hsl('foreground'),
        primary: {
          DEFAULT: hsl('primary'),
          foreground: hsl('primary-foreground'),
        },
        secondary: {
          DEFAULT: hsl('secondary'),
          foreground: hsl('secondary-foreground'),
        },
        destructive: {
          DEFAULT: hsl('destructive'),
          foreground: hsl('destructive-foreground'),
        },
        success: {
          DEFAULT: hsl('success'),
          foreground: hsl('success-foreground'),
        },
        muted: {
          DEFAULT: hsl('muted'),
          foreground: hsl('muted-foreground'),
        },
        accent: {
          DEFAULT: hsl('accent'),
          foreground: hsl('accent-foreground'),
        },
        popover: {
          DEFAULT: hsl('popover'),
          foreground: hsl('popover-foreground'),
        },
        card: {
          DEFAULT: hsl('card'),
          foreground: hsl('card-foreground'),
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        // Noto Sans Devanagari is in every stack from day one so that Marathi
        // and Hindi strings land without reflowing the layout (PLAN.md §8).
        display: ['"Bricolage Grotesque"', '"Noto Sans Devanagari"', 'system-ui', 'sans-serif'],
        sans: ['"Instrument Sans"', '"Noto Sans Devanagari"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Noto Sans Devanagari"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // Display steps only. The 20px floor from PLAN.md §8 is the smallest
        // entry here on purpose — there is no `display-sm`.
        'display-sm': ['1.25rem', { lineHeight: '1.2', letterSpacing: '-0.015em' }],
        'display-md': ['1.75rem', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        'display-lg': ['2.5rem', { lineHeight: '1.05', letterSpacing: '-0.03em' }],
        'display-xl': ['3.5rem', { lineHeight: '1', letterSpacing: '-0.035em' }],
      },
      transitionTimingFunction: {
        lift: 'var(--lift-ease)',
      },
      transitionDuration: {
        lift: 'var(--lift-duration)',
      },
      keyframes: {
        // A claimed brick lifts off the wall and the gap fills with plaster.
        'brick-lift': {
          '0%': { transform: 'translateY(0) scale(1)', opacity: '1' },
          '40%': { transform: 'translateY(-10px) scale(1.02)', opacity: '1' },
          '100%': { transform: 'translateY(-28px) scale(0.96)', opacity: '0' },
        },
        // The prefers-reduced-motion substitute.
        'brick-fade': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
      },
      animation: {
        'brick-lift': 'brick-lift var(--lift-duration) var(--lift-ease) forwards',
        'brick-fade': 'brick-fade 150ms linear forwards',
      },
    },
  },
  plugins: [animate],
} satisfies Config
