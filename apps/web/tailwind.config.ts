import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // shadcn semantic tokens (mapped to Karibu palette in globals.css)
        background: 'rgb(var(--background) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        card: {
          DEFAULT: 'rgb(var(--card) / <alpha-value>)',
          foreground: 'rgb(var(--card-foreground) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          foreground: 'rgb(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--secondary) / <alpha-value>)',
          foreground: 'rgb(var(--secondary-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'rgb(var(--muted) / <alpha-value>)',
          foreground: 'rgb(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          foreground: 'rgb(var(--accent-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'rgb(var(--destructive) / <alpha-value>)',
          foreground: 'rgb(var(--destructive-foreground) / <alpha-value>)',
        },
        border: 'rgb(var(--border) / <alpha-value>)',
        input: 'rgb(var(--input) / <alpha-value>)',
        'input-background': 'rgb(var(--input-background) / <alpha-value>)',
        ring: 'rgb(var(--ring) / <alpha-value>)',

        // Karibu Health palette — direct access (preserves hierarchy + semantic intent)
        cobalt: {
          DEFAULT: 'rgb(var(--kh-cobalt) / <alpha-value>)',
          deep: 'rgb(var(--kh-cobalt-deep) / <alpha-value>)',
          soft: 'rgb(var(--kh-cobalt-soft) / <alpha-value>)',
          ink: 'rgb(var(--kh-cobalt-ink) / <alpha-value>)',
        },
        slate: {
          DEFAULT: 'rgb(var(--kh-slate) / <alpha-value>)',
          deep: 'rgb(var(--kh-slate-deep) / <alpha-value>)',
          soft: 'rgb(var(--kh-slate-soft) / <alpha-value>)',
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
        line: {
          DEFAULT: 'rgb(var(--kh-line) / <alpha-value>)',
          soft: 'rgb(var(--kh-line-soft) / <alpha-value>)',
        },
        page: 'rgb(var(--kh-page) / <alpha-value>)',
        coral: {
          DEFAULT: 'rgb(var(--kh-coral) / <alpha-value>)',
          deep: 'rgb(var(--kh-coral-deep) / <alpha-value>)',
          soft: 'rgb(var(--kh-coral-soft) / <alpha-value>)',
          wash: 'rgb(var(--kh-coral-wash) / <alpha-value>)',
        },

        // Status / signal colors — direct hex
        'status-synced': '#0E8A5F',
        'status-pending': '#F5A524',
        'status-offline': '#C8362B',
        'pin-critical': '#C8362B',
        'pin-warning': '#F5A524',
        'pin-info': '#1F36C7',

        // Legacy aliases (kept so existing components don't break)
        success: '#0E8A5F',
        warning: '#F5A524',
        error: '#C8362B',
      },
      fontFamily: {
        // Wired through next/font in app/layout.tsx — fallbacks remain for SSR safety
        sans: ['var(--font-inter)', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'Geist Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        base: ['1rem', { lineHeight: '1.5' }],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      minHeight: { touch: '48px' },
      minWidth: { touch: '48px' },
      letterSpacing: {
        tightest: '-0.025em',
      },
    },
  },
  plugins: [],
}

export default config
