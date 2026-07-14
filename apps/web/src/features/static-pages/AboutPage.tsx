import Image from 'next/image';
import { PageContainer } from '@/components/layout';

// AboutPage — the static About screen, ported from `files/about.html`'s
// `StaticPage`:
//   • a full-bleed hero photograph with a top+bottom darkening gradient, an
//     eyebrow, and a serif headline;
//   • a centered prose column (four paragraphs);
//   • a stats row (Courts / Countries / Collections / Mission);
//   • a "Get in Touch" mailto CTA band.
//
// PRESENTATIONAL only. The prose, stats, and CTA copy are page chrome (local
// constants) — the same latitude the Footer / paywall copy already take. It owns
// layout/typography; it does NOT fetch, hold state, or import `@tennis/mock-data`.
//
// The hero/CTA imagery and the `mailto:` address mirror the prototype exactly.

// Decorative hero photograph, served from a local placeholder (apps/web/public/
// placeholders). Root-relative so it resolves on local, staging, and production.
const HERO_IMAGE = '/placeholders/sam-hojati-w6-_hcmVhYA-unsplash.jpg';

// Contact address, ported verbatim from the prototype's "Get in Touch" CTA.
const CONTACT_EMAIL = 'hello@tennisworld.app';

// Prose paragraphs, ported verbatim from files/about.html.
const PROSE: string[] = [
  "Tennis World began as a personal map — a record of courts discovered while travelling, training, and following the global tennis community to the places it loves most. Some of those courts are world-famous. Others are known only to the people who've played on them.",
  'This is not a ranking of the "best" courts by performance criteria. It\'s a guide to atmosphere — light, surface, surroundings, and the particular feeling of a place that stays with you long after you\'ve left it. We believe a tennis court can be a destination in its own right, and we built this atlas for the kind of traveller who agrees.',
  "Today, Tennis World is a curated discovery platform: a free tier for browsing the world's most interesting courts, and a membership that unlocks the full atlas — exact locations, hidden destinations, and editorial guides written by people who've actually played there.",
  'In future versions, we plan to connect discovery directly to booking through trusted external partners, and to bring players together — so that finding a beautiful court is just the beginning.',
];

// Stats row, ported verbatim from the prototype: [figure, label].
const STATS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '120+', label: 'Courts' },
  { value: '50', label: 'Countries' },
  { value: '6', label: 'Collections' },
  { value: '1', label: 'Mission' },
];

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

export function AboutPage() {
  return (
    <>
      {/* Hero — full-bleed cover photo + top/bottom gradient, ported from the prototype. */}
      <section className="relative h-[clamp(360px,60vh,640px)] w-full overflow-hidden">
        <Image src={HERO_IMAGE} alt="" fill priority sizes="100vw" className="object-cover" />
        {/* `.img-overlay-top` from the prototype: darker at top + bottom for text. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-ink/85"
        />
        <div className="absolute inset-0 flex flex-col justify-end px-[clamp(24px,6vw,80px)] pb-[clamp(48px,7vh,96px)] pt-[clamp(24px,5vw,80px)]">
          <p className="eyebrow text-bone/75">About</p>
          <h1 className="display-xl mt-4 max-w-[640px] text-bone">
            Tennis is more than a sport.
            <br />
            It&rsquo;s a place. A feeling.
          </h1>
        </div>
      </section>

      {/* Prose + stats row. */}
      <PageContainer as="section" className="py-[clamp(48px,6vw,96px)]">
        <div className="mx-auto max-w-[720px]">
          {PROSE.map((para, i) => (
            <p
              key={i}
              className={['body-l text-graphite', i < PROSE.length - 1 ? 'mb-6' : '']
                .filter(Boolean)
                .join(' ')}
            >
              {para}
            </p>
          ))}
        </div>

        {/* Stats row, bordered off from the prose above (matches the prototype). */}
        <dl className="mx-auto mt-16 grid max-w-[720px] grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-6 border-t border-hairline pt-12">
          {STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <dd className="display-m text-ink">{stat.value}</dd>
              <dt className="eyebrow mt-1.5 text-stone">{stat.label}</dt>
            </div>
          ))}
        </dl>
      </PageContainer>

      {/* "Get in Touch" mailto CTA band, ported from the prototype. */}
      <section className="border-t border-hairline bg-ivory py-[clamp(48px,6vw,96px)]">
        <div className="container-page mx-auto max-w-[560px] text-center">
          <h2 className="display-m text-ink">Have a court to suggest?</h2>
          <p className="body-l mt-3 text-stone">
            If you know a court that belongs on this map, we&rsquo;d love to hear about it.
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="btn btn-primary mt-6 inline-flex gap-2.5"
          >
            Get in Touch
            <ArrowGlyph />
          </a>
        </div>
      </section>
    </>
  );
}
