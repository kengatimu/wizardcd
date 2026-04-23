/** @type {import('tailwindcss').Config} */

/*  Helper: reference a CSS custom property as an rgb() colour.
 *  Tailwind calls this function with { opacityValue } for /NN variants.
 *  e.g. bg-wiz-bg/60 → background-color: rgb(var(--wiz-bg) / 0.6)       */
function c(varName) {
  return ({ opacityValue }) =>
    opacityValue !== undefined
      ? `rgb(var(${varName}) / ${opacityValue})`
      : `rgb(var(${varName}))`
}

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── WizardCD Brand Backgrounds ─────────────────────────────
        'wiz-bg':             c('--wiz-bg'),
        'wiz-surface':        c('--wiz-surface'),
        'wiz-raised':         c('--wiz-raised'),
        'wiz-panel':          c('--wiz-panel'),
        // ── Borders ────────────────────────────────────────────────
        'wiz-border':         c('--wiz-border'),
        'wiz-border-mid':     c('--wiz-border-mid'),
        'wiz-border-strong':  c('--wiz-border-strong'),
        // ── Gold Accent (from "CD" in logo — primary CTA/actions) ──
        'wiz-gold':           c('--wiz-gold'),
        'wiz-gold-light':     c('--wiz-gold-light'),
        'wiz-gold-dim':       c('--wiz-gold-dim'),
        // ── Teal Accent (from "CONTINUOUS MAGIC" — info/links/hover) ─
        'wiz-teal':           c('--wiz-teal'),
        'wiz-teal-light':     c('--wiz-teal-light'),
        'wiz-teal-dim':       c('--wiz-teal-dim'),
        // ── Violet (wizard theme) ──────────────────────────────────
        'wiz-violet':         c('--wiz-violet'),
        'wiz-violet-dim':     c('--wiz-violet-dim'),
        // ── Typography ─────────────────────────────────────────────
        'wiz-cream':          c('--wiz-cream'),
        'wiz-gray':           c('--wiz-gray'),
        'wiz-muted':          c('--wiz-muted'),
        'wiz-dim':            c('--wiz-dim'),
        // ── Signal Colours ─────────────────────────────────────────
        'sig-green':          c('--sig-green'),
        'sig-green-dim':      c('--sig-green-dim'),
        'sig-red':            c('--sig-red'),
        'sig-red-dim':        c('--sig-red-dim'),
        'sig-yellow':         c('--sig-yellow'),
        'sig-yellow-dim':     c('--sig-yellow-dim'),
        'sig-blue':           c('--sig-blue'),
        'sig-blue-dim':       c('--sig-blue-dim'),
        'sig-orange':         c('--sig-orange'),
        'sig-orange-dim':     c('--sig-orange-dim'),
        'sig-purple':         c('--sig-purple'),
        'sig-purple-dim':     c('--sig-purple-dim'),
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', '"Cascadia Code"', 'monospace'],
      },
      fontSize: {
        '2xs': ['11px', '15px'],
        xs:    ['13px', '18px'],
        sm:    ['14px', '20px'],
        base:  ['15px', '22px'],
        md:    ['16px', '24px'],
        lg:    ['17px', '26px'],
        xl:    ['19px', '27px'],
        '2xl': ['22px', '30px'],
        '3xl': ['28px', '36px'],
      },
      boxShadow: {
        'gold':     '0 0 20px rgba(var(--wiz-gold) / 0.15), 0 0 40px rgba(var(--wiz-gold) / 0.05)',
        'gold-sm':  '0 0 10px rgba(var(--wiz-gold) / 0.12)',
        'panel':    '0 4px 32px rgba(0, 0, 0, 0.50)',
        'card':     '0 2px 16px rgba(0, 0, 0, 0.40)',
        'inset-top':'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
        'light-card': '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
      },
      backgroundImage: {
        'card-gradient':    'linear-gradient(180deg, rgb(var(--wiz-raised)) 0%, rgb(var(--wiz-surface)) 100%)',
        'surface-gradient': 'linear-gradient(180deg, rgb(var(--wiz-surface)) 0%, rgb(var(--wiz-bg)) 100%)',
        'gold-gradient':    'linear-gradient(135deg, rgb(var(--wiz-gold)) 0%, rgb(var(--wiz-gold-light)) 50%, rgb(var(--wiz-gold)) 100%)',
        'sidebar-gradient': 'linear-gradient(180deg, rgb(var(--wiz-surface)) 0%, rgb(var(--wiz-bg)) 100%)',
        'status-running':   'linear-gradient(90deg, rgba(var(--sig-yellow) / 0.08) 0%, transparent 100%)',
      },
      keyframes: {
        'fade-in': {
          '0%':   { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-fast': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-in-left': {
          '0%':   { opacity: '0', transform: 'translateX(-12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'pulse-gold': {
          '0%, 100%': { boxShadow: '0 0 8px rgba(var(--wiz-gold) / 0.20)' },
          '50%':       { boxShadow: '0 0 24px rgba(var(--wiz-gold) / 0.45)' },
        },
        'pulse-green': {
          '0%, 100%': { boxShadow: '0 0 6px rgba(var(--sig-green) / 0.25)' },
          '50%':       { boxShadow: '0 0 16px rgba(var(--sig-green) / 0.50)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition:  '200% 0' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%':       { opacity: '0.3' },
        },
      },
      animation: {
        'fade-in':      'fade-in 0.30s ease-out',
        'fade-in-fast': 'fade-in-fast 0.15s ease-out',
        'slide-left':   'slide-in-left 0.30s ease-out',
        'pulse-gold':   'pulse-gold 2.5s ease-in-out infinite',
        'pulse-green':  'pulse-green 2.0s ease-in-out infinite',
        shimmer:        'shimmer 2.0s linear infinite',
        blink:          'blink 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
