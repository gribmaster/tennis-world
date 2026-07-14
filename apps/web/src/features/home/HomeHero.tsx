import Link from 'next/link';
import Image from 'next/image';

// HomeHero — the full-bleed opening section of the Home page, ported from the
// hero block in `files/home.html`:
//   • a full-viewport cover photograph with a top+bottom darkening gradient,
//   • an eyebrow caption,
//   • a large serif editorial headline,
//   • a short stat/intro subtitle,
//   • a primary over-image CTA (and an optional secondary one),
//   • a trio of headline stats along the bottom.
//
// It is purely PRESENTATIONAL and data-agnostic, exactly like CourtCard: it owns
// layout/typography only and renders from the `content` prop. It does NOT call a
// repository and does NOT import `@tennis/mock-data` — the hero copy is supplied
// by the caller (apps/web/src/app/page.tsx). A default content object lives below
// so the section is content-config-driven rather than carrying literal copy inline
// in JSX (Phase 1 §3.2 / §4 data-driven discipline).
//
// FUTURE: in a later Phase-1 feature the hero copy moves behind the sanctioned
// repository boundary (it originates from `SITE_STATS` in `@tennis/mock-data`),
// at which point `page.tsx` will pass `content` sourced from a repository instead
// of from the default below — with zero changes to this presentational component.

export interface HomeHeroCta {
  label: string;
  href: string;
}

export interface HomeHeroStat {
  /** The large serif figure, e.g. "120+". */
  value: string;
  /** The eyebrow caption under it, e.g. "Courts". */
  label: string;
}

export interface HomeHeroContent {
  /** Uppercase caption above the headline. */
  eyebrow: string;
  /** The serif editorial headline. `\n` renders as a line break. */
  headline: string;
  /** Short intro / stat line under the headline. */
  subtitle: string;
  /** Primary call to action (rendered as the prominent over-image button). */
  primaryCta: HomeHeroCta;
  /** Optional secondary call to action, shown beside the primary one. */
  secondaryCta?: HomeHeroCta;
  /** Headline stats shown along the bottom of the hero. */
  stats: HomeHeroStat[];
  /** Background photograph (absolute, remote URL whitelisted in next.config.mjs). */
  imageUrl: string;
  /** Alt text for the background image (decorative hero → usually empty string). */
  imageAlt?: string;
}

/**
 * Default hero content. The copy is ported verbatim from `files/home.html`'s hero.
 * Kept as a config object (not inline JSX) so content stays data-shaped; see the
 * FUTURE note above for the eventual move behind a repository.
 */
export const HOME_HERO_CONTENT: HomeHeroContent = {
  eyebrow: 'The World of Tennis',
  headline: 'Where the game meets\nthe extraordinary.',
  subtitle: '50 countries · 1,000 courts · endless inspiration',
  primaryCta: { label: 'Explore the Map', href: '/map' },
  stats: [
    { value: '120+', label: 'Courts' },
    { value: '50', label: 'Countries' },
    { value: '6', label: 'Collections' },
  ],
  // Hero photograph, served from a local placeholder in apps/web/public/placeholders.
  // Root-relative so it resolves on local, staging, and production alike.
  imageUrl: '/placeholders/maurits-bausenhart-XtcZbSPVJ3A-unsplash.jpg',
  imageAlt: '',
};

export interface HomeHeroProps {
  /** Hero copy + imagery. Defaults to the ported prototype content. */
  content?: HomeHeroContent;
}

function ArrowGlyph() {
  return (
    <svg
      width="14"
      height="14"
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

export function HomeHero({ content = HOME_HERO_CONTENT }: HomeHeroProps) {
  const { eyebrow, headline, subtitle, primaryCta, secondaryCta, stats, imageUrl, imageAlt } =
    content;

  return (
    <section className="relative h-[min(100vh,860px)] min-h-[560px] w-full overflow-hidden">
      {/* Background photograph. `priority` + above-the-fold sizing since this is
          the first paint of the page. */}
      <Image
        src={imageUrl}
        alt={imageAlt ?? ''}
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      {/* `.img-overlay-top` from the prototype: dark at the very top (for the
          transparent header) and heavier at the bottom (for hero text). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-ink/85"
      />

      {/* Content, anchored to the bottom-left and gutter-padded like the prototype. */}
      <div className="container-page relative inset-0 flex flex-col justify-center h-[100%] px-[clamp(24px,6vw,80px)] pb-[clamp(48px,7vh,96px)] pt-[clamp(24px,5vw,80px)]">
        <div className="max-w-[720px]">
          <p className="eyebrow text-bone/75">{eyebrow}</p>

          <h1 className="display-xl mt-4 max-w-[640px] whitespace-pre-line text-bone">
            {headline}
          </h1>

          <p className="body-l mt-5 max-w-[420px] text-bone/80">{subtitle}</p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={primaryCta.href} className="btn btn-over-image gap-2.5">
              {primaryCta.label}
              <ArrowGlyph />
            </Link>
            {secondaryCta ? (
              <Link href={secondaryCta.href} className="btn btn-over-image gap-2.5 !border-bone/40">
                {secondaryCta.label}
              </Link>
            ) : null}
          </div>

          {stats.length > 0 ? (
            <dl className="mt-12 flex gap-8">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <dd className="serif text-[clamp(28px,3vw,44px)] font-light leading-none text-bone">
                    {stat.value}
                  </dd>
                  <dt className="eyebrow mt-1.5 text-bone/65">{stat.label}</dt>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </div>
    </section>
  );
}
