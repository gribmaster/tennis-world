'use client';

import { useCallback, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { CourtSummaryDTO } from '@tennis/contracts';
import { PendingCardLink } from '@/components/navigation';
import { getMutationSavedRepository } from '@/lib/repositories.client';
import { AuthRequiredError } from '@/lib/repositories';
import { InlineSpinner } from '@/components/ui';
import { SavedEmptyState } from './SavedEmptyState';
import { SavedDreamListCta } from './SavedDreamListCta';

// SavedCourtsGrid — the Courts tab of the Saved page, rebuilt to the v2 prototype's
// full-bleed image cards (tennis_world_v2_standalone.html:1220–1246).
//
// RESTYLED, NOT REWIRED. v1 was a responsive grid of the shared `CourtCard` with an unsave
// overlay bolted to its bottom-right. v2 is the prototype's single-column stack of
// full-bleed cards whose text sits over the image, which no `CourtCard` variant expresses
// (its variants are a 4:5 portrait tile and a 3:2 wide tile, both with their own overlay
// composition) — so this file now draws the card itself, exactly as `HomeFeaturedCourts`
// draws the 2:3 strip card for the same reason. The UNSAVE MUTATION below is unchanged
// from the audited version: same repository, same optimistic remove, same rollback, same
// `.finally()`.
//
// Prototype geometry, from the file:
//   • list `padding:'0 20px', flexDirection:'column', gap:12` (line 1222) — the 20px
//     gutter comes from `.container-page` in SavedTabs.
//   • card `height:170`, `borderRadius:14`, `overflow:hidden` (line 1224).
//   • `.img-overlay` (CSS line 87): `linear-gradient(180deg, rgba(0,0,0,0) 40%,
//     rgba(0,0,0,0.72) 100%)`.
//   • surface chip top-left at `10,10` (line 1227) — `SurfaceLabel small`, i.e.
//     `fontSize:10, padding:'3px 8px'`.
//   • unsave control top-right at `10,10`, 32×32 circle, `rgba(15,15,15,0.45)` +
//     `backdrop-filter:blur(8px)` (line 1229).
//   • text block `padding:'16px 14px 14px'` (line 1232): serif 19px/400 white name at
//     `lineHeight:1.2, marginBottom:4`; a pin glyph + 12px location at 85% white with
//     `marginBottom:8`; then up to THREE tag chips — `rgba(245,242,236,0.22)` on a
//     `1px solid rgba(255,255,255,0.35)` border, `padding:'3px 9px'`, `borderRadius:100`,
//     `fontSize:11, fontWeight:500` (lines 1233–1242).
//
// ── THE SURFACE CHIP OVER AN IMAGE ──────────────────────────────────────────────────────
// The prototype's `SurfaceLabel` uses the pale `chip-surface-*` palette (e.g. clay =
// `#F0E6E0` on `#8B3A1F`), which is authored for the paper background it sits on
// elsewhere. Over a photograph those washed tints lose contrast and stop reading as a
// chip. This card therefore renders the surface in the SAME translucent-over-image
// treatment the tag chips use — the language the v2 cards already established on Home
// (`HomeFeaturedCourts`' experience chip) — rather than introducing a new palette
// (CLAUDE.md §9). The chip's CONTENT is unchanged: the court's `surface`.
//
// ── LOCKED COURTS ───────────────────────────────────────────────────────────────────────
// A saved court can be locked. The card masks its name/location through the shared
// `courtDisplay` helper so this screen cannot drift from Home on what "locked" looks like.
// That is PRESENTATION over already-public fields — no entitlement check is invented here
// and the exact-location endpoint is never called.
//
// ── INTERACTIVE UNSAVE (unchanged behaviour) ────────────────────────────────────────────
// Each card carries an "Unsave" control that calls the SavedRepository (`unsaveCourt`) and
// removes the card from the list. It is a SIBLING of the card link, not a descendant, so a
// click on it can never be a click on the card's anchor (and a <button> inside an <a>
// would be invalid HTML anyway).
//
// REPOSITORY / AUTH: the write goes through `getMutationSavedRepository()` — the in-memory
// seam in mock mode, the protected DELETE /v1/me/saved-courts/:courtId in `api` mode
// (httpOnly cookie via credentials:'include', or a server action in staging demo mode).
// Removal is OPTIMISTIC (the card disappears immediately); a session that expired mid-use
// surfaces as `AuthRequiredError`, on which we restore the card and route to /signin
// (Saved is a private page — the same redirect the server uses).
//
// PENDING STATES (CLAUDE.md §4):
//   • The whole card navigates ⇒ `PendingCardLink` (rule 1).
//   • The unsave control is a database-backed action ⇒ the rule-2 triad: local pending
//     state + `disabled` + `aria-busy` + `<InlineSpinner label="Unsaving …" />`, with the
//     optimistic removal rolled back on failure and pending cleared in an unconditional
//     `.finally()` (rule 7). The spinner swaps 1:1 with the glyph inside a fixed 32×32 box,
//     so the control never reflows (rule 5).
//
// DATA-DRIVEN: the list arrives via the `courts` prop (server-fetched in page.tsx →
// SavedTabs, then ordered by SavedTabs' sort control). This island imports no
// @tennis/mock-data and hardcodes no court data.

import { courtDisplay } from '@/components/court/court-display';

/** Small X glyph for the unsave control — inline to avoid an icon dependency (hard rule). */
function CloseGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/** The prototype's `Ico.pin(11)` beside the location line (line 1236). */
function PinGlyph() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

/** Prototype: `c.labels.slice(0,3)` — at most three chips per card (line 1239). */
const MAX_TAG_CHIPS = 3;

export interface SavedCourtsGridProps {
  courts: CourtSummaryDTO[];
  /**
   * Ids optimistically unsaved so far, owned by SavedTabs. The visible list is `courts`
   * MINUS these. It is LIFTED rather than held here because the header's "N saved" count
   * is rendered by SavedTabs: keeping membership local would let the count and the grid
   * disagree the moment a card is removed.
   */
  unsavedIds: ReadonlySet<string>;
  /** Apply an optimistic remove (true) or roll one back (false) in the parent's state. */
  onUnsavedChange: (courtId: string, unsaved: boolean) => void;
  /** Whether this viewer carries an active membership (Task 26) — unmasks a locked court. */
  viewerIsEntitled?: boolean;
}

export function SavedCourtsGrid({
  courts,
  unsavedIds,
  onUnsavedChange,
  viewerIsEntitled = false,
}: SavedCourtsGridProps) {
  const router = useRouter();
  // Mutation repo: browser-cookie path, OR server-action-backed in staging demo mode.
  const savedRepo = useMemo(() => getMutationSavedRepository(), []);

  // Membership is the LIFTED `unsavedIds` above; `items` is this island's alias for the
  // setter it drives. The visible list is derived as `courts` MINUS those ids rather than
  // being a second copy of the array — the `courts` prop is re-ordered live by SavedTabs'
  // sort control, so holding a copy would make this island fight the sort (or need a
  // `useEffect` to re-seed, which would clobber an in-flight optimistic remove). ORDER and
  // MEMBERSHIP both stay with the parent; this island only drives the writes.
  const setItems = onUnsavedChange;
  // Courts with an in-flight unsave (disables the control, prevents a double-fire).
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());

  const visible = courts.filter((court) => !unsavedIds.has(court.id));

  const handleUnsave = useCallback(
    (court: CourtSummaryDTO) => {
      if (pending.has(court.id)) return;

      // Optimistic remove + mark pending.
      setItems(court.id, true);
      setPending((prev) => new Set(prev).add(court.id));

      void savedRepo
        .unsaveCourt(court.id)
        .catch((err: unknown) => {
          // Restore the card on any failure so the list reflects the true server state.
          setItems(court.id, false);
          if (err instanceof AuthRequiredError) {
            // Session expired on a private page → sign in again (matches the server redirect).
            router.push('/signin?redirectTo=/saved');
          }
        })
        .finally(() =>
          setPending((prev) => {
            const next = new Set(prev);
            next.delete(court.id);
            return next;
          }),
        );
    },
    [pending, savedRepo, router, setItems],
  );

  // Unsaving the LAST card lands on the real empty state, not an empty stack. The Dream
  // List CTA goes with it — it promotes building a list, which the empty state already
  // does with its own CTA, and two competing invitations on an empty screen is noise.
  if (visible.length === 0) {
    return (
      <SavedEmptyState
        title="No saved courts yet."
        description="Save your favourites — they'll wait here for you."
        cta={{ href: '/map', label: 'Explore the map' }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {visible.map((court, index) => {
          const display = courtDisplay(court, viewerIsEntitled);
          const isPending = pending.has(court.id);
          const tags = court.tags.slice(0, MAX_TAG_CHIPS);

          return (
            // `relative` so the unsave control can position against this box while
            // remaining a SIBLING of the card link, never a descendant of the anchor.
            <li key={court.id} className="relative">
              <PendingCardLink
                href={`/courts/${court.slug}`}
                ariaLabel={display.name}
                className="block h-[170px] overflow-hidden rounded-[14px]"
              >
                <Image
                  src={court.heroImageUrl}
                  alt=""
                  fill
                  priority={index === 0}
                  sizes="(max-width: 768px) 100vw, 720px"
                  className="object-cover"
                />

                {/* `.img-overlay` — transparent to 40%, then to 72% black. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.72) 100%)',
                  }}
                />

                {/* Surface chip, top-left — over-image treatment, see the header note. */}
                <span className="absolute left-2.5 top-2.5 inline-flex rounded-pill border border-paper/35 bg-bone/20 px-2 py-[3px] text-[10px] font-medium text-paper backdrop-blur-sm">
                  {court.surface}
                </span>

                <span className="absolute inset-x-0 bottom-0 block px-3.5 pb-3.5 pt-4">
                  <span className="serif mb-1 block text-[19px] font-normal leading-[1.2] text-paper">
                    {display.name}
                  </span>
                  <span className="mb-2 flex items-center gap-[5px] text-paper/85">
                    <PinGlyph />
                    <span className="text-[12px]">{display.location}</span>
                  </span>
                  {tags.length > 0 ? (
                    <span className="flex flex-wrap gap-1.5">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex rounded-pill border border-paper/35 bg-bone/20 px-2.5 py-[3px] text-[11px] font-medium text-paper backdrop-blur-sm"
                        >
                          {tag}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
              </PendingCardLink>

              {/* Unsave overlay — a SIBLING of the card link, positioned over its top-right
                  (prototype line 1229). Above the link via z-index so the click unsaves
                  rather than navigating. */}
              <button
                type="button"
                onClick={() => handleUnsave(court)}
                disabled={isPending}
                aria-busy={isPending}
                aria-disabled={isPending || undefined}
                aria-label={`Unsave ${display.name}`}
                title="Unsave"
                // Fixed 32×32 box (prototype geometry) so swapping glyph ↔ spinner never reflows.
                className="absolute right-2.5 top-2.5 z-10 flex h-8 w-8 items-center justify-center rounded-pill bg-ink/45 text-bone backdrop-blur-[8px] transition-colors hover:text-paper disabled:opacity-60"
              >
                {isPending ? (
                  <InlineSpinner label={`Unsaving ${display.name}…`} className="text-paper" />
                ) : (
                  <CloseGlyph />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {/* The prototype's promo card, closing the Courts tab (lines 1247–1258). Its two
          tilted tiles are decoration drawn from courts already on screen — no extra read. */}
      <SavedDreamListCta imageUrls={visible.slice(0, 2).map((court) => court.heroImageUrl)} />
    </div>
  );
}
