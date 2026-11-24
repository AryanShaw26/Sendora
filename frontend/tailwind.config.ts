import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        red: {
          50: '#FDF2F2',
          100: '#FCE8E6',
          200: '#F9D0CC',
          300: '#F4A9A2',
          400: '#EE7B72',
          500: '#EA4335',
          600: '#D93025',
          700: '#C5221F',
          800: '#A50E0E',
          900: '#7F0A0A',
        },
        surface: {
          DEFAULT: '#F6F8FC',
          hover: '#F2F6FC',
        },
        line: {
          DEFAULT: '#E8EAED',
          strong: '#DADCE0',
        },
        ink: {
          DEFAULT: '#202124',
          soft: '#5F6368',
          faint: '#9AA0A6',
        },
      },
      fontFamily: {
        sans: ['Roboto', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(60,64,67,.15), 0 1px 3px 1px rgba(60,64,67,.08)',
        float: '0 4px 12px rgba(60,64,67,.2)',
        compose: '0 8px 24px rgba(60,64,67,.3)',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        slideUp: {
          from: { transform: 'translateY(24px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        slideUp: 'slideUp .2s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
