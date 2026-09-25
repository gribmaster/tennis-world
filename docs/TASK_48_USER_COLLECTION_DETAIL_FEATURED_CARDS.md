# TASK 48 — Your own folders (`/saved/collections/[slug]`): Featured-style cards + hearts

**Model: Sonnet 5, reasoning effort: medium.**

## Context

This is the SAME fix as Task 47 §1, applied to a different screen. `/saved/collections/tet`
(and every `/saved/collections/[slug]`) is the **personal folder** detail page — your own
created collection, e.g. "tet" — reached from Saved → Collections → "Your Folders". It is
**not** the editorial `/collections/[slug]` page Task 47 already covers (that guardrail is
already called out in this page's own header comment: "NOT the editorial
`/collections/[slug]`").

Like the editorial page before Task 47, this page's grid
(`apps/web/src/features/user-collection-detail/UserCollectionCourtsGrid.tsx`) still uses
the old `CourtCard` (4:5 tile, visual-only non-interactive heart). The ask: give it the
same Home "Featured courts" card look with a real, working save heart — do this the same
way Task 47 §1 did it for the editorial collection page (read that task doc first if it's
available; this one mirrors its structure exactly, on a different feature folder).

**Do not touch `CourtCard.tsx` itself** — it's still used by `MapCourtList.tsx` (and, if
Task 47 hasn't shipped yet when you pick this up, `CollectionCourtsGrid.tsx`); neither is
in scope here.

## Key difference from Task 47: this page is already private/authenticated

`app/saved/collections/[slug]/page.tsx` already calls `loadOrSignIn(...)`, which redirects
a logged-out visitor to `/signin?redirectTo=/saved/collections/{slug}` BEFORE the page
body ever renders. So, unlike the editorial collection page, there is no logged-out
reading to degrade for — every render of this page has a real signed-in viewer. That
simplifies things: no `AuthRequiredError` handling needed for the new read below, and the
heart component doesn't need a `signedIn` prop threaded in (it can default to `true`,
exactly like `HomeCourtSaveHeart`'s own default).

## a) `apps/web/src/app/saved/collections/[slug]/page.tsx` — fetch saved-court state

Add `repositories.saved.getSavedCourts()` to the existing `loadOrSignIn` call, alongside
the folder + user reads already there:

```tsx
const [collection, user, savedCourts] = await loadOrSignIn(
  () =>
    Promise.all([
      repositories.saved.getUserCollectionBySlug(slug),
      repositories.user.getCurrentUser(),
      repositories.saved.getSavedCourts(),
    ]),
  `/saved/collections/${slug}`,
);
if (!collection) {
  notFound();
}
const viewerIsEntitled = user.membership !== 'free';
const savedCourtIds = savedCourts.map((court) => court.id);
```

Pass it down:

```tsx
<UserCollectionCourtsGrid
  courts={collection.courts}
  viewerIsEntitled={viewerIsEntitled}
  savedCourtIds={savedCourtIds}
/>
```

Update the file's header comment's repository-methods list to add
`repositories.saved.getSavedCourts()`, noting it's read alongside the existing two
(same `loadOrSignIn` call, no extra round trip to the sign-in redirect logic) purely to
seed each card's save heart.

## b) `apps/web/src/features/user-collection-detail/UserCollectionCourtSaveHeart.tsx` — new file

A new heart component, mirroring `HomeCourtSaveHeart.tsx` **line-for-line** — same
established pattern as Task 47's `CollectionCourtSaveHeart.tsx` (one heart component per
screen/feature-folder, not imported across feature boundaries, even though the object
type — `Court` — is identical every time). If Task 47 already shipped, read its
`CollectionCourtSaveHeart.tsx` as the more recent precedent to copy from (it's the same
adaptation one folder over); otherwise copy from `HomeCourtSaveHeart.tsx` directly.

Keep identical: props (`courtId`, `courtSlug`, `courtLabel`, `initialSaved`, `signedIn`
— default `true`, and simply not passed from this page per the note above), the
`getMutationSavedRepository().saveCourt`/`.unsaveCourt` calls, the full triad (optimistic
flip, rollback in `.catch`, `pending` reset in `.finally()`, fixed 36×36 box,
`aria-busy`/`disabled` while pending), the `/signin?redirectTo=/courts/${courtSlug}`
fallback (dead code on this page today since the page itself guarantees a signed-in
visitor, but keep it for parity/robustness rather than special-casing it away — the same
reasoning the codebase already applies to the `signedIn` default on every other heart), and
`absolute right-3 top-3` positioning.

## c) `apps/web/src/features/user-collection-detail/UserCollectionCourtsGrid.tsx` — new card markup

Replace `CourtCard` with the same inline Featured-style card Task 47 §1 built for
`CollectionCourtsGrid.tsx` (image, gradient overlay, premium ribbon, category tags, serif
name, location, `aspect-[2/3]`), adapted here with the new heart from (b):

