/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#ecfeff',
          100: '#cffafe',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
        },
        trust: {
          valid: '#10b981',
          warning: '#f59e0b',
          suspicious: '#f97316',
          invalid: '#ef4444',
        },
        surface: {
          darkest: '#080c14',
          darker: '#0b0f19',
          dark: '#0f172a',
          card: '#1e293b',
          border: '#334155',
        }
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        'glow-emerald': '0 0 25px -5px rgba(16, 185, 129, 0.3)',
        'glow-amber': '0 0 25px -5px rgba(245, 158, 11, 0.3)',
        'glow-orange': '0 0 25px -5px rgba(249, 115, 22, 0.3)',
        'glow-rose': '0 0 25px -5px rgba(239, 68, 68, 0.3)',
        'glow-cyan': '0 0 25px -5px rgba(6, 182, 212, 0.3)',
      }
    },
  },
  plugins: [],
}
