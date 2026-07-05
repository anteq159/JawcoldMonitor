/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          2: 'rgb(var(--surface-2) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--border) / <alpha-value>)',
          strong: 'rgb(var(--border-strong) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          body: 'rgb(var(--ink-body) / <alpha-value>)',
          muted: 'rgb(var(--ink-muted) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          strong: 'rgb(var(--accent-strong) / <alpha-value>)',
          soft: 'rgb(var(--accent-soft) / <alpha-value>)',
        },
        teal: 'rgb(var(--teal) / <alpha-value>)',
        good: {
          DEFAULT: 'rgb(var(--good) / <alpha-value>)',
          bg: 'rgb(var(--good-bg) / <alpha-value>)',
        },
        warn: {
          DEFAULT: 'rgb(var(--warn) / <alpha-value>)',
          bg: 'rgb(var(--warn-bg) / <alpha-value>)',
        },
        crit: {
          DEFAULT: 'rgb(var(--crit) / <alpha-value>)',
          bg: 'rgb(var(--crit-bg) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--info) / <alpha-value>)',
          bg: 'rgb(var(--info-bg) / <alpha-value>)',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', '"Cascadia Code"', 'Consolas', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 2px rgba(27,38,36,0.04), 0 1px 1px rgba(27,38,36,0.03)',
      },
    },
  },
  plugins: [],
}
