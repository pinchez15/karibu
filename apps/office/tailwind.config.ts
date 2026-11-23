import type { Config } from 'tailwindcss'

// Same Karibu Health tokens as apps/web (see globals.css). Per-app tokens
// until a shared brand package exists (ADR-0001).
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'rgb(var(--kh-bg) / <alpha-value>)',
        foreground: 'rgb(var(--kh-ink) / <alpha-value>)',
        cobalt: {
          DEFAULT: 'rgb(var(--kh-cobalt) / <alpha-value>)',
          deep: 'rgb(var(--kh-cobalt-deep) / <alpha-value>)',
          soft: 'rgb(var(--kh-cobalt-soft) / <alpha-value>)',
          ink: 'rgb(var(--kh-cobalt-ink) / <alpha-value>)',
        },
        amber: {
          DEFAULT: 'rgb(var(--kh-amber) / <alpha-value>)',
          soft: 'rgb(var(--kh-amber-soft) / <alpha-value>)',
          ink: 'rgb(var(--kh-amber-ink) / <alpha-value>)',
        },
        green: {
          DEFAULT: 'rgb(var(--kh-green) / <alpha-value>)',
          soft: 'rgb(var(--kh-green-soft) / <alpha-value>)',
        },
        red: {
          DEFAULT: 'rgb(var(--kh-red) / <alpha-value>)',
          soft: 'rgb(var(--kh-red-soft) / <alpha-value>)',
        },
        ink: 'rgb(var(--kh-ink) / <alpha-value>)',
        body: 'rgb(var(--kh-body) / <alpha-value>)',
        muted: 'rgb(var(--kh-muted) / <alpha-value>)',
        line: {
          DEFAULT: 'rgb(var(--kh-line) / <alpha-value>)',
          soft: 'rgb(var(--kh-line-soft) / <alpha-value>)',
        },
        surface: 'rgb(var(--kh-surface) / <alpha-value>)',
      },
      fontFamily: {
        // System fonts only: no webfont download on 3G. Inter is used when the phone has it.
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
