/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdf4ee',
          100: '#fae5d3',
          200: '#f5c9a0',
          300: '#efa664',
          400: '#e8832f',
          500: '#e26411',
          600: '#d34d0c',
          700: '#af380d',
          800: '#8c2d12',
          900: '#712612',
        },
        surface: {
          DEFAULT: '#ffffff',
          dark: '#111318',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
