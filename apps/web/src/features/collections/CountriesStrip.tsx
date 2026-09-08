import Image from 'next/image';
import type { CountryDTO } from '@tennis/contracts';
import { PendingCardLink } from '@/components/navigation';

// CountriesStrip — the "By Country" section of /collections (Feature 76), rebuilt from
// the prototype's CollectionsScreen (tennis_world_v2_standalone.html:1333–1348).
//
// THE PROTOTYPE'S HARDCODED ARRAY IS GONE. Lines 227–234 of the prototype ship a literal
// `COUNTRIES` list of country/court-count pairs. This strip is backed by the REAL
// aggregate Feature 75 shipped — `GET /v1/countries` → `CountryDTO[]`, reached through the
// `countries` repository on the central factory. The data arrives as a prop from
// `app/collections/page.tsx`, the screen's single repository boundary; this component
// never fetches and never imports @tennis/mock-data.
//
// Prototype geometry, from the file:
//   • section `padding:'28px 0 0'` (line 1334); heading `fontSize:16, fontWeight:600` at
//     the 20px gutter with `marginBottom:12` (lines 1335–1337).
//   • strip: `.h-scroll` at `gap:10`, `padding:'0 20px'` (line 1338).
//   • item: `width:90, textAlign:'center'` (line 1340); the avatar is a 72×72 circle with
//     `border: 1px solid rgba(184,184,182,0.3)` — the `mist` token at 30% (line 1341).
//   • label `fontSize:12, fontWeight:500, marginTop:6`; count `fontSize:10,
//     color:'var(--stone)', marginTop:2` (lines 1344–1345).
//
// ── DESTINATION: /map?q=<country name> ──────────────────────────────────────────────────
// A country is not a collection and has no detail route of its own. It navigates to the
// Map with the country name pre-seeded as the free-text query: `GET /v1/courts`'s `q`
// already searches the country name, and the in-memory `narrowCourts` predicate the Map
// uses matches it the same way, so this filters correctly TODAY with no new filter
// dimension and no change to the shared filter module (Features 73/74). The name is
// URL-encoded — country names contain spaces.
//
// PENDING STATES (CLAUDE.md §4 rule 1): the whole item is the target ⇒ `PendingCardLink`
// (the intake suggested `PendingLink` as an alternative; the item is a photo card with two
// stacked labels, not an icon+label row, so the whole-card primitive is the right one and
// it matches the two neighbouring sections). Nothing here mutates.
//
// A plain overflow-x row — no carousel library. Same gutter treatment as the strips above
// and on Home: inside `.container-page` for heading alignment, right gutter cancelled so
// the row bleeds off the edge, trailing spacer to close it.

export interface CountriesStripProps {
  countries: CountryDTO[];
  title?: string;
}

const DEFAULT_TITLE = 'By Country';

export function CountriesStrip({ countries, title = DEFAULT_TITLE }: CountriesStripProps) {
  // No countries (no published courts anywhere) renders nothing — never a bare heading.
  if (countries.length === 0) return null;

  return (
    <section className="pt-7">
      <div className="container-page mb-3">
        <h2 className="text-[16px] font-semibold leading-tight text-ink">{title}</h2>
      </div>

      <div className="container-page">
        <ul className="no-scrollbar -mr-[clamp(20px,4vw,64px)] flex gap-2.5 overflow-x-auto pb-1">
          {countries.map((country) => {
            // `courtCount` is always >= 1 (a country with no published court is omitted
            // from the aggregate entirely), but the singular is handled explicitly rather
            // than assumed — "1 courts" is the exact defect this guards.
            const countLabel = `${country.courtCount} ${country.courtCount === 1 ? 'court' : 'courts'}`;
            return (
              <li key={country.isoCode} className="w-[90px] shrink-0">
                <PendingCardLink
                  href={`/map?q=${encodeURIComponent(country.name)}`}
                  ariaLabel={`${country.name} — ${countLabel}`}
                  className="block rounded-lg text-center"
                >
                  {/* The circle is its own positioning context so the round crop clips
                      the image without the pending overlay above being clipped with it. */}
                  <span className="relative mx-auto block h-[72px] w-[72px] overflow-hidden rounded-full border border-mist/30">
                    <Image
                      src={country.imageUrl}
                      alt=""
                      fill
                      sizes="72px"
                      className="object-cover"
                    />
                  </span>
                  <span className="mt-1.5 block text-[12px] font-medium leading-tight text-ink">
                    {country.name}
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-tight text-stone">
                    {countLabel}
                  </span>
                </PendingCardLink>
              </li>
            );
          })}
          <li aria-hidden className="w-5 shrink-0" />
        </ul>
      </div>
    </section>
  );
}
