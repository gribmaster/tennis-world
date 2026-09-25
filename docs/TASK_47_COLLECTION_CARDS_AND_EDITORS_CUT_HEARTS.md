# TASK 47 — Collection Detail: Featured-style cards + hearts; Home: hearts on Editor's Cut

**Model: Sonnet 5, reasoning effort: medium.**

Two independent fixes. Treat them as separate changes.

## 1. `/collections/[slug]` (e.g. `/collections/hidden-resorts`) — restyle court cards to match Home's Featured Courts, with real save hearts

### Current state (confirmed by reading the actual code)

`apps/web/src/features/collection-detail/CollectionCourtsGrid.tsx` renders each court in
the collection with the shared `CourtCard` component
(`apps/web/src/components/court/CourtCard.tsx`) — a 4:5 tile with a different badge style
and a **visual-only, non-interactive** heart (`showSaved`/`saved` props — no `onClick` at
all; its own comment says "a later feature wires the real toggle"). It's currently used
inside a `grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` list.

`apps/web/src/features/home/HomeFeaturedCourts.tsx` (Home's "Featured courts" strip) has
the look you want: a 2:3 image tile, bottom gradient, gold "Premium" ribbon for locked
courts, category tag chips, serif name + location text overlaid at the bottom — and a
REAL, database-backed save heart (`HomeCourtSaveHeart`, top-right, 36×36, optimistic
save/unsave against `/v1/me/saved-courts`).

**The ask:** give the Collection Detail page's court grid that same card look, with a
real working heart — not the old `CourtCard`/visual-only heart.

**Do not touch `CourtCard.tsx` itself** — it's still used by `MapCourtList.tsx` and
`UserCollectionCourtsGrid.tsx` (the personal-folder detail page), neither of which this
task touches.

### a) `apps/web/src/app/collections/[slug]/page.tsx` — fetch saved-court state

Today this page calls `getViewerAuthState()` for `{ signedIn, viewerIsEntitled }` only —
it never reads the viewer's saved courts, so there's nothing to seed a heart's initial
state with. Replace that with the same protected-read pattern `app/page.tsx` (Home)
already uses for its own Featured strip, scoped down to what this page needs:

```tsx
import { repositories, AuthRequiredError } from '@/lib/repositories';
import { getRepositoriesForRequest } from '@/lib/repositories.server';
// remove the getViewerAuthState import — this page now resolves signedIn itself,
// same as app/page.tsx does, so it can also get savedCourtIds off the same reads.

// ...

const protectedRepos = await getRepositoriesForRequest();

const [collection, courts] = await Promise.all([
  repositories.collections.getBySlug(slug),
  repositories.courts.list({ collection: slug }),
]);
if (!collection) notFound();

let savedCourtIds: string[] = [];
let signedIn = true;
let viewerIsEntitled = false;
try {
  const [saved, user] = await Promise.all([
    protectedRepos.saved.getSavedCourts(),
    protectedRepos.user.getCurrentUser(),
  ]);
  savedCourtIds = saved.map((court) => court.id);
  viewerIsEntitled = user.membership !== 'free';
} catch (err) {
  if (err instanceof AuthRequiredError) {
    signedIn = false;
    viewerIsEntitled = false;
  } else {
    throw err; // a real fault must surface, not masquerade as "logged out"
  }
}
```

(Adjust ordering/exact variable plumbing to fit the existing `notFound()` flow — the
point is: one parallel public read for `courts` + `collection`, one try/catch protected
read for `saved.getSavedCourts()` + `user.getCurrentUser()`, exactly mirroring
`app/page.tsx`'s own comment about why these degrade together on `AuthRequiredError`.)

Pass the two new values down:

```tsx
<CollectionCourtsGrid
  courts={courts}
  viewerIsEntitled={viewerIsEntitled}
  savedCourtIds={savedCourtIds}
  signedIn={signedIn}
/>
```

Update this file's header comment — it currently says "Court cards reuse the shared
CourtCard and link to `/courts/{slug}`" — that's no longer true after this task; note
the grid now renders its own Featured-style card with a real save heart, and that the
page now also does a protected `getSavedCourts()`/`getCurrentUser()` read (degrading on
`AuthRequiredError` like Home's) so hearts can be seeded and this viewer's entitlement
resolved from real membership rather than `getViewerAuthState()`'s lighter read.

### b) `apps/web/src/features/collection-detail/CollectionCourtSaveHeart.tsx` — new file

A new heart component, typed for a `Court`, mirroring `HomeCourtSaveHeart.tsx`
**line-for-line** — this repo's established pattern is one heart component per
screen/feature-folder rather than importing across feature boundaries, even when the
object type is identical (see `CollectionSaveHeart.tsx`'s own header comment on why it
didn't reuse `HomeCourtSaveHeart` either, despite the near-identical shape/triad).

Copy `HomeCourtSaveHeart.tsx` verbatim into this new file and adapt only the header
comment (screen name: Collection Detail, not Home) and the import path depth (`@/lib/...`
stays the same). Keep everything else identical:
- Same props: `courtId`, `courtSlug`, `courtLabel`, `initialSaved`, `signedIn`.
- Same repository call: `getMutationSavedRepository().saveCourt(courtId)` /
  `.unsaveCourt(courtId)`.
- Same triad: optimistic flip, rollback in `.catch`, `pending` reset in `.finally()`,
  fixed 36×36 box, `aria-busy`/`disabled` while pending.
- Same sign-in redirect: `/signin?redirectTo=/courts/${courtSlug}` (this heart saves a
  COURT, so redirecting back to that court's own page after sign-in is correct here too,
  exactly as it is on Home).
- Same position: `absolute right-3 top-3`.

### c) `apps/web/src/features/collection-detail/CollectionCourtsGrid.tsx` — new card markup

Replace the `CourtCard` usage with an inline card matching `HomeFeaturedCourts.tsx`'s
`<li>` content (image, gradient overlay, premium ribbon, category tags, serif name,
location), adapted for a GRID cell instead of a horizontal-scroll strip:

```tsx
import Image from 'next/image';
import type { CourtSummaryDTO } from '@tennis/contracts';
import { PageContainer } from '@/components/layout';
import { SectionHeader } from '@/components/ui';
import { PendingCardLink } from '@/components/navigation';
import { courtCategoryTags, courtDisplay } from '@/components/court/court-display';
import { CollectionCourtSaveHeart } from './CollectionCourtSaveHeart';

/** Small lock glyph for the premium ribbon (verbatim from HomeFeaturedCourts.tsx). */
function LockGlyph() { /* same 10x10 svg as HomeFeaturedCourts.tsx / HomeEditorsCut.tsx */ }

export interface CollectionCourtsGridProps {
  courts: CourtSummaryDTO[];
  eyebrow?: string;
  title?: string;
  viewerIsEntitled?: boolean;
  /** Ids of the courts this viewer has already saved (seeds each heart). */
  savedCourtIds: string[];
  /** False for a logged-out visitor in `api` mode → hearts route to /signin. */
  signedIn: boolean;
}

export function CollectionCourtsGrid({
  courts,
  eyebrow = 'In this collection',
  title = 'The courts',
  viewerIsEntitled = false,
  savedCourtIds,
  signedIn,
}: CollectionCourtsGridProps) {
  const savedSet = new Set(savedCourtIds);

  return (
    <section className="bg-bone py-section-lg md:py-section-xl">
      <PageContainer>
        <SectionHeader eyebrow={eyebrow} title={title} />

        {courts.length === 0 ? (
          <p className="body-m mt-section text-stone">
            No courts in this collection yet — check back soon.
          </p>
        ) : (
          <ul className="mt-section grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {courts.map((court, i) => {
              const display = courtDisplay(court, viewerIsEntitled);
              return (
                <li key={court.id} className="relative">
                  <PendingCardLink
                    href={`/courts/${court.slug}`}
                    ariaLabel={display.name}
                    className="block aspect-[2/3] overflow-hidden rounded-[14px]"
                  >
                    <Image
                      src={court.heroImageUrl}
                      alt=""
                      fill
                      priority={i === 0}
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      className="object-cover"
                    />
                    {/* same .img-overlay gradient as HomeFeaturedCourts/HomeEditorsCut */}
                    <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.72) 100%)' }} />

                    {display.locked ? (
                      <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-pill px-2.5 py-[3px] text-[10px] font-semibold uppercase tracking-caption text-paper" style={{ background: 'linear-gradient(135deg,#C8A860,#B89968)' }}>
                        <LockGlyph />
                        Premium
                      </span>
                    ) : null}

                    <span className="absolute inset-x-0 bottom-0 block px-3.5 pb-4 pt-5">
                      <span className="mb-2 flex flex-wrap gap-1.5">
                        {courtCategoryTags(court).map((tag) => (
                          <span key={tag} className="inline-flex rounded-pill border border-paper/35 bg-bone/20 px-2.5 py-1 text-[11px] font-medium tracking-[0.03em] text-paper backdrop-blur-sm">
                            {tag}
                          </span>
                        ))}
                      </span>
                      <span className="serif mb-[5px] block text-[20px] font-normal leading-tight text-paper">
                        {display.name}
                      </span>
                      <span className="block text-[13px] text-paper/70">{display.location}</span>
                    </span>
                  </PendingCardLink>

                  <CollectionCourtSaveHeart
                    courtId={court.id}
                    courtSlug={court.slug}
                    courtLabel={display.name}
                    initialSaved={savedSet.has(court.id)}
                    signedIn={signedIn}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </PageContainer>
    </section>
  );
}
```

Notes:
- `savedCourtIds`/`signedIn` are now **required** props (not optional/defaulted) — every
  call site must be updated; grep confirms `CollectionCourtsGrid` has exactly one call
  site today (`app/collections/[slug]/page.tsx`, updated in §a).
- `sizes` above assumes the existing grid breakpoints (2 cols → sm still 2 → lg 3 → xl 4);
  adjust the fractions if you change the grid's own breakpoints (you shouldn't need to —
  this task only changes the CARD, not the grid density).
- `aspect-[2/3]` replaces the old `aspect-[4/5]` — cards will read taller/more portrait
  than before, matching Home's Featured strip. If that reads too tall at `xl:grid-cols-4`
  on very wide viewports, you have latitude to adjust (note what you changed and why in
  the report), but don't change it preemptively.
- No `'use client'` needed on this file — it stays a server-rendered leaf exactly as
  today; only `CollectionCourtSaveHeart` (its child) is a client component, same relationship
  `HomeEditorsCut` will have after §2 below.
- Remove the now-unused `CourtCard` import.
- Update the file's header comment (currently: "Mirrors the court-grid treatment in
  files/collections.html, but reuses the shared CourtCard (no re-implementation)... ") —
  it now re-implements the Featured-style card locally, mirroring `HomeFeaturedCourts.tsx`,
  with its own `CollectionCourtSaveHeart` for the real save toggle; say why (screen-local
  heart, per the established convention — see `CollectionCourtSaveHeart.tsx`'s own
  comment).

## 2. Home — add save hearts to the "Editor's Cut" cards

### Current state

`apps/web/src/features/home/HomeEditorsCut.tsx` renders its cards with NO save heart at
all (its own header comment says so explicitly: "Nothing here mutates, so no save
control and no pending triad" — stale now). `HomeFeaturedCourts.tsx`, right above it on
the same page, already has real hearts via `HomeCourtSaveHeart` — and
`HomeExplorer.tsx` (the parent of both) already computes `savedSet`/`signedIn` and passes
them into `HomeFeaturedCourts` (lines ~193–197) but NOT into `HomeEditorsCut` (line
~203, called with only `courts`/`viewerIsEntitled` today).

Unlike the Collection Detail case above, `HomeEditorsCut` lives in the SAME feature
folder as `HomeCourtSaveHeart` — **import it directly, do not duplicate it.**

### a) `apps/web/src/features/home/HomeExplorer.tsx`

Pass the props `HomeEditorsCut` will need — `savedSet` and `signedIn` are already local
variables in this file (used for `HomeFeaturedCourts`):

```tsx
<HomeEditorsCut
  courts={editorsCutCourts}
  viewerIsEntitled={viewerIsEntitled}
  savedCourtIds={savedSet}
  signedIn={signedIn}
/>
```

### b) `apps/web/src/features/home/HomeEditorsCut.tsx`

- Add `'use client'` at the top of the file — it wasn't needed before (fully static
  markup), but `HomeCourtSaveHeart` is a client component and this file now needs to hold
  local per-card seeded state indirectly through it; **actually**: rendering a client
  child from a server component does NOT require the parent to become a client component
  (Next.js server components can render client children directly). Only add `'use client'`
  if you find a concrete reason it's required — check `HomeFeaturedCourts.tsx`'s own
  reasons for being a client component (its `onClearFilters` handler, `HScrollArrows`
  render prop) before assuming `HomeEditorsCut` needs the same; it likely does NOT, since
  its only change here is rendering an already-client `HomeCourtSaveHeart` child. Leave it
  as a server component unless you hit an actual build/runtime error that says otherwise,
  and note in the report which way you went and why.
- Import `HomeCourtSaveHeart` from `./HomeCourtSaveHeart`.
- Add two new required props: `savedCourtIds: ReadonlySet<string>` and `signedIn: boolean`
  (match `HomeFeaturedCourts`'s prop types exactly for consistency).
- Wrap each `<li>` so the heart can overlay it as a SIBLING of the card's
  `PendingCardLink` (same structural rule as `HomeFeaturedCourts`: the heart must never be
  a descendant of the anchor). Current:

  ```tsx
  <li key={court.id} className="md:w-[75vw] min-w-[240px] md:max-w-[292px] shrink-0">
    <PendingCardLink ...>
      ...
    </PendingCardLink>
  </li>
  ```

  Becomes:

  ```tsx
  <li key={court.id} className="relative md:w-[75vw] min-w-[240px] md:max-w-[292px] shrink-0">
    <PendingCardLink ...>
      ...
    </PendingCardLink>

    <HomeCourtSaveHeart
      courtId={court.id}
      courtSlug={court.slug}
      courtLabel={display.name}
      initialSaved={savedCourtIds.has(court.id)}
      signedIn={signedIn}
    />
  </li>
  ```

  (`display` is already computed per-court in the existing `.map()` body — reuse it,
  don't recompute.)
- Update the file's header comment's PENDING STATES section (currently: "Nothing here
  mutates, so no save control and no pending triad") — it now hosts
  `HomeCourtSaveHeart`, same rule-2 triad as the Featured strip, rendered as a sibling of
  each card link for the same reason.

## Do not touch

- `CourtCard.tsx`, `MapCourtList.tsx`, `UserCollectionCourtsGrid.tsx` — unrelated; this
  task's Collection Detail change is scoped to the EDITORIAL collection page
  (`/collections/[slug]`), not the personal-folder detail page or Map.
- `HomeFeaturedCourts.tsx`, `HomeCourtSaveHeart.tsx` — read-only reference for both
  parts of this task; `HomeCourtSaveHeart` is imported (§2), not modified.
- `CollectionSaveHeart.tsx` / `CollectionCard.tsx` / `CuratedCollectionCard.tsx` — those
  are the EDITORIAL-COLLECTION-level save hearts from Task 42 (saving a whole collection);
  unrelated to this task's COURT-level hearts.
- `CollectionDetailHero.tsx`, `SectionHeader`, `PageContainer` — unrelated.
- Grid column breakpoints on `/collections/[slug]` — unchanged (2/2/3/4 cols), only the
  card content/aspect changes.

## Testing

- `/collections/hidden-resorts` (or any collection with courts): each court card now
  shows the Featured-courts look (2:3 image, bottom gradient, gold "Premium" ribbon on
  locked courts, category tag chips, serif name, location) with a working heart,
  top-right. Clicking the heart saves/unsaves the court (check `/saved` afterwards),
  optimistic with rollback on failure, logged-out click routes to
  `/signin?redirectTo=/courts/{slug}`. Clicking the card body still navigates to the
  court.
- Home: the "Editor's cut" cards now show the same heart control as "Featured courts"
  directly above them, same behavior (optimistic save/unsave, sign-in redirect for
  logged-out visitors). Card navigation still works.
- Locked-court masking is unaffected in both places — `courtDisplay(court,
  viewerIsEntitled)` still drives the masked name/location/tags exactly as before.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean.

## Report

For §1: confirm `CourtCard` is no longer used on `/collections/[slug]`, confirm
`CollectionCourtSaveHeart` mirrors `HomeCourtSaveHeart` (triad, redirect, positioning),
and confirm the page's new protected read degrades on `AuthRequiredError` the same way
Home's does (not a redirect, not a crash for logged-out visitors — collection pages stay
public).

For §2: confirm `HomeCourtSaveHeart` was imported and reused as-is (not duplicated), and
say whether `HomeEditorsCut.tsx` ended up needing `'use client'` or not, and why.

No git commit or push unless asked.
