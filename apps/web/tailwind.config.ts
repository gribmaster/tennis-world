import type { Config } from 'tailwindcss';

// Design tokens ported from `files/Claude_Design_Prompt_Tennis_Mobile.md` §Design
// Tokens and the HTML prototypes (`files/*.html`). Phase 1 Feature 3 establishes the
// shared visual foundation; tokens live directly in apps/web — there is no
// packages/ui (Decision #6). Reusable style primitives (.btn/.pill/.meta-chip and
// the type scale) live in `src/app/globals.css` under @layer components.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    // Breakpoints match the prototypes' tailwind.config so the mobile-first
    // (sm 480 / md 768) behavior is identical to home.html / map.html.
    screens: {
      sm: '480px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        ink: '#0F0F0F', // primary text, headlines
        graphite: '#2A2A2A', // secondary text
        stone: '#6B6B6B', // tertiary text, icons
        mist: '#B8B8B6', // dividers, disabled
        bone: '#F5F2EC', // primary background — warm off-white, NOT pure white
        ivory: '#FAF8F3', // card backgrounds
        clay: '#B95C3A', // accent — clay-court terracotta, used SPARINGLY
        moss: '#4A5D3F', // secondary accent — "open" pin states
        gold: '#B89968', // premium accent — paywall / lifetime badge only
        paper: '#FFFFFF', // pure white reserved for media overlays
        // Hairline divider over the bone background (from the prototypes).
        hairline: '#E0DCCC',
      },
      // Fonts are loaded via next/font (Cormorant Garamond + Inter) in the root
      // layout and exposed as CSS variables, so we self-host them — no external
      // <link> at runtime. The same two families the prototypes use.
      fontFamily: {
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
      },
      // Type scale from the design prompt's "Type scale (mobile)" table. Each entry
      // is [font-size, { lineHeight, letterSpacing, fontWeight }].
      fontSize: {
        'display-xl': ['44px', { lineHeight: '48px', letterSpacing: '-0.02em', fontWeight: '300' }],
        'display-l': ['32px', { lineHeight: '38px', letterSpacing: '-0.02em', fontWeight: '300' }],
        'display-m': ['24px', { lineHeight: '30px', letterSpacing: '-0.01em', fontWeight: '400' }],
        headline: ['20px', { lineHeight: '26px', letterSpacing: '0', fontWeight: '500' }],
        'body-l': ['17px', { lineHeight: '26px', letterSpacing: '0', fontWeight: '400' }],
        'body-m': ['15px', { lineHeight: '22px', letterSpacing: '0', fontWeight: '400' }],
        'body-s': ['13px', { lineHeight: '20px', letterSpacing: '0', fontWeight: '400' }],
        caption: ['11px', { lineHeight: '16px', letterSpacing: '0.08em', fontWeight: '500' }],
      },
      letterSpacing: {
        caption: '0.08em',
        wordmark: '0.18em',
      },
      // Spacing scale from the design prompt: 4,8,12,16,20,24,32,40,56,80.
      // Tailwind's default 1..6 already cover 4–24px; these add the named luxury
      // rhythm steps (40/56/80) used between sections.
      spacing: {
        section: '40px',
        'section-lg': '56px',
        'section-xl': '80px',
      },
      // Radii from the design prompt — nothing above 16px on cards.
      borderRadius: {
        sm: '4px', // chips, buttons
        md: '8px', // small cards
        lg: '12px', // medium cards
        xl: '16px', // large cards, sheets
        pill: '999px',
      },
      // The single sanctioned elevation (design prompt §Elevation): used only for
      // floating elements like the map bottom sheet.
      boxShadow: {
        card: '0 4px 24px rgba(15, 15, 15, 0.08)',
      },
      maxWidth: {
        container: '1280px',
      },
    },
  },
  plugins: [],
};

export default config;
