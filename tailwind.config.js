/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: {
          bg: '#0f1117',
          grid: '#1a1d26',
          node: '#1e2130',
          nodeHover: '#252840',
          nodeBorder: '#3a3f58',
          wire: '#4a5070',
          wireActive: '#22d3ee',
          wireHighV: '#f59e0b',
          wireLowV: '#3b82f6',
        },
        logic: {
          high: '#22c55e',
          low: '#ef4444',
          unknown: '#a855f7',
          hiZ: '#6b7280',
        },
        instrument: {
          bg: '#111318',
          grid: '#1f2233',
          ch1: '#22d3ee',
          ch2: '#f59e0b',
          ch3: '#a855f7',
          ch4: '#22c55e',
          text: '#94a3b8',
        },
        hil: {
          connected: '#22c55e',
          disconnected: '#ef4444',
          ingress: '#38bdf8',
          egress: '#fb923c',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
