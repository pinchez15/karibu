import type { Config } from 'tailwindcss'

// Karibu Office brand kit (docs/karibu-office-brand.md). Coral, taken from
// KaribuLearn, so nothing here can be mistaken for the cobalt EHR. Values live
// in globals.css as RGB triples.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'rgb(var(--ko-bg) / <alpha-value>)',
        foreground: 'rgb(var(--ko-ink) / <alpha-value>)',
        coral: {
          // DEFAULT is the action colour: dark enough for white text and for links on white.
          DEFAULT: 'rgb(var(--ko-coral) / <alpha-value>)',
          // The brand coral itself: the mark, charts and highlights. Never behind small text.
          bright: 'rgb(var(--ko-coral-bright) / <alpha-value>)',
          deep: 'rgb(var(--ko-coral-deep) / <alpha-value>)',
          soft: 'rgb(var(--ko-coral-soft) / <alpha-value>)',
          wash: 'rgb(var(--ko-coral-wash) / <alpha-value>)',
          ink: 'rgb(var(--ko-coral-ink) / <alpha-value>)',
        },
        amber: {
          DEFAULT: 'rgb(var(--ko-amber) / <alpha-value>)',
          soft: 'rgb(var(--ko-amber-soft) / <alpha-value>)',
          ink: 'rgb(var(--ko-amber-ink) / <alpha-value>)',
        },
        green: {
          DEFAULT: 'rgb(var(--ko-green) / <alpha-value>)',
          soft: 'rgb(var(--ko-green-soft) / <alpha-value>)',
          ink: 'rgb(var(--ko-green-ink) / <alpha-value>)',
        },
        // "Needs you". A dark brick, far from coral in lightness, so an alert never reads as a button.
        red: {
          DEFAULT: 'rgb(var(--ko-red) / <alpha-value>)',
          soft: 'rgb(var(--ko-red-soft) / <alpha-value>)',
        },
        ink: 'rgb(var(--ko-ink) / <alpha-value>)',
        body: 'rgb(var(--ko-body) / <alpha-value>)',
        muted: 'rgb(var(--ko-muted) / <alpha-value>)',
        line: {
          DEFAULT: 'rgb(var(--ko-line) / <alpha-value>)',
          soft: 'rgb(var(--ko-line-soft) / <alpha-value>)',
        },
        surface: 'rgb(var(--ko-surface) / <alpha-value>)',
      },
      fontFamily: {
        // System fonts only: no webfont download on 3G. Inter is used when the device has it.
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      minHeight: { touch: '48px' },
      minWidth: { touch: '48px' },
    },
  },
  plugins: [],
}

export default config
