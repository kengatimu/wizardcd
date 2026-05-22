# WizardCD — Design System & Visual Identity

> **Version:** 2.1 &nbsp;|&nbsp; **Updated:** 2026-05-10
>
> **THE single source of truth** for WizardCD's visual language. This document supersedes:
> - `web/design/WizardCD_Design_System.md` (older spec, deleted in favour of this file)
> - `documents/wizardCD — Brand Guide.pdf` (v1 historical reference, dark-only theme)
> - `documents/WizardCD Color Palette.pdf` (v1 historical reference)
>
> Where this document and any other source disagree, **this document and the code are correct**. The live tokens are in `web/ui/src/styles/globals.css` + `web/ui/tailwind.config.js` — that's the actual implementation; this doc captures it.

---

## Table of Contents

1. [Brand Identity](#1-brand-identity)
2. [Theme Architecture](#2-theme-architecture)
3. [Colour Tokens](#3-colour-tokens)
4. [Typography](#4-typography)
5. [Colour Semantics — what each colour means](#5-colour-semantics)
6. [Component Patterns](#6-component-patterns)
7. [Interaction & Motion](#7-interaction--motion)
8. [Layout & Spacing](#8-layout--spacing)
9. [Critical Do's and Don'ts](#9-critical-dos-and-donts)
10. [Print & Document CSS](#10-print--document-css)
11. [Dark Surface Rules](#11-dark-surface-rules)

---

## 1. Brand Identity

### 1.1 Tagline & Voice

> **"One Config. One Command. Continuous Magic."**

This appears in the global app header (across all pages) and on the New Deployment page header. **Never duplicate it inside page content** — that creates visual stuttering.

Voice principles:
- Functional copy goes in **Inter** (UI tone)
- Editorial / brand copy goes in **Libre Baskerville** (italic for taglines, regular for headlines)
- Page subtitles, when used, must describe **what the page does** in plain English — not poetry, not the brand tagline. The tagline is identity; subtitles are context.

### 1.2 Logo

#### 1.2.1 Logo Files

| File | Purpose |
|------|---------|
| `web/ui/public/wizardCD-logo-light.png` | Light theme app wordmark — current live default |
| `web/ui/public/wizardCD-logo.png` | Dark theme app wordmark — reserved for log-viewer dark scope |
| `web/design/logo/WizardCD_Logo_Light.html` | Light reference — hero, size scale, usage rules |
| `web/design/logo/WizardCD_Logo_Dark.html` | Dark reference — hero, size scale, usage rules |
| `web/design/logo/WizardCD_Logo_Light_Export.html` | Light export canvas — 480 × 112 px, tight crop |
| `web/design/logo/WizardCD_Logo_Dark_Export.html` | Dark export canvas — 480 × 112 px, tight crop |
| `web/design/logo/WizardCD_Logo_Light.png` | Light PNG — 960 × 224 @2× retina (regenerated from HTML) |
| `web/design/logo/WizardCD_Logo_Dark.png` | Dark PNG — 960 × 224 @2× retina (regenerated from HTML) |

The HTML reference files contain the canonical wordmark at multiple sizes plus usage rules. The export HTML files are sized exactly for headless-Chrome PNG generation.

**PNG regeneration command:**
```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BASE="/Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/design/logo"

"$CHROME" --headless=new --screenshot \
  --window-size=480,112 --force-device-scale-factor=2 --hide-scrollbars \
  --screenshot="$BASE/WizardCD_Logo_Light.png" \
  "file://$BASE/WizardCD_Logo_Light_Export.html"

"$CHROME" --headless=new --screenshot \
  --window-size=480,112 --force-device-scale-factor=2 --hide-scrollbars \
  --screenshot="$BASE/WizardCD_Logo_Dark.png" \
  "file://$BASE/WizardCD_Logo_Dark_Export.html"
```

#### 1.2.2 Logo Anatomy

The logo is a wordmark with a single 1px crimson rule directly underneath. No icon, no tagline, no subtitle inside the mark itself.

```
WizardCD
─────────   ← 1px crimson rule, width = wordmark width EXACTLY
```

Three elements, top-to-bottom:
1. **"Wizard"** — Libre Baskerville Bold, navy `#0D2240` (light) / white `#FFFFFF` (dark)
2. **"CD"** — Libre Baskerville Bold, crimson `#8B1A1A` (light) / brightened crimson `#D44040` (dark)
3. **Rule** — `height: 1px`, same crimson as "CD", `width: 100%` of the wordmark (not the container — see the inline-flex technique below)

Nothing else in the mark. The tagline *"One Config. One Command. Continuous Magic."* belongs in context elements (global app header, letterhead body, cover-page subtitle) — never embedded inside the logo block itself. EBB attribution lives in the sidebar version string (`.sb-version`) as a credit line, not in the identity mark.

#### 1.2.3 The inline-flex Rule-Width Technique (CRITICAL)

The rule must be **exactly** as wide as the wordmark text — not the full container. Achieved by making the logo wrapper `display: inline-flex; flex-direction: column`. The wrapper then shrink-wraps to the wordmark's natural width, and `width: 100%` on the rule resolves to that exact width.

**Do not use `display: flex`** — block-level flex fills the container, and the rule extends far past the text. `inline-flex` is the correct choice.

```html
<!-- Light variant -->
<div class="logo-inner">
  <div class="wordmark">Wizard<em>CD</em></div>
  <div class="logo-rule"></div>
</div>

<!-- Dark variant (inside a navy container) -->
<div class="logo-inner logo-inner-dark">
  <div class="wordmark wordmark-dark">Wizard<em>CD</em></div>
  <div class="logo-rule logo-rule-dark"></div>
</div>
```

```css
.logo-inner {
  display: inline-flex;   /* MUST be inline-flex, never flex */
  flex-direction: column;
}
.wordmark {
  font-family: 'Libre Baskerville', Georgia, serif;
  font-weight: 700;
  letter-spacing: 0.01em;
  line-height: 1;
  color: #0D2240;
  white-space: nowrap;
}
.wordmark em { color: #8B1A1A; font-style: normal; }
.logo-rule {
  height: 1px;
  background: #8B1A1A;
  width: 100%;
  margin-top: 7px;   /* adjust per size — see size scale */
}
.logo-inner-dark {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
.wordmark-dark      { color: #FFFFFF; }
.wordmark-dark em   { color: #D44040; }
.logo-rule-dark     { background: #D44040; }
```

#### 1.2.4 Size Scale

| Size | Font-size | Rule margin-top | Used on |
|---|---|---|---|
| `cover` | 72px | 9px | Cover / hero pages |
| `heading` | 64px | 9px | Document headings |
| `mid` | 36px | 6px | Medium headings |
| `back` | 38px | 5px | Sidebar back cover |
| `sidebar` | 20px | 4px | Sidebar navigation |
| `header` | 16px | 3px | Inner page headers |
| `nav` | 14px | 3px | Top navigation bar |
| `badge` | 11px | — | Compact pill (no rule below 12px; no colour split — `em` inherits parent colour) |

#### 1.2.5 SVG Embed-Ready Versions

Web fonts must be loaded for correct rendering. The `x2` value on the rule `<line>` must match the rendered wordmark width at the given font-size — measure in a browser. For print or static use, convert text to paths in a vector editor.

```svg
<!-- Light variant -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 72" width="320" height="72">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@700&display=swap');
      .wiz { font-family: 'Libre Baskerville', Georgia, serif; font-weight: 700; font-size: 48px; }
    </style>
  </defs>
  <text class="wiz" x="0" y="52" fill="#0D2240">Wizard</text>
  <text class="wiz" x="202" y="52" fill="#8B1A1A">CD</text>
  <line x1="0" y1="60" x2="320" y2="60" stroke="#8B1A1A" stroke-width="1"/>
</svg>

<!-- Dark variant -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 72" width="320" height="72">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@700&display=swap');
      .wiz { font-family: 'Libre Baskerville', Georgia, serif; font-weight: 700; font-size: 48px; }
    </style>
  </defs>
  <text class="wiz" x="0" y="52" fill="#FFFFFF">Wizard</text>
  <text class="wiz" x="202" y="52" fill="#D44040">CD</text>
  <line x1="0" y1="60" x2="320" y2="60" stroke="#D44040" stroke-width="1"/>
</svg>
```

#### 1.2.6 Logo Rules — What NEVER to Do

| Rule | Reason |
|------|--------|
| Never omit the crimson rule | The rule is part of the mark — wordmark alone is incomplete |
| Never let the rule extend past the wordmark | Use `display: inline-flex; flex-direction: column` on the wrapper |
| Never place the rule above the wordmark | It belongs directly under the text baseline |
| Never use a rule thicker than 1px | Anything thicker becomes a design element, not a finishing mark |
| Never embed "DEPLOYMENT PLATFORM" / tagline / subtitle inside the logo | Those belong in context elements (app header, letterhead, cover subtitle) |
| Never put "by EBB Systems" inside the logo mark | Attribution belongs in the sidebar version string or footer |
| Never change the typeface | Must be Libre Baskerville Bold — no substitutions |
| Never use on mid-tone backgrounds | Use only white/cream (light variant) or navy (dark variant) |
| Never use negative letter-spacing on the wordmark | The correct tracking is `letter-spacing: 0.01em` — never negative |
| Never use `#8B1A1A` for "CD" or the rule on navy | Fails contrast at 1.6:1 — use `#D44040` on all dark surfaces |
| Never use an encircle, border, or badge treatment | Tested in v7/v8 exploration; wordmark + rule is the final, definitive direction |
| Never add icons next to the wordmark | The mark stands alone |

### 1.3 Brand Crimson — Strict Discipline

The single most important rule in this design system: **crimson is reserved**.

Crimson (`wiz-gold` token = `#8B1A1A` on light bg, `#D44040` on dark surfaces like the navy sidebar) appears in only **four** sanctioned roles:

1. **Logo & wordmark** — the `CD` mark, the 1px rule under the wordmark, the right-edge sidebar brand line
2. **Focal action** — primary buttons (*Test Connection*, *Deploy*), the headline gradient sweep
3. **"You are here"** — the active step's pill in the wizard, the active sidebar nav item's left stripe + icon tint
4. **True alert states** — failed bars in the activity chart, "Needs Attention" panel for recent failures, "Critical" health tier when the data warrants it

**Decorative crimson is forbidden.** No crimson hover floods, no crimson section-divider rainbows, no crimson decorative glows. Every place we put crimson should answer at least one of the four questions: *what is this product? where am I? what am I about to do? is something wrong?* If it's none of those, use white tints, sig-blue, or a neutral.

This is the lesson from the sidebar overhaul — when crimson is everywhere, the eye can't separate brand from alert, and the whole UI reads as "on fire". When crimson is rare, every appearance carries weight.

---

## 2. Theme Architecture

### 2.1 The Token System

All colours are defined as **CSS custom properties** as space-separated RGB channels. The Tailwind config wraps every colour in a `c('--var-name')` helper that produces:

```js
function c(v) {
  return ({ opacityValue }) =>
    opacityValue !== undefined
      ? `rgb(var(${v}) / ${opacityValue})`
      : `rgb(var(${v}))`
}
```

**Why this matters:** `bg-wiz-bg/60` resolves to `rgb(var(--wiz-bg) / 0.6)` — a *single* variable powers all 60+ opacity variants of every colour. Theme changes are one line per token, not 60+ class overrides.

### 2.2 Theme Scopes

| Scope | Where it applies | Theme |
|---|---|---|
| `:root` (default) | Whole app | **Warm light** — sole live theme |
| `.light` (alias) | Whole app | Same as `:root` (kept for explicit theme markers) |
| `.log-dark` | Wrapped around `LogViewer` only | **Dark terminal** — for log readability |

The dark scope redefines every token within the `.log-dark` element, so all Tailwind classes inside the LogViewer resolve to dark-terminal values automatically — zero arbitrary values needed.

### 2.3 Migration Key

The `ThemeContext` uses a versioned migration key (`wiz-theme-v3-migrated`) so existing browsers with stale dark preferences are reset to light on first load after a theme version bump. Bump the key when introducing breaking theme changes.

---

## 3. Colour Tokens

### 3.1 Light Theme (sole live theme)

#### Backgrounds

| Token | Value | Hex | Use |
|---|---|---|---|
| `wiz-bg` | `249 248 246` | `#F9F8F6` | Warm off-white page background |
| `wiz-surface` | `255 255 255` | `#FFFFFF` | White card / input fill |
| `wiz-raised` | `248 246 241` | `#F8F6F1` | Hover / raised surface |
| `wiz-panel` | `13 34 64` | `#0D2240` | Navy sidebar / dark panels |

#### Borders

| Token | Value | Hex | Use |
|---|---|---|---|
| `wiz-border` | `234 230 223` | `#EAE6DF` | Stone — primary card border |
| `wiz-border-mid` | `200 192 180` | `#C8C0B4` | Mid-emphasis dividers |
| `wiz-border-strong` | `160 150 135` | `#A09687` | Strong separator |

#### Brand Accents

| Token | Value | Hex | Use |
|---|---|---|---|
| `wiz-gold` | `139 26 26` | `#8B1A1A` | **Brand crimson** on light bg (logo, focal action, brand identity) |
| `wiz-gold-light` | `122 21 21` | `#7A1515` | Hover/darker crimson |
| `wiz-gold-dim` | `253 243 243` | `#FDF3F3` | Crimson tint background |
| `wiz-teal` | `212 64 64` | `#D44040` | Brightened crimson for navy surfaces (sidebar) |
| `wiz-teal-light` | `220 80 80` | `#DC5050` | Hover variant on navy |
| `wiz-teal-dim` | `44 12 12` | dark navy tint | Reserved for navy bg only |

#### Typography Tones (tuned for WCAG AA on warm cream bg)

| Token | Value | Hex | Contrast vs `wiz-bg` | Use |
|---|---|---|---|---|
| `wiz-cream` | `30 30 50` | `#1E1E32` | ~13:1 | **Primary body text** — navy-tinted near-black |
| `wiz-gray` | `65 65 85` | `#414155` | ~9:1 | Secondary text |
| `wiz-muted` | `90 90 108` | `#5A5A6C` | ~5.8:1 | Muted labels & hints |
| `wiz-dim` | `128 128 145` | `#808091` | ~4.5:1 (passes AA) | Placeholders / quietest dim |

> ⚠️ **Critical:** `wiz-dim` is the floor — going dimmer fails WCAG AA. The previous values (`#999999`) failed at 2.8:1 and made hints invisible. Do not lower these tones.

#### Signal Colours (calibrated for white bg)

| Token | Hex | Use |
|---|---|---|
| `sig-green` | `#16A34A` | Success / completion |
| `sig-green-dim` | `#F0FDF4` | Pale green tint background |
| `sig-red` | `#DC2626` | Error / failure |
| `sig-red-dim` | `#FEF2F2` | Pale red tint background |
| `sig-yellow` | `#D97706` | Warning / incomplete |
| `sig-yellow-dim` | `#FFFBEB` | Pale yellow tint background |
| `sig-blue` | `#2563EB` | Informational / in-progress / SSH context |
| `sig-blue-dim` | `#EFF6FF` | Pale blue tint background |
| `sig-orange` | `#EA580C` | Reserved for warm accents |
| `sig-orange-dim` | `#FFF7ED` | |
| `sig-purple` | `#7C3AED` | **PROD environment** |
| `sig-purple-dim` | `#F5F3FF` | |

### 3.2 Dark Log Terminal (`.log-dark` scope)

| Token | Hex | Notes |
|---|---|---|
| `wiz-bg` | `#0D1117` | Terminal body |
| `wiz-surface` | `#161B22` | Toolbar |
| `wiz-raised` | `#21262D` | Hover |
| `wiz-cream` | `#ECF0F6` | Primary log text |
| `wiz-muted` | `#A0A8B4` | Muted (was `#8B949E` — too dim) |
| `wiz-dim` | `#828A96` | Placeholder (was `#6E7681` — failed AA on dark) |
| `sig-green` | `#3FB950` | Vivid green on dark |
| `sig-red` | `#FF7B72` | Soft red on dark |
| `sig-yellow` | `#E3B341` | Amber |
| `sig-blue` | `#79C0FF` | |

---

## 4. Typography

### 4.1 Font Stack

| Family | Loaded weights | Role |
|---|---|---|
| **Inter** | 300, 400, 500, 600, 700 | UI / functional text — body, labels, hints, buttons |
| **Libre Baskerville** | 400, 400 italic, 700 | Editorial / brand — logo, headlines, taglines, pull quotes |
| **JetBrains Mono** *(system fallback `font-mono`)* | — | Code, mono labels, metric digits, IPs, paths |

Loaded via Google Fonts in `index.html`:
```html
<link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

### 4.2 Body Type

```css
body {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  font-size: 13.25px;          /* bumped from 12.5px for legibility (+6%) */
  line-height: 1.6;            /* tightened from 1.85 for confident UI feel */
  color: rgb(var(--wiz-cream));
  font-feature-settings: 'ss02', 'cv11', 'tnum', 'calt';
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  font-synthesis: none;
}
```

#### Inter feature settings explained

| Feature | Effect |
|---|---|
| `ss02` | Disambiguates `I` / `l` / `1` and similar shapes |
| `cv11` | Single-storey `g` (cleaner at small sizes) |
| `tnum` | Tabular numerals — digits align in tables and metrics |
| `calt` | Contextual alternates |

#### Why these specifics

- `12.5px` was inherited from the v1 brand spec but reads as fine print on modern viewports — `13.25px` is a 6% bump, large enough to feel substantively easier on the eye, small enough that no layout reflows
- `1.85` line-height reads as *editorial body*; `1.6` reads as a *modern app*
- `font-synthesis: none` prevents fake bold/italic when a real weight isn't loaded — keeps strokes crisp
- Token darkening: `wiz-cream` moved from neutral `#333333` to navy-tinted `#1E1E32` so body text feels related to the brand wordmark instead of generic grey

### 4.3 Headlines

| Element | Specs |
|---|---|
| **Page H1** (`New Deployment`) | Libre Baskerville bold, 24px, animated crimson gradient sweep across the headline (6s linear infinite) |
| **Section header (uppercase)** | Inter 600, 9px, uppercase, `letter-spacing: 0.18-0.28em`, paired with a 6px coloured dot |
| **Sub-section labels** | Inter 700, 9.5px, uppercase, `letter-spacing: 0.16em` |

### 4.4 Mono Conventions

- Mono used for: paths, IPs, command snippets, port numbers, JAR filenames, byte counts
- Mono labels (e.g. `user @ host : port` sublabel under SSH Endpoint) use 10px `tracking-wide`
- Numerals in tables use `tabular-nums` so columns align

### 4.5 Uppercase Label Pattern

```jsx
<span className="text-[8.5-10px] font-bold uppercase tracking-[0.16-0.28em] text-{accent}">
  Step 1 of 4
</span>
```

The ratio `font-size : letter-spacing` is the key — tight tracking on uppercase reads as cramped; the 0.16-0.28em range gives uppercase its trademark "spaced label" elegance.

---

## 5. Colour Semantics

The single most important table in this document. **Every colour decision should reference this table.**

| Colour | Role | Where it appears |
|---|---|---|
| **Crimson** (`wiz-gold` / `wiz-teal`) | Brand identity, focal action, "you are here", true alerts | Logo, headline sweep, primary buttons (Test Connection, Deploy), active wizard step pill, active sidebar nav left-stripe + icon tint, sidebar right-edge brand line, failed bars in activity chart, *Needs Attention* panel |
| **`sig-green`** | Success / completion | Successful deploys, *Ready to deploy* state, *Healthy* health tier, Continue/Confirm buttons |
| **`sig-blue`** | Informational / in-progress / SSH context | Step nav chip when in progress, *N/4 complete* pill at partial, draft restored banner, SSH/connection panels, "Detect Java" button, tooltip-style info |
| **`sig-yellow`** | Warning / incomplete | *Stable* health tier (70-90%), running deploy live pulse, missing/required fields |
| **`sig-red`** | Error / failure | Failed lifecycle status, *Critical* health tier when data warrants, validation errors |
| **`sig-purple`** | **PROD environment** | PROD env badges, PROD warning banners, env-tinted accents on PROD jobs |

### Position-based panel colour rotation

When a step has multiple inner panels stacked vertically, panel left-borders and headers rotate through this sequence:

```
green → blue → crimson → restart green → blue → crimson …
```

Example: Step 1 has 4 inner panels — *SSH Target* (green) → *Firewall* (blue) → *SSH Keys* (crimson) → *Verify Connection* (green again, restarting the cycle).

This rotation is purely positional, not semantic. It gives the eye something to track as it scrolls down a step, and prevents any single colour from dominating a long page.

---

## 6. Component Patterns

### 6.1 Inner Panel

The fundamental container used throughout the wizard.

```jsx
<div className="rounded border border-wiz-border border-l-2 border-l-{color}/50 bg-wiz-surface overflow-hidden">
  {/* Header row */}
  <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-wiz-border/60 bg-{color}-dim">
    <span className="w-1.5 h-1.5 rounded-full bg-{color}/70 flex-shrink-0" />
    <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-{color}">
      Section Title
    </h3>
  </div>
  {/* Body */}
  <div className="divide-y divide-wiz-border/30">
    {/* RowField components */}
  </div>
</div>
```

Key dimensions:
- Left border: `border-l-2` (2px) tinted with section colour at `/50` opacity
- Header row: `px-5 py-3.5`, divider hairline beneath at `wiz-border/60`
- Body padding: `p-5` if content uses gap; `divide-y` if content is a series of rows

### 6.2 Form Row (`RowField`)

Two-column layout: label column (`w-36`) + input column (`flex-1`). Children render inside the right column. Hint or error renders below the children.

```jsx
<RowField
  label="SSH Endpoint"
  sublabel={<span className="font-mono text-[10px] tracking-wide">user @ host : port</span>}
  name="sshEndpoint"
  required
  error={errors.sshUser || errors.sshHost || errors.sshPort}
  hint="Linux user, public IP/hostname and SSH port. The runner authenticates with the per-environment SSH key."
>
  {/* composed inputs */}
</RowField>
```

### 6.3 Composed-string Input (SSH endpoint pattern)

Three inputs visually fused into one connection-string control via `border-l-none` / `border-r-none` neighbour sharing + 1px focus z-stacking. Reads as `user@host:port` because that's the mental model every SSH user already has.

```jsx
<div className="flex items-stretch w-full">
  <input className="wiz-input flex-1 min-w-[80px] rounded-r-none border-r-0 relative z-10 focus:z-20" />
  <span className="inline-flex items-center px-2 border-y border-wiz-border bg-wiz-bg/50 text-wiz-muted font-mono text-sm select-none flex-shrink-0">@</span>
  <input className="wiz-input flex-[2] min-w-[140px] rounded-none border-x-0 relative z-10 focus:z-20" />
  <span className="inline-flex items-center px-2 border-y border-wiz-border bg-wiz-bg/50 text-wiz-muted font-mono text-sm select-none flex-shrink-0">:</span>
  <input className="wiz-input w-[72px] flex-shrink-0 rounded-l-none border-l-0 text-center relative z-10 focus:z-20" />
</div>
```

Width allocation reflects how often each part changes: host gets `flex-[2]` (most), user gets `flex-1`, port stays fixed at `72px` (almost always 2 digits).

### 6.4 Status Chip (filled with depth)

The premier "informational chip" pattern — used for the step-nav `STEP N OF 4 — hint` chip and the completion ready-state.

**Three layers working together:**

```jsx
<div
  className="inline-flex items-stretch rounded-md border min-w-0 transition-all duration-300 overflow-hidden border-{color}/35"
  style={{
    background: 'linear-gradient(90deg, rgba({rgb},0.20) 0%, rgba({rgb},0.12) 55%, rgba({rgb},0.06) 100%)',
    boxShadow: '0 1px 3px rgba({rgb},0.14), 0 0 0 1px rgba({rgb},0.04), inset 0 1px 0 rgba(255,255,255,0.55)',
  }}
>
  {/* Label section + hairline divider + hint section */}
</div>
```

Layer roles:
1. **Left-weighted gradient** (20% → 12% → 6%): visible saturation that flows from label end to hint end, reinforcing reading order
2. **Hue-matched drop shadow + border halo**: anchors the chip to the surface; tinted with the same hue so the lift looks intentional
3. **1px white inner highlight** at top: flips the chip from "flat sticker" to "physical token sitting on the page"

Why a flat fill at any single opacity fails: **8% disappears, 20% feels heavy, the gradient gives both presence and air.**

### 6.5 Sidebar Nav Item (active state recipe)

```jsx
<NavLink className={clsx(
  'group relative flex items-center gap-2.5 py-2.5 pr-3 rounded-md font-medium text-[13.5px] overflow-hidden',
  'transition-all duration-250 ease-out',
  'border bg-white/[0.04]',
  isActive
    ? 'pl-[9px] border-white/[0.12] border-l-[3px] border-l-[#D44040] text-white bg-white/[0.10]'
    : 'pl-3 border-white/[0.10] border-l-[3px] border-l-transparent text-white/70 hover:text-white hover:bg-white/[0.07] hover:border-white/[0.18] hover:-translate-y-[1px] hover:scale-[1.02]',
)}>
```

**The active item earns exactly one crimson signature** — the 3px left stripe — plus a small crimson icon tint and a 4px static crimson dot at the right edge. Everything else is white tint. No crimson background flood, no pulsing crimson dot (pulse reads as "warning" rather than "you are here"), no crimson glow shadow.

### 6.6 Health Tile (data-driven tier)

Five tiers based on success rate, with deliberately damped alert intensities so the tile **hints** at problems rather than screaming:

| Tier | Trigger | Visual |
|---|---|---|
| **No data** | `total === 0` | Neutral white tint, em-dash placeholder, "no deploys yet" caption — never red on an empty stage |
| **Healthy** | `successRate ≥ 90%` | `sig-green/[0.10]` bg + `sig-green/30` border |
| **Stable** | `successRate ≥ 70%` | `sig-yellow/[0.10]` bg + `sig-yellow/30` border |
| **Degraded** | `successRate ≥ 50%` | `sig-red/[0.08]` bg + `sig-red/30` border |
| **Critical** | `successRate < 50%` | `sig-red/[0.12]` bg + `sig-red/40` border |

Critical's bg opacity is **half** the original (was `0.22`). A real critical state still draws the eye because nothing else on the sidebar is now competing in the red lane.

---

## 7. Interaction & Motion

### 7.1 Hover Lift

Standard "tactile" hover for clickable cards and primary buttons:

```css
hover:-translate-y-[1-2px] hover:scale-[1.02]
transition-all duration-200 ease-out
```

The combination of `-translate-y` and `scale` is the difference between "pressed button" and "card lifting off the page" — modal cards usually get `-translate-y-[2px]`, inline buttons get `-translate-y-[1px]`.

### 7.2 State Transitions

Status colour changes use `transition-all duration-300`:

```jsx
className="transition-colors duration-300"
```

300ms is long enough that the eye perceives the transition as deliberate, short enough that it doesn't feel sluggish.

### 7.3 Pulsing Dot — Live States Only

```jsx
<span className="relative flex w-2 h-2">
  <span className="absolute inline-flex h-full w-full rounded-full bg-{color} opacity-50 animate-ping" />
  <span className="relative inline-flex rounded-full h-2 w-2 bg-{color}" />
</span>
```

**Use only for live/active states** — running deploys, in-progress operations. Never use a pulsing dot for "you are here" navigation, because pulse reads as "warning needs attention" rather than "here".

### 7.4 Fade-in on Step Transition

The step-nav chip's hint span uses `key={`step-hint-${step}`}` so React remounts it on every step change. Combined with the existing `animate-fade-in` keyframe (0.25s ease-out), the hint narrates the user's progress instead of just labelling it.

```jsx
<span
  key={`step-hint-${step}-${isAllDone ? 'done' : 'active'}`}
  className="flex items-center min-w-0 px-2.5 py-1 animate-fade-in"
>
  {STEPS[step - 1]?.subtitle}
</span>
```

### 7.5 Animated Title Sweep

Page H1 carries a 6s linear gradient sweep that emphasises the brand crimson without competing with surrounding chrome:

```css
backgroundImage: 'linear-gradient(90deg, #1A1A2E 0%, #1A1A2E 30%, #8B1A1A 50%, #1A1A2E 70%, #1A1A2E 100%)',
backgroundSize: '200% 100%',
backgroundClip: 'text',
WebkitBackgroundClip: 'text',
color: 'transparent',
animation: 'deploy-title-sweep 6s linear infinite',
```

### 7.6 Shimmer Sweep (Active Nav)

A diagonal white highlight (`bg-gradient-to-r from-transparent via-white/[0.08] to-transparent`) that slides across the active sidebar nav item every 4s. Subtle enough to feel like depth-of-life on the active item, not a moving ad.

---

## 8. Layout & Spacing

### 8.1 Spacing Scale (4px base unit)

All spacing derives from a 4px base unit. Stick to this scale — arbitrary spacing breaks rhythm.

| Token | Value | Tailwind | Primary use |
|-------|-------|----------|-------------|
| `xs` | 4px | `p-1` / `gap-1` | Icon padding, inline gaps between tight elements |
| `sm` | 8px | `p-2` / `gap-2` | Between related items, badge padding |
| `md` | 12px | `p-3` / `gap-3` | Card internal gaps, button vertical padding |
| `lg` | 16px | `p-4` / `gap-4` | Section gaps, card padding, row height |
| `xl` | 24px | `p-6` / `gap-6` | Page content padding, major card-row gaps |
| `2xl` | 32px | `p-8` / `gap-8` | Between major sections on a page |
| `3xl` | 48px | `p-12` / `gap-12` | Page top/bottom margins |
| `4xl` | 64px | `p-16` / `gap-16` | Document page side margins (print only) |

### 8.2 Layout Measurements

| Element | Value | Notes |
|---------|-------|-------|
| Sidebar width | 240px | Fixed, never flex-shrink (was 210px in v1) |
| Topbar height | 52px | Fixed, never grows |
| Card border-radius | 3-4px | The "precise" radius — never larger on UI cards |
| Panel border-radius | 6px | Modals, detail panels |
| Container/shell border-radius | 10px | App shell, logo cards, large containers |
| Page content padding | 24px | Left/right/top inside content area |
| Document page side margin | 64px | Print documents only |
| Metric card padding | 14px / 16px | Vertical / horizontal |
| Table cell padding | 10px / 14px | Vertical / horizontal |
| Table header padding | 8px / 14px | Vertical / horizontal |
| Nav item padding | 10px / 12px | Vertical / horizontal |
| Input padding (compact) | 5px / 10px | Vertical / horizontal |
| Input padding (standard) | 6-8px / 12px | Vertical / horizontal |
| MissionControl sidebar width | 280px | Fixed |
| MissionControl sticky offset | `top: 200` | Clears the step-nav above |

### 8.3 Card Hierarchy

```
wiz-bg (page) < wiz-surface (cards) < wiz-raised (hover)
```

### 8.4 Standard Card

```jsx
<div className="wiz-card p-5">
  {/* content */}
</div>
```

`wiz-card` (defined in globals.css component layer) = `rounded-xl bg-wiz-surface border border-wiz-border` plus a subtle inset highlight shadow.

### 8.5 Sidebar Zones

Fixed `w-[240px]`. Two zones:
- **Top zone** (things you DO): logo → Navigation → System
- **Bottom zone** (things you SEE): Analytics (anchored to viewport bottom via `flex-1` spacer)

The bottom zone is recessed via inset shadow + gradient bg so it reads as "data display" separate from the action zone.

### 8.6 Wizard Step Navigation

Sticky at top of scroll area (`sticky top-0 z-50`), wrapped in a card with crimson left border (`border-l-[3px] border-l-wiz-gold`). Contains:
- Status row: left = step+hint chip, right = N/4 complete pill
- Progress bar: thick gradient with shimmer + floating chip (hidden at 0% and 100%)
- Step circles + connectors

### 8.7 MissionControl Sidebar

Right-side contextual sidebar in the wizard. Sticky-positioned with `top: 200` to clear the step-navigation panel above. `max-h: calc(100vh - 220px)` with overflow.

Width fixed at 280px. Two sections:
- **Deploy Summary** (always visible) — green accent — checklist of filled fields with status indicators
- **Context block** (step-specific) — blue accent — adapts to current step content (Connection diagram for step 1, JAR analysis for step 2, JVM preview for step 3, Pre-flight for step 4)

---

## 9. Critical Do's and Don'ts

### ✅ DO

- **Reserve crimson** for brand identity, focal action, "you are here", and true alerts
- **Use semantic colour by data state**, not by aesthetic preference (an empty state is *No data*, not *Critical*)
- **Tint shadows with the matching hue** for any coloured component — generic grey shadows kill colour identity
- **Use a 1px white inner highlight** at the top of any "filled" component for physical depth
- **Keep WCAG AA minimum contrast** — `wiz-dim` (`#808091`) is the floor
- **Pair font-feature-settings with body** — `ss02 cv11 tnum calt` is mandatory for crisp Inter rendering
- **Match dark and light theme by token redefinition**, not by class overrides
- **Animate state changes** with `transition-colors duration-300` — feels deliberate
- **Reset uppercase labels with letter-spacing 0.16-0.28em** — without it, uppercase reads as cramped

### ❌ DON'T

- **Don't use crimson for hover floods** or decorative section dividers — there are now three sections in the sidebar; three crimson rainbows reads as three alarms
- **Don't paint progress chips with `/8` opacity fills** — at 8% the chip is invisible against light bg; gradient 20% → 6% is the recipe
- **Don't show 0% as a progress value** when total is 0 — show *No data yet* with em-dash placeholder
- **Don't pulse "you are here" dots** — pulse reads as warning; for navigation, use a static dot
- **Don't reproduce the brand tagline inside page content** when it's in the global header
- **Don't lower contrast tones below `wiz-dim`** — anything dimmer fails AA on the cream bg
- **Don't use `font-size: 12.5px`** — kept as historical brand spec but reads as fine print; current body is 13.25px
- **Don't use literal grey for primary text** (`#333333`) — use `wiz-cream` (`#1E1E32`) which carries a faint navy tint and reads as branded near-black
- **Don't put `font-synthesis` to default** — turn it OFF to prevent fake bold/italic muddying strokes
- **Don't extend the right-edge sidebar brand line opacity above `0.16`** — at higher opacities it reads as a red border, not a brand signature

---

## 10. Print & Document CSS

For letterheads, profiles, brochures and any HTML rendered to PDF via headless Chrome.

### 10.1 Print Base

```css
@media print {
  @page {
    size: A4 portrait;
    margin: 0;
  }
  body { background: none; }

  .page {
    margin: 0;
    height: 1122px;          /* A4 at 96 dpi */
    page-break-after: always;
    overflow: hidden;        /* Prevents content bleed creating blank pages */
  }
  .page:last-child { page-break-after: avoid; }
}

/* A4 dimensions for screen preview */
.page {
  width: 794px;              /* A4 width at 96 dpi */
  height: 1122px;
  background: #FFFFFF;
  position: relative;
  overflow: hidden;
}
```

### 10.2 Print Dimensions Reference

| Measurement | Value | Notes |
|---|---|---|
| A4 width | 794px | At 96 dpi |
| A4 height | 1122px | At 96 dpi |
| Side margin | 64px | Applied to body content |
| Header height | ~90px | Varies by design |
| Footer height | ~45px | Varies by design |
| **Usable height** | **~987px** | 1122 − header − footer |
| Usable width | 666px | 794 − (64px × 2) margins |

### 10.3 Print Typography

Print uses the brand typographic system: Libre Baskerville for headings, Inter for body.

```css
.page-body {
  font-family: 'Inter', sans-serif;
  font-size: 12.5px;          /* Print stays at 12.5px — preserves brand spec on paper */
  color: #333333;
  line-height: 1.85;
}
.print-section-heading {
  font-family: 'Libre Baskerville', Georgia, serif;
  font-weight: 700;
  font-size: 14px;
  color: #0D2240;
  letter-spacing: -0.01em;
  margin-bottom: 6px;
}
.print-label {
  font-family: 'Inter', sans-serif;
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #8B1A1A;
}
.print-rule          { border: none; border-top: 1px solid #EAE6DF; margin: 12px 0; }
.print-rule-crimson  { border-top-color: #8B1A1A; border-top-width: 2px; }
```

> 🔑 **Print body stays at 12.5px / 1.85** — the UI body bumped to 13.25px / 1.6 for screen legibility, but printed documents keep the original brand spec because paper-reading dynamics differ from screen.

### 10.4 PDF Generation Command

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless=new --no-pdf-header-footer \
  --print-to-pdf="output.pdf" \
  "file://path/to/source.html"
```

---

## 11. Dark Surface Rules

When any element renders on the navy `#0D2240` background (sidebar, log viewer, dark modals), the following rules apply unconditionally.

### 11.1 Font Smoothing

```css
.dark-surface,
.sb,                 /* sidebar */
.sb *,
.modal-header-dark,
.cover-page {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

Without antialiased smoothing, subpixel rendering on dark backgrounds makes text appear bold and chunky. Antialiased matches the visual weight of the same text on a light background.

### 11.2 Colour Substitution on Navy

| Role | Light bg value | Dark (navy) bg value | Reason |
|------|---------------|---------------------|--------|
| "CD" in logo | `#8B1A1A` | **`#D44040`** | `#8B1A1A` on navy = 1.6:1 — invisible |
| Active nav left stripe | `#8B1A1A` | **`#D44040`** | Same reason |
| Active nav bg tint | N/A | `rgba(212,68,68,0.18)` | Tinted from `#D44040` (sidebar token: `wiz-teal`) |
| Logo rule | `#8B1A1A` | **`#D44040`** | Consistency |
| Primary text | `#1E1E32` | `#FFFFFF` / `rgba(255,255,255,0.95)` | Full contrast on dark |
| Secondary text | `#414155` | `rgba(255,255,255,0.65-0.75)` | Readable, not overwhelming |
| Muted text | `#5A5A6C` | `rgba(255,255,255,0.45-0.55)` | De-emphasised |
| Dim text | `#808091` | `rgba(255,255,255,0.25-0.35)` | Quietest tier |
| Borders | `#EAE6DF` | `rgba(255,255,255,0.08-0.12)` | Subtle on dark |

### 11.3 Token Mapping for Dark Surfaces

The `.log-dark` scope (see §3.2) and the sidebar's navy bg both follow these substitutions. New dark surfaces should:
- Use the `wiz-teal` token (`#D44040`) instead of `wiz-gold` (`#8B1A1A`) for brand crimson
- Apply both `-webkit-font-smoothing` and `-moz-osx-font-smoothing` properties
- Use white-tinted opacity values for text hierarchy, never the light-theme RGB tones

### 11.4 The Crimson Contrast Trap

This is the most common bug when implementing dark surfaces:

```css
/* ❌ WRONG — invisible on navy */
.sidebar-active-stripe { background: #8B1A1A; }

/* ✅ CORRECT */
.sidebar-active-stripe { background: #D44040; }
```

The visual reason: `#8B1A1A` has too little luminance distance from `#0D2240` — both register as "dark warm hue" to the eye. `#D44040` keeps the same hue family but with high enough luminance that it pops.

---

## Appendix A — File Locations

| What | Where |
|---|---|
| **Live colour tokens** | `web/ui/src/styles/globals.css` (`:root` and `.log-dark` blocks) |
| **Tailwind colour mappings** | `web/ui/tailwind.config.js` |
| **Body type rules** | `web/ui/src/styles/globals.css` (`body` rule) |
| **Component layer (`wiz-input`, `wiz-select`, `wiz-card`)** | `web/ui/src/styles/globals.css` (`@layer components`) |
| **Animations / keyframes** | `web/ui/src/styles/globals.css` (`@keyframes` blocks) |
| **Theme migration key** | `web/ui/src/context/ThemeContext.tsx` |
| **Logo assets** | `web/ui/public/wizardCD-logo-light.png`, `web/ui/public/wizardCD-logo.png` |

## Appendix B — Historical Notes & Version Log

| Version | Date | Highlights |
|---|---|---|
| **v1** (dark-only theme) | pre-2026-03-25 | Different palette tuned for dark backgrounds. Reference PDFs (`documents/wizardCD — Brand Guide.pdf`, `documents/WizardCD Color Palette.pdf`) are historical artefacts from this era. |
| **v2** light theme overhaul | 2026-03-25 to 2026-04-23 | Switched all colours to CSS custom properties so opacity variants resolve through tokens. Introduced warm cream page bg (`#F9F8F6`). Reserved crimson strictly for brand/action. DEV environment added (fourth env alongside SIT/UAT/PROD, auto-generated `wizardcd_dev_ed25519` SSH key). |
| **v2.1** typography & sidebar recalibration | 2026-04-24 to 2026-05-10 | Body type bumped (`12.5 → 13.25px`), line-height tightened (`1.85 → 1.6`), Inter feature settings (`ss02 cv11 tnum calt`) enabled, muted/dim tones darkened to pass WCAG AA. Sidebar crimson restricted to brand/action/"you are here"/alerts. Step-nav chip "depth recipe" formalised (gradient + hue-tinted shadow + 1px inner highlight). SSH endpoint reflowed to composed `user@host:port` input. Health tile gained *No data* tier; alert tiers damped. |
| **v2.2** documentation unification | 2026-05-10 | This document became the single source of truth. The older `web/design/WizardCD_Design_System.md` spec was deleted; valuable content (logo implementation, size scale, SVG embeds, spacing scale, print CSS, dark surface rules) merged into this file. |

### Sources superseded

- ❌ `web/design/WizardCD_Design_System.md` — **deleted 2026-05-10**, content merged here
- 📁 `documents/wizardCD — Brand Guide.pdf` — historical reference, retained as v1 artefact
- 📁 `documents/WizardCD Color Palette.pdf` — historical reference, retained as v1 artefact

When introducing breaking visual changes:
1. Update the code first (`globals.css` + `tailwind.config.js` or component files)
2. Update this document to reflect the new state
3. Bump version (v2.x for additions, v3 for breaking restructure)
4. Bump the theme migration key in `ThemeContext.tsx` if user-visible
5. Add a session entry to `CLAUDE.md` via `/update-memory`

---

*This document is the canonical single source of truth for WizardCD's visual identity. Any change to colours, typography, components, motion or spacing must be reflected here — the code is the implementation, this doc is the spec.*
