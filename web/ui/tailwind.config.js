/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── WizardCD Brand Backgrounds ─────────────────────────────
        'wiz-bg':           '#080B14',
        'wiz-surface':      '#0D1120',
        'wiz-raised':       '#111827',
        'wiz-panel':        '#161D2E',
        // ── Borders ────────────────────────────────────────────────
        'wiz-border':       '#1B2840',
        'wiz-border-mid':   '#243452',
        'wiz-border-strong':'#2E4068',
        // ── Gold Accent (from "CD" in logo) ────────────────────────
        'wiz-gold':         '#C9A84C',
        'wiz-gold-light':   '#D4B560',
        'wiz-gold-dim':     '#1A1608',
        // ── Violet (wizard theme) ───────────────────────────────────
        'wiz-violet':       '#6B46A0',
        'wiz-violet-dim':   '#120D1E',
        // ── Typography ─────────────────────────────────────────────
        'wiz-cream':        '#F2E6D4',  // was #E8DCCA — bright warm white for primary text
        'wiz-gray':         '#DDD9D1',  // was #A8A49C — bright warm gray for labels
        'wiz-muted':        '#CCC8C0',  // was #9E9893 — medium gray for hints & section labels
        'wiz-dim':          '#B4B0A8',  // was #878280 — lighter de-emphasised text
        // ── Signal Colours ─────────────────────────────────────────
        'sig-green':        '#22C55E',
        'sig-green-dim':    '#071A10',
        'sig-red':          '#EF4444',
        'sig-red-dim':      '#1E0909',
        'sig-yellow':       '#F59E0B',
        'sig-yellow-dim':   '#1E1605',
        'sig-blue':         '#60A5FA',
        'sig-blue-dim':     '#08111E',
        'sig-orange':       '#FB923C',
        'sig-orange-dim':   '#1E0E05',
        'sig-purple':       '#A855F7',
        'sig-purple-dim':   '#150820',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', '"Cascadia Code"', 'monospace'],
      },
      fontSize: {
        '2xs': ['11px', '15px'],  // unchanged — tiny detail labels only
        xs:    ['13px', '18px'],  // was 12/17 — tab badges, small chips
        sm:    ['14px', '20px'],  // was 13/19 — field labels, secondary text
        base:  ['15px', '22px'],  // was 14/22 — input values, body copy
        md:    ['16px', '24px'],  // was 15/23 — medium headings
        lg:    ['17px', '26px'],  // was 16/24 — section headings
        xl:    ['19px', '27px'],  // was 18/26 — large headings
        '2xl': ['22px', '30px'],  // unchanged
        '3xl': ['28px', '36px'],  // unchanged
      },
      boxShadow: {
        'gold':     '0 0 20px rgba(201, 168, 76, 0.15), 0 0 40px rgba(201, 168, 76, 0.05)',
        'gold-sm':  '0 0 10px rgba(201, 168, 76, 0.12)',
        'panel':    '0 4px 32px rgba(0, 0, 0, 0.50)',
        'card':     '0 2px 16px rgba(0, 0, 0, 0.40)',
        'inset-top':'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
      },
      backgroundImage: {
        'card-gradient':    'linear-gradient(180deg, #111827 0%, #0D1120 100%)',
        'surface-gradient': 'linear-gradient(180deg, #0D1120 0%, #080B14 100%)',
        'gold-gradient':    'linear-gradient(135deg, #C9A84C 0%, #D4B560 50%, #C9A84C 100%)',
        'sidebar-gradient': 'linear-gradient(180deg, #0D1120 0%, #080B14 100%)',
        'status-running':   'linear-gradient(90deg, rgba(245, 158, 11, 0.08) 0%, transparent 100%)',
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
          '0%, 100%': { boxShadow: '0 0 8px rgba(201, 168, 76, 0.20)' },
          '50%':       { boxShadow: '0 0 24px rgba(201, 168, 76, 0.45)' },
        },
        'pulse-green': {
          '0%, 100%': { boxShadow: '0 0 6px rgba(34, 197, 94, 0.25)' },
          '50%':       { boxShadow: '0 0 16px rgba(34, 197, 94, 0.50)' },
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