```tsx
import Image from 'next/image';
import type { CourtSummaryDTO } from '@tennis/contracts';
import { PageContainer } from '@/components/layout';
import { PendingCardLink } from '@/components/navigation';
import { courtCategoryTags, courtDisplay } from '@/components/court/court-display';
import { UserCollectionCourtSaveHeart } from './UserCollectionCourtSaveHeart';
import { UserCollectionEmptyState } from './UserCollectionEmptyState';

/** Small lock glyph for the premium ribbon (verbatim from HomeFeaturedCourts.tsx). */
function LockGlyph() { /* same 10x10 svg as HomeFeaturedCourts.tsx / CollectionCourtsGrid.tsx */ }

export interface UserCollectionCourtsGridProps {
  courts: CourtSummaryDTO[];
  viewerIsEntitled?: boolean;
  /** Ids of the courts this viewer has already saved (seeds each heart). */
  savedCourtIds: string[];
}

export function UserCollectionCourtsGrid({
  courts,
  viewerIsEntitled = false,
  savedCourtIds,
}: UserCollectionCourtsGridProps) {
  const savedSet = new Set(savedCourtIds);

  return (
    <section className="bg-bone pb-section-lg pt-section md:pb-section-xl">
      <PageContainer>
        {courts.length === 0 ? (
          <UserCollectionEmptyState />
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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

                  <UserCollectionCourtSaveHeart
                    courtId={court.id}
                    courtSlug={court.slug}
                    courtLabel={display.name}
                    initialSaved={savedSet.has(court.id)}
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

Notes (all the same as Task 47 §1's, carried over):
- `savedCourtIds` is a new **required** prop — the one call site (§a) is updated
  alongside it.
- `UserCollectionCourtSaveHeart` is NOT given a `signedIn` prop here — it defaults to
  `true`, which is always correct on this page (see the note above on why).
- `aspect-[2/3]` replaces the old `aspect-[4/5]`; same latitude as Task 47 to adjust at
  `xl:grid-cols-4` if it reads too tall, noted in the report if you do.
- Remove the now-unused `CourtCard` import.
- Update the file's header comment (currently: "Reuses the shared CourtCard (no
  re-implementation) exactly like the editorial CollectionCourtsGrid...") — that sentence
  is now wrong on BOTH counts once Task 47 ships (neither grid reuses `CourtCard` anymore);
  replace it with a note that this mirrors `CollectionCourtsGrid.tsx`'s Featured-style card
  and its own `UserCollectionCourtSaveHeart`, with the one difference that this page never
  needs to handle a logged-out visitor.
- The file's existing "NOT IMPLEMENTED (deferred): ... per-card 'Remove from collection'
  button..." note stays — this task only adds the SAVE/UNSAVE-COURT heart (removing a
  court from THIS folder is a different, still-unbuilt action; don't conflate the two).

## Do not touch

- `CourtCard.tsx`, `MapCourtList.tsx` — unrelated.
- `UserCollectionHero.tsx`, `UserCollectionRename.tsx`, `UserCollectionEmptyState.tsx` —
  unrelated; `UserCollectionEmptyState` is still rendered for the zero-courts case,
  unchanged.
- `CollectionCourtsGrid.tsx` / `CollectionCourtSaveHeart.tsx` (editorial collections,
  Task 47) — read-only reference for the pattern; not modified by this task.
- `loadOrSignIn`'s own implementation — only its call site here gets a third item in the
  `Promise.all`.
- Grid column breakpoints — unchanged (2/2/3/4 cols), only the card content/aspect
  changes, same as Task 47.

## Testing

- `/saved/collections/tet` (or any personal folder with courts): each court card now
  shows the Featured-courts look with a working heart, top-right. Clicking it
  saves/unsaves the COURT (check `/saved`'s Courts tab afterwards) — it does NOT remove
  the court from this folder (that's a separate, unbuilt action; unsaving a court and
  removing it from a personal folder are different operations).
  Card body still navigates to the court's detail page.
- A folder with zero courts still shows `UserCollectionEmptyState`, unchanged.
- Locked-court masking unaffected — `courtDisplay(court, viewerIsEntitled)` still drives
  the masked name/location/tags.
- Visiting this page while logged out still redirects to `/signin?redirectTo=...`,
  unchanged (this task doesn't touch that guard).
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean.

## Report

Confirm `CourtCard` is no longer used on this page, confirm
`UserCollectionCourtSaveHeart` mirrors the established heart pattern (triad, redirect,
positioning) and was NOT imported across feature folders, and confirm the new
`getSavedCourts()` read was folded into the existing `loadOrSignIn` call rather than a
second auth-redirect path. No git commit or push unless asked.
