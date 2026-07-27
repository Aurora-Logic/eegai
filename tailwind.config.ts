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
        // Noto Sans Tamil is in every stack from day one so that Tamil strings
        // land without reflowing the layout (PLAN.md §8).
        display: [
          '"Bricolage Grotesque"',
          '"Noto Sans Tamil"',
          '"Noto Sans Devanagari"',
          'system-ui',
          'sans-serif',
        ],
        sans: [
          '"Instrument Sans"',
          '"Noto Sans Tamil"',
          '"Noto Sans Devanagari"',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"',
          '"Noto Sans Tamil"',
          '"Noto Sans Devanagari"',
          'ui-monospace',
          'monospace',
        ],
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
        // The landing hero. Not decoration — it acts out the whole product on a
        // loop: something is hung on the wall, it hangs there a while, an
        // organisation takes it, the hook is empty again.
        //
        // One keyframe rather than three chained animations, because the three
        // items run the same cycle at different offsets and a single timeline is
        // far easier to reason about than three that must stay in step.
        // The hero: a parcel crossing from one pair of hands to another. The
        // whole product in one gesture, so it is the only thing that moves.
        pass: {
          // held by the volunteer
          '0%, 12%': { transform: 'translate(0, 0) rotate(-3deg)', opacity: '1' },
          // lifted across, with a little arc rather than a straight slide
          '34%': { transform: 'translate(24px, -14px) rotate(3deg)', opacity: '1' },
          // settled into the child's hands — level with the hands, not the face,
          // which is where a straight 58px slide had been putting it
          '52%, 78%': { transform: 'translate(46px, 20px) rotate(0deg)', opacity: '1' },
          // and carried in, so the hands are empty for the next one
          '92%, 100%': { transform: 'translate(46px, 20px) rotate(0deg)', opacity: '0' },
        },
        // The child's arms lift as the parcel arrives.
        reach: {
          '0%, 20%': { transform: 'rotate(0deg)' },
          '46%, 80%': { transform: 'rotate(-7deg)' },
          '100%': { transform: 'rotate(0deg)' },
        },
        // The centre's doorway warms as the auto arrives, and fades once it has
        // gone in. It is the point of the whole loop, so it is the only thing on
        // the page that changes colour.
        welcome: {
          '0%, 30%': { opacity: '0.18' },
          '56%': { opacity: '0.7' },
          '100%': { opacity: '0.18' },
        },
        hang: {
          // arriving — dropped onto the hook and settling
          '0%': { transform: 'translateY(-14px) rotate(-7deg)', opacity: '0' },
          '6%': { transform: 'translateY(0) rotate(4deg)', opacity: '1' },
          '10%': { transform: 'translateY(0) rotate(-2.5deg)', opacity: '1' },
          // hanging — the long middle, breathing
          '14%, 58%': { transform: 'translateY(0) rotate(1.8deg)', opacity: '1' },
          '36%': { transform: 'translateY(0) rotate(-1.8deg)', opacity: '1' },
          // claimed — lifts off the wall, the one motion §8 already allows
          '66%': { transform: 'translateY(-10px) rotate(0deg)', opacity: '1' },
          '74%': { transform: 'translateY(-40px) rotate(3deg)', opacity: '0' },
          // the hook stays empty for a beat, then it begins again
          '100%': { transform: 'translateY(-14px) rotate(-7deg)', opacity: '0' },
        },
      },
      animation: {
        'brick-lift': 'brick-lift var(--lift-duration) var(--lift-ease) forwards',
        'brick-fade': 'brick-fade 150ms linear forwards',
        hang: 'hang 15s ease-in-out infinite',
        pass: 'pass 6s ease-in-out infinite',
        reach: 'reach 6s ease-in-out infinite',
        welcome: 'welcome 6s ease-in-out infinite',
      },
    },
  },
  plugins: [animate],
} satisfies Config
