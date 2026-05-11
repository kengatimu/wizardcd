/** @type {import('tailwindcss').Config} */

/*  Helper: reference a CSS custom property as an rgb() colour.
 *  e.g. bg-wiz-surface/60 → background-color: rgb(var(--wiz-surface) / 0.6)
 *  ONE variable change updates ALL Tailwind opacity variants automatically.  */
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
        // ── Backgrounds (hierarchy: bg < surface < raised < panel) ───
        'wiz-bg':             c('--wiz-bg'),       /* #F9F8F6 — warm off-white page  */
        'wiz-surface':        c('--wiz-surface'),  /* #FFFFFF — white card/input bg  */
        'wiz-raised':         c('--wiz-raised'),   /* #F8F6F1 — hover/alt surface    */
        'wiz-panel':          c('--wiz-panel'),    /* #0D2240 — navy (sidebar/dark)  */

        // ── Borders ────────────────────────────────────────────────
        'wiz-border':         c('--wiz-border'),        /* #EAE6DF — stone  */
        'wiz-border-mid':     c('--wiz-border-mid'),    /* #C8C0B4          */
        'wiz-border-strong':  c('--wiz-border-strong'), /* #A09687          */

        // ── Primary accent — Crimson (replaces old electric teal) ──
        'wiz-gold':           c('--wiz-gold'),      /* #8B1A1A — crimson, all accents   */
        'wiz-gold-light':     c('--wiz-gold-light'),/* #7A1515 — crimson hover/darker   */
        'wiz-gold-dim':       c('--wiz-gold-dim'),  /* #FDF3F3 — crimson background tint */

        // ── Crimson-dark (for active items on navy sidebar) ────────
        'wiz-teal':           c('--wiz-teal'),      /* #D44040 — brightened crimson     */
        'wiz-teal-light':     c('--wiz-teal-light'),/* #DC5050                          */
        'wiz-teal-dim':       c('--wiz-teal-dim'),  /* rgba on navy — not for light bg  */

        // ── Typography ─────────────────────────────────────────────
        'wiz-cream':          c('--wiz-cream'),  /* #333333 — primary dark body text  */
        'wiz-gray':           c('--wiz-gray'),   /* #505050 — secondary text          */
        'wiz-muted':          c('--wiz-muted'),  /* #666666 — muted / labels          */
        'wiz-dim':            c('--wiz-dim'),    /* #999999 — very dim / placeholders */

        // ── Violet (PROD env, kept as purple) ──────────────────────
        'wiz-violet':         c('--wiz-violet'),
        'wiz-violet-dim':     c('--wiz-violet-dim'),

        // ── Signal colours ─────────────────────────────────────────
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
        // Inter — all UI body text, labels, nav, inputs
        sans:  ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        // Libre Baskerville — page titles, metric values, section headings
        serif: ['"Libre Baskerville"', 'Georgia', 'serif'],
        // JetBrains Mono — job IDs, code, paths, version strings
        mono:  ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },

      fontSize: {
        // WizardCD type scale — dense professional tool (12.5px body basis)
        '2xs':  ['9px',    { lineHeight: '12px' }],  /* section labels, table headers */
        'xs':   ['11px',   { lineHeight: '15px' }],  /* captions, hints, badge text   */
        'sm':   ['12px',   { lineHeight: '16px' }],  /* small UI text                 */
        'body': ['12.5px', { lineHeight: '1.85' }],  /* body text canonical           */
        'base': ['13px',   { lineHeight: '1.7' }],   /* inputs, table cells           */
        'md':   ['13.5px', { lineHeight: '19px' }],  /* nav items                     */
        'lg':   ['16px',   { lineHeight: '21px' }],  /* section headings (Inter 600)  */
        'xl':   ['20px',   { lineHeight: '24px' }],  /* page titles (Baskerville 700) */
        '2xl':  ['26px',   { lineHeight: '26px' }],  /* metric values (Baskerville)   */
        '3xl':  ['32px',   { lineHeight: '38px' }],  /* large headers                 */
      },

      borderRadius: {
        sm:   '2px',   /* env tags, tiny badges */
        DEFAULT: '3px',/* primary — cards, buttons, inputs */
        md:   '4px',
        lg:   '5px',   /* nav items */
        xl:   '6px',   /* modals, panels */
        '2xl':'10px',  /* logo cards, shell containers */
      },

      boxShadow: {
        // Light, professional — no glows
        'card':       '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'panel':      '0 4px 16px rgba(0,0,0,0.08)',
        'modal':      '0 8px 32px rgba(0,0,0,0.14)',
        'topbar':     '0 1px 3px rgba(0,0,0,0.04)',
        // Crimson focus ring (replaces teal glow)
        'gold-sm':    '0 0 0 2px rgba(139,26,26,0.10)',
        'gold':       '0 0 0 3px rgba(139,26,26,0.12)',
        'input-focus':'0 0 0 3px rgba(13,34,64,0.08)',
        // Legacy — kept for any reference but not visually used
        'card-dark':  '0 2px 16px rgba(0,0,0,0.32)',
        'inset-top':  'inset 0 1px 0 rgba(255,255,255,0.03)',
      },

      backgroundImage: {
        // Subtle card gradient — barely perceptible on light bg
        'card-gradient': 'linear-gradient(180deg, #FFFFFF 0%, #FEFEFE 100%)',
        // Keep others for any page that references them
        'gold-gradient': 'linear-gradient(135deg, #8B1A1A 0%, #A52020 50%, #8B1A1A 100%)',
      },

      keyframes: {
        'fade-in': {
          '0%':   { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-fast': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
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
        'fade-in':      'fade-in 0.25s ease-out',
        'fade-in-fast': 'fade-in-fast 0.15s ease-out',
        shimmer:        'shimmer 1.8s linear infinite',
        blink:          'blink 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
