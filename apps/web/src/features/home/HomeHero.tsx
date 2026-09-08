import Image from 'next/image';
import { PendingLink } from '@/components/navigation';

// HomeHero — the v2 opening band (Feature 74), rebuilt from the prototype's HomeScreen
// hero (design_v2_stripped.html:419–434).
//
// Prototype geometry, taken from the file rather than from memory:
//   • the band is `height:340` (line 420) — a fixed image band, not the old full-viewport
//     hero. Kept fixed at mobile and allowed to grow on wide screens so the 44px headline
//     does not float in an over-tall box on desktop.
//   • `.img-overlay-top` (line 88): `linear-gradient(180deg, rgba(0,0,0,0.5) 0%,
//     rgba(0,0,0,0) 44%, rgba(0,0,0,0.78) 100%)` — dark at the top for the transparent
//     header, clear through the middle, heavy at the bottom for the headline. Reproduced
//     verbatim as an inline gradient because Tailwind's `via-` stop lands at 50%, not the
//     prototype's 44%, and the three stops are the whole character of the treatment.
//   • copy block at `left:20 right:20 bottom:20` (line 428).
//   • headline `display-xl` in three hard-wrapped lines, `marginBottom:4` (line 429).
//   • sub-line `body-s` at 75% white, `marginBottom:16` (line 430).
//   • CTA: `btn btn-gold btn-sm btn-pill`, `fontSize:11`, `letterSpacing:0.12em` (line 431)
//     — a pill, 40px tall.
//
// CTA VARIANT — one deliberate divergence from the prototype. The prototype paints this
// button GOLD (`.btn-gold`). In this app gold is `.btn-premium`, which globals.css:167
// reserves for the PAYWALL, and every current call site honours that (the paywall modal,
// Court Detail's unlock CTA, Profile's membership card). This CTA just navigates to /map —
// painting it gold would make the app's one "this costs money" signal mean nothing. So it
// uses `.btn-over-image`, the existing variant for exactly this situation (a CTA sitting on
// a photograph), with the prototype's pill radius, 40px height, 11px size and 0.12em
// tracking applied as utilities. No `.btn-gold`, `.btn-sm` or `.btn-pill` class is added —
// this repo has no such variants and the brief forbids a second button system.
//
// NO WORDMARK, NO AVATAR (brief §1): the prototype draws a `TENNIS · WORLD` wordmark and a
// 32×32 avatar inside the hero (lines 425–427). In the real app that row IS `AppHeader`,
// rendered transparently over this band by `AppShell`'s existing `overHero` prop. Building
// them here would put a second header on top of the real one. The prototype's fake iOS
// `StatusBar` (line 423) is discarded outright per intake §4.
//
// PRESENTATIONAL & data-agnostic, unchanged from v1: no repository, no @tennis/mock-data.
// The copy stays a config object (not inline JSX) so it remains data-shaped.

export interface HomeHeroCta {
  label: string;
  href: string;
}

export interface HomeHeroContent {
  /** The serif display headline. `\n` renders as a line break. */
  headline: string;
  /** Short line under the headline. */
  subtitle: string;
  /** The single pill CTA. */
  primaryCta: HomeHeroCta;
  /** Background photograph (root-relative so it resolves in every environment). */
  imageUrl: string;
  /** Alt text (decorative hero → empty string). */
  imageAlt?: string;
}

/** Default hero content — copy ported verbatim from the prototype (lines 429–431). */
export const HOME_HERO_CONTENT: HomeHeroContent = {
  headline: "The world's\nmost amazing\ntennis courts",
  subtitle: 'Explore. Save. Travel.',
  primaryCta: { label: 'Explore the map', href: '/map' },
  imageUrl: '/placeholders/maurits-bausenhart-XtcZbSPVJ3A-unsplash.jpg',
  imageAlt: '',
};

function ArrowGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export interface HomeHeroProps {
  content?: HomeHeroContent;
}

export function HomeHero({ content = HOME_HERO_CONTENT }: HomeHeroProps) {
  const { headline, subtitle, primaryCta, imageUrl, imageAlt } = content;

  return (
    <section className="relative h-[340px] w-full overflow-hidden md:h-[clamp(340px,46vw,520px)]">
      <Image
        src={imageUrl}
        alt={imageAlt ?? ''}
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />

      {/* `.img-overlay-top`, stop for stop (prototype line 88). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 44%, rgba(0,0,0,0.78) 100%)',
        }}
      />

      {/* Copy block, bottom-left at the prototype's 20px gutter (widening on desktop so
          it tracks `.container-page`'s own gutter rather than hugging the edge). */}
      <div className="absolute inset-x-0 bottom-5 px-5 md:px-[clamp(20px,4vw,64px)]">
        <div className="mx-auto w-full max-w-container">
          <h1 className="display-xl mb-1 whitespace-pre-line text-paper">{headline}</h1>
          <p className="body-s mb-4 text-paper/75">{subtitle}</p>
          <PendingLink
            href={primaryCta.href}
            className="btn btn-over-image h-10 gap-2 rounded-pill px-4 text-[11px] tracking-[0.12em]"
          >
            {primaryCta.label}
            <ArrowGlyph />
          </PendingLink>
        </div>
      </div>
    </section>
  );
}
