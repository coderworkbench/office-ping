/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-fraunces)', 'ui-serif', 'Georgia', 'serif'],
        mono:    ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      colors: {
        /* Office Intercom palette */
        paper:    '#F7F3EC',   /* page background */
        card:     '#FFFFFF',
        ink:      '#0F172A',   /* body text */
        inkmute:  '#5E6474',   /* secondary text */
        hairline: '#E7E0D1',   /* warm divider */
        /* The one bright accent — reserved for ping / urgent */
        ember: {
          50:  '#FFF4F1',
          100: '#FFE4DD',
          500: '#DC2626',
          600: '#B91C1C',
          700: '#991B1B',
          DEFAULT: '#DC2626',
        },
        /* Muted institutional blue for secondary UI */
        indigo: {
          DEFAULT: '#1E3A5F',
          600:     '#1C3253',
          700:     '#172744',
        },
        /* Presence */
        jade: {
          50:  '#ECFDF4',
          500: '#16A34A',
          DEFAULT: '#16A34A',
        },
        /* Dark side-nav surface */
        slab: {
          900: '#0F1322',
          800: '#141A2E',
          700: '#1E2742',
        },
      },
      borderRadius: {
        xl2: '14px',
        tool: '10px',
      },
      boxShadow: {
        paper: '0 1px 0 rgba(16, 24, 40, 0.03), 0 1px 2px rgba(16, 24, 40, 0.06)',
        pop:   '0 20px 40px -20px rgba(15, 19, 34, 0.25), 0 8px 20px -12px rgba(15, 19, 34, 0.15)',
        ember: '0 10px 25px -5px rgba(220, 38, 38, 0.35)',
      },
      keyframes: {
        slideIn:  { from: { transform: 'translateY(12px)', opacity: 0 }, to: { transform: 'translateY(0)', opacity: 1 } },
        fadeIn:   { from: { opacity: 0 }, to: { opacity: 1 } },
        pulseDot: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(22, 163, 74, 0.55)' },
          '50%':      { boxShadow: '0 0 0 6px rgba(22, 163, 74, 0)' },
        },
      },
      animation: {
        slideIn:  'slideIn 240ms cubic-bezier(.2,.6,.2,1)',
        fadeIn:   'fadeIn 220ms ease-out',
        pulseDot: 'pulseDot 1.9s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
