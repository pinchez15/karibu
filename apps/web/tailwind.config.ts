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
        // Clinical color palette
        primary: '#0369A1',      // Clinical blue
        success: '#059669',      // Semantic green
        warning: '#D97706',      // Semantic amber
        error: '#DC2626',        // Semantic red
        // Slate text hierarchy
        'text-primary': '#1E293B',   // slate-800
        'text-secondary': '#334155', // slate-700
        'text-muted': '#64748B',     // slate-500
      },
      fontFamily: {
        sans: ['Roboto', 'system-ui', 'sans-serif'],
        mono: ['Roboto Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // Ensure minimum 16px base for readability
        base: ['1rem', { lineHeight: '1.5' }],
      },
      minHeight: {
        // Touch target minimum (48px)
        'touch': '48px',
      },
      minWidth: {
        // Touch target minimum (48px)
        'touch': '48px',
      },
    },
  },
  plugins: [],
}

export default config
