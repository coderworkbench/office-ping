/** @type {import('tailwindcss').Config} */
// Sunbeam design system (TGF), bound to Tailwind as in UI_DESIGN_SYSTEM.md §24.1.
// Colour values live in styles/globals.css as RGB triples so `bg-gold-fill/40`
// works; never put hex here.
const rgb = (v) => `rgb(var(--${v}) / <alpha-value>)`;

module.exports = {
  // §7.3 — every hover: utility only applies where a real pointer can hover,
  // so a tapped button doesn't stay in its hover state on phones.
  future: { hoverOnlyWhenSupported: true },
  // Light-only: never let the OS dark mode switch on inherited dark: variants.
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // §3.1 — Noto Sans, self-hosted (app/layout.tsx), one variable file.
        sans: ['var(--font-noto)', 'system-ui', '-apple-system', 'BlinkMacSystemFont',
               '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      colors: {
        page:     rgb('bg'),
        surface:  { DEFAULT: rgb('surface'), 2: rgb('surface-2') },
        inset:    rgb('inset'),
        ink:      { DEFAULT: rgb('ink'), 2: rgb('ink-2'), 3: rgb('ink-3') },
        line:     { DEFAULT: rgb('line'), 2: rgb('line-2') },
        brand:    { DEFAULT: rgb('brand'), dark: rgb('brand-deep'), soft: rgb('brand-soft') },
        gold:     { DEFAULT: rgb('gold'), bright: rgb('gold-bright'),
                    soft: rgb('gold-soft'), fill: rgb('gold-fill') },
        'on-gold': rgb('on-gold'),
        success:  { DEFAULT: rgb('success'), soft: rgb('success-soft') },
        warn:     { DEFAULT: rgb('warn'),    soft: rgb('warn-soft') },
        rose:     { DEFAULT: rgb('rose'),    soft: rgb('rose-soft'), deep: rgb('rose-deep') },
        // Urgent pings use the live/real-time red — never re-tinted to gold.
        live:     { DEFAULT: rgb('live'),    soft: rgb('live-soft') },
        sidebar:  { DEFAULT: rgb('sidebar'), 2: rgb('sidebar-2'), active: rgb('sidebar-active') },
      },
      borderRadius: {
        btn: '14px',   // §5.1 --r — md/lg buttons
      },
      boxShadow: {
        // §5.3 — warm, tinted with the ink, never neutral black.
        sm:    '0 1px 2px rgb(36 27 4 / .06), 0 1px 3px rgb(36 27 4 / .05)',
        md:    '0 4px 14px rgb(36 27 4 / .09)',
        lg:    '0 18px 44px rgb(36 27 4 / .16)',
        '2xl': '0 25px 50px -12px rgb(36 27 4 / .25)',
        up:    '0 -4px 16px rgb(36 27 4 / .08)',    // bottom tab bar
        sheet: '0 -8px 30px rgb(36 27 4 / .22)',    // bottom sheet
        ring:  '0 0 0 2px rgb(58 47 5 / .30), 0 0 0 4px rgb(246 198 44 / .60)',
      },
      keyframes: {
        slideIn:  { from: { transform: 'translateY(12px)', opacity: 0 }, to: { transform: 'translateY(0)', opacity: 1 } },
        fadeIn:   { from: { opacity: 0 }, to: { opacity: 1 } },
        sheetUp:  { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        pulseDot: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgb(17 120 77 / .55)' },
          '50%':      { boxShadow: '0 0 0 6px rgb(17 120 77 / 0)' },
        },
        popIn: {
          from: { transform: 'scale(.92)', opacity: 0 },
          to:   { transform: 'scale(1)',   opacity: 1 },
        },
        alertPulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgb(220 31 83 / .55)' },
          '50%':      { boxShadow: '0 0 0 18px rgb(220 31 83 / 0)' },
        },
        clickRing: {
          '0%':   { transform: 'scale(.3)', opacity: '.9' },
          '100%': { transform: 'scale(1.7)', opacity: '0' },
        },
        // Guided-tour spotlight: a slow gold pulse around the highlighted control.
        tourPulse: {
          '0%, 100%': { boxShadow: '0 0 0 9999px rgb(20 14 2 / .58), 0 0 0 3px rgb(246 198 44), 0 0 0 3px rgb(246 198 44 / .5)' },
          '50%':      { boxShadow: '0 0 0 9999px rgb(20 14 2 / .58), 0 0 0 3px rgb(246 198 44), 0 0 0 10px rgb(246 198 44 / 0)' },
        },
        ring: {
          '0%, 60%, 100%': { transform: 'rotate(0)' },
          '10%, 30%':      { transform: 'rotate(-14deg)' },
          '20%, 40%':      { transform: 'rotate(14deg)' },
        },
      },
      animation: {
        slideIn:  'slideIn 240ms cubic-bezier(.2,.6,.2,1)',
        fadeIn:   'fadeIn 220ms ease-out',
        sheetUp:  'sheetUp 260ms ease-out',
        pulseDot: 'pulseDot 1.9s ease-in-out infinite',
        popIn:    'popIn 260ms cubic-bezier(.2,.8,.2,1.2)',
        /* urgent pop-up: pop in, then keep pulsing a red halo */
        alertPulse: 'popIn 260ms cubic-bezier(.2,.8,.2,1.2), alertPulse 1.6s ease-in-out 260ms infinite',
        ring:     'ring 1.8s ease-in-out infinite',
        clickRing: 'clickRing 700ms ease-out 550ms both',
        tourPulse: 'tourPulse 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
