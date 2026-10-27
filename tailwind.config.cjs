
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f4f7fb',
          100: '#e8eef6',
          200: '#c9d6e8',
          300: '#9bb0cc',
          400: '#6a84a8',
          500: '#4a668a',
          600: '#384f6d',
          700: '#2c3f57',
          800: '#1f2d3f',
          900: '#141e2b',
          950: '#0b121a',
        },
        accent: {
          DEFAULT: '#0d9488',
          soft: '#14b8a6',
          dark: '#0f766e',
        },
        warn: '#d97706',
        danger: '#dc2626',
        ok: '#059669',
      },
      fontFamily: {
        sans: ['Segoe UI', 'Tahoma', 'sans-serif'],
        display: ['Segoe UI', 'Tahoma', 'sans-serif'],
        mono: ['Consolas', 'Courier New', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 0 rgba(255,255,255,0.04), 0 12px 40px rgba(0,0,0,0.35)',
      },
    },
  },
  plugins: [],
};
