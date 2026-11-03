import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Unlock Your Future. Legacy token names keep existing screens compatible.
        brand: {
          green: '#C8192E',
          'green-light': '#E85A69',
          'green-dark': '#A81124',
          orange: '#FF7700',
          'orange-light': '#ff8f26',
          'orange-dark': '#cc5f00',
          gray: '#B7B7B7',
          'gray-dark': '#9C9C9C',
        },
        // Brand accent ramp; existing indigo utility names remain compatible.
        indigo: {
          50: '#FFF0F2',
          100: '#FFE2E7',
          200: '#F8B8C3',
          300: '#F291A3',
          400: '#E96A80',
          500: '#D53C50',
          600: '#C8192E',
          700: '#AB1428',
          800: '#8F1023',
          900: '#710D1C',
        },
        // Theme-aware surface layers.
        surface: {
          800: 'var(--bg-800)',
          850: 'var(--bg-850)',
          900: 'var(--bg-900)',
          950: 'var(--bg-950)',
        },
      },
      fontFamily: {
        display: ['Space Grotesk', 'Noto Sans Myanmar', 'Inter', 'sans-serif'],
        sans: ['Inter', 'Noto Sans Myanmar', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        burmese: ['Noto Sans Myanmar', 'Inter', 'Myanmar Text', 'sans-serif'],
      },
      typography: (theme) => ({
        DEFAULT: {
          css: {
            fontFamily: '"Noto Sans Myanmar", Inter, "Myanmar Text", sans-serif',
            lineHeight: '1.8',
            p: {
              marginTop: '1.25em',
              marginBottom: '1.25em',
            },
            h1: {
              lineHeight: '1.4',
              color: theme('colors.brand.green'),
            },
            h2: {
              lineHeight: '1.4',
              marginTop: '1.75em',
              marginBottom: '0.75em',
              paddingBottom: '0.3em',
              borderBottomWidth: '1px',
              borderColor: theme('colors.gray.200'),
            },
            h3: {
              lineHeight: '1.4',
              color: theme('colors.gray.800'),
            },
            li: {
              marginTop: '0.5em',
              marginBottom: '0.5em',
            },
            blockquote: {
              borderLeftColor: theme('colors.brand.orange'),
              backgroundColor: theme('colors.gray.50'),
              padding: '1em',
              fontStyle: 'normal',
              color: theme('colors.gray.700'),
              borderRadius: '0.375rem',
            }
          }
        },
        invert: {
          css: {
            h2: {
              borderColor: theme('colors.gray.700'),
            },
            h3: {
              color: theme('colors.gray.200'),
            },
            blockquote: {
              backgroundColor: theme('colors.gray.800'),
              color: theme('colors.gray.300'),
            }
          }
        }
      }),
    },
  },
  plugins: [
    typography,
  ],
};
