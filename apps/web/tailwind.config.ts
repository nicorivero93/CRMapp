import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: '#0a0a0b', soft: '#111113', card: '#16161a', hover: '#1c1c21' },
        border: { DEFAULT: '#26262c', soft: '#1e1e23' },
        brand: { 50: '#eef2ff', 400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca' },
        text: { DEFAULT: '#e6e6e9', dim: '#9a9aa3', faint: '#6b6b74' },
        ok: '#10b981',
        warn: '#f59e0b',
        bad: '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 0 rgba(255,255,255,0.03) inset, 0 1px 2px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
} satisfies Config;
