import Image from 'next/image';

// CollectionsHero — the editorial page hero for /collections, ported from the dark
// hero band in files/collections.html: a near-black panel with a faded aerial photo
// behind an eyebrow + serif display title.
//
// PRESENTATIONAL only. The copy and the decorative background image are page chrome
// (local constants, overridable via props) — NOT court/collection data — so this
// component imports no repository and no @tennis/mock-data.

// Decorative background — the aerial court photo the prototype uses, faded behind
// the title. Kept here as page chrome (not a DTO field); `images.unsplash.com` is
// whitelisted in next.config.mjs.
const DEFAULT_HERO_IMAGE =
  'https://images.unsplash.com/photo-1530915534234-66dcdb7e2f5d?w=1800&q=80&auto=format&fit=crop';
const DEFAULT_EYEBROW = 'Collections';
const DEFAULT_TITLE = 'Curated journeys, gathered by landscape and spirit.';

export interface CollectionsHeroProps {
  eyebrow?: string;
  title?: string;
  /** Decorative background image URL (faded). Defaults to the prototype's aerial. */
  imageUrl?: string;
}

export function CollectionsHero({
  eyebrow = DEFAULT_EYEBROW,
  title = DEFAULT_TITLE,
  imageUrl = DEFAULT_HERO_IMAGE,
}: CollectionsHeroProps) {
  return (
    <section className="relative overflow-hidden bg-ink">
      {/* Faded decorative backdrop (opacity ~0.35, matching the prototype). */}
      <Image
        src={imageUrl}
        alt=""
        fill
        sizes="100vw"
        priority
        className="object-cover opacity-35"
      />
      <div className="container-page relative py-[clamp(48px,8vw,96px)]">
        <p className="eyebrow text-bone/60">{eyebrow}</p>
        <h1 className="display-l mt-3 max-w-[480px] text-bone">{title}</h1>
      </div>
    </section>
  );
}
