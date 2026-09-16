import Image from 'next/image';
import type { CollectionDTO } from '@tennis/contracts';
import { PendingCardLink } from '@/components/navigation';

// CuratedCollectionsList — the "Curated for You" section of /collections (Feature 76),
// rebuilt from the prototype's CollectionsScreen (tennis_world_v2_standalone.html:
// 1351–1372). It REPLACES the v1 `CollectionsGrid` (a responsive 3-up grid of cover
// tiles); the same data now reads as the prototype's vertical row list.
//
// Prototype geometry, from the file:
//   • section `padding:'28px 20px 0'` (line 1352); heading `fontSize:16, fontWeight:600`
//     with `marginBottom:12` (lines 1353–1355).
//   • list: `flexDirection:'column', gap:10` (line 1356).
//   • row: `background:'var(--paper)'`, `borderRadius:12`, `gap:14`, `padding:'12px'`,
//     `alignItems:'center'` (line 1358).
//   • thumb: `96×80`, `objectFit:'cover'`, `borderRadius:10` (line 1359).
//   • text: name `fontWeight:500, fontSize:15, lineHeight:1.2`; subtitle `fontSize:12,
//     color:'var(--stone)', marginTop:3, lineHeight:1.35`; count `fontSize:11,
//     color:'var(--stone)', marginTop:6` (lines 1361–1363).
//
// ── NO SAVE / BOOKMARK CONTROL — DELIBERATE ─────────────────────────────────────────────
// The prototype puts a 32×32 bookmark button on each row (lines 1365–1367). It is NOT
// built here, because the capability it implies does not exist in this product:
//   • `SavedRepository.getSavedCollections()` returns `UserCollectionDTO[]` — the visitor's
//     OWN collections, which they create and fill with courts. That is a different thing
//     from an editorial `CollectionDTO`.
//   • Bookmarking an editorial collection has no model (no join table), no endpoint, and
//     no repository method. There is nothing to call.
// So the control is OMITTED entirely rather than rendered inert (an inert CTA is exactly
// what `docs/PHASE_1_PLACEHOLDER_CTA_AUDIT.md` exists to prevent), and it is emphatically
// NOT wired to `createUserCollection`, which means something else. Each row is therefore a
// single navigation target and nothing else — which is why the whole row is one link with
// no interactive descendants.
//
// PRESENTATIONAL & data-driven: the collections arrive as a prop from
// `app/collections/page.tsx`, the screen's single repository boundary.
//
// PENDING STATES (CLAUDE.md §4 rule 1): the whole row navigates ⇒ `PendingCardLink`.
// Nothing in this section mutates, so no `PendingButton` and no mutation spinner.

export interface CuratedCollectionsListProps {
  collections: CollectionDTO[];
  title?: string;
}

const DEFAULT_TITLE = 'Curated for You';

export function CuratedCollectionsList({
  collections,
  title = DEFAULT_TITLE,
}: CuratedCollectionsListProps) {
  // An empty list renders nothing — a heading with no rows under it is worse than no
  // section at all. The page decides what (if anything) an entirely empty screen says.
  if (collections.length === 0) return null;

  return (
    <section className="container-page pt-7">
      <h2 className="mb-3 text-[16px] font-semibold leading-tight text-ink">{title}</h2>

      <ul className="flex flex-col md:flex-row flex-wrap gap-2.5">
        {collections.map((collection) => (
          <li key={collection.id} className="md:w-[32%]">
            <PendingCardLink
              href={`/collections/${collection.slug}`}
              ariaLabel={collection.name}
              className="flex items-center gap-3.5 rounded-lg bg-paper p-3"
            >
              {/* Fixed-size thumb; `relative` so next/image `fill` sizes to it. */}
              <span className="relative block h-20 w-24 shrink-0 overflow-hidden rounded-[10px]">
                <Image
                  src={collection.coverImageUrl}
                  alt=""
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              </span>

              <span className="block min-w-0 flex-1">
                <span className="block text-[15px] font-medium leading-[1.2] text-ink">
                  {collection.name}
                </span>
                {collection.description ? (
                  <span className="mt-[3px] line-clamp-2 block text-[12px] leading-[1.35] text-stone">
                    {collection.description}
                  </span>
                ) : null}
                <span className="mt-1.5 block text-[11px] leading-tight text-stone">
                  {collection.count === 1 ? '1 court' : `${collection.count} courts`}
                </span>
              </span>
            </PendingCardLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
