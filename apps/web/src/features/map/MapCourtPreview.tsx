'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CourtSummaryDTO } from '@tennis/contracts';
import { Badge, InlineSpinner } from '@/components/ui';
import { PendingCardLink } from '@/components/navigation';
import { courtCategoryTags, courtDisplay } from '@/components/court/court-display';
import { repositories } from '@/lib/repositories';
import { haversineDistanceKm } from './geo-distance';

// MapCourtPreview — the mobile "tap a pin" preview card (Task 27/28/29, Feature 86:
// `MapScreen`'s `selectPin`/bottom-sheet interaction in
// `new design/tennis_world_v2_standalone.html`, lines ~837–990). `position: fixed`,
// docked to the bottom of the SCREEN (just above the mobile tab bar — Task 29), as an
// ADDITIVE overlay — it does not replace the persistent horizontal CourtCard strip
// MapCourtList already renders below the canvas on mobile.
//
// TWO-STAGE SHEET (Task 28): tapping the compact card (or the drag handle) expands it in
// place — no navigation. Only "View details"/"Unlock access" and a "More courts nearby"
// pick actually navigate/reselect. `PendingCardLink` is therefore used ONLY for those, per
// the brief; the compact card body is a plain `<button>` that flips local `expanded` state.
//
// RESET ON COURT CHANGE: `MapExplorer` keys this component by `court.slug`
// (`<MapCourtPreview key={selectedCourt.slug} …>`), so tapping a different pin — or
// picking a "nearby" court below — fully remounts this component and its local state
// (`expanded`, the blurb fetch/cache) resets for free. There is no established
// reset-on-id-change pattern elsewhere in this codebase to match, so this follows React's
// own textbook solution for "reset state when an item identity changes" rather than
// inventing a manual useEffect+ref reset dance.
//
// DELIBERATE SCOPE (Task 28 explicit decisions):
//   • No "Directions" CTA — `directionsUrl` is resolved only via the PROTECTED
//     `getExactLocation` endpoint, called today only from a server component
//     (`app/courts/[slug]/page.tsx`). Wiring a client-side call to that endpoint from this
//     map preview is a real architecture decision the user explicitly deferred. Both
//     locked and unlocked CTAs here just navigate to `/courts/{slug}` — Court Detail
//     already owns Directions/Unlock.
//   • The blurb IS fetched here (`repositories.courts.getBySlug`, the same public,
//     unauthenticated, one-court read `app/courts/[slug]/page.tsx` already makes) — but
//     ONLY when the court is unlocked FOR THIS VIEWER. A masked/locked court never
//     triggers it; it shows static reassurance copy instead, matching the prototype's own
//     branch (line 913).
//   • "More courts nearby" needs no new fetch — it's computed in memory from
//     `visibleCourts` (already fetched by `/map`) via the same `haversineDistanceKm` the
//     nearest-court auto-focus feature already exports. Distances are labelled
//     approximately ("~N km") since both ends carry the ±jitter offset on `approxLat`/
//     `approxLng` — never presented as precise.
//
// PRESENTATIONAL & data-driven otherwise: renders only from `CourtSummaryDTO`s already in
// memory plus `viewerIsEntitled`. `md:hidden` guards it for mobile only as cheap insurance
// — MapExplorer never sets `selectedCourt` on desktop in the first place.

function CloseGlyph() {
  return (
    <svg
      width="12"
      height="12"
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

/** Same non-interactive heart glyph CourtCard's visual-only save affordance uses. */
function HeartGlyph() {
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
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function LockGlyph() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

/** Generic "feature included" glyph — the prototype's feature-icon row reuses ONE icon
 *  for every tag (it is not a per-tag icon set; there is no amenities field to key off). */
function FeatureGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.5 2.5L16 9.5" />
    </svg>
  );
}

/** Prototype line 95: `selected.desc.split('.')[0]+'.'`. Guards the no-period case so a
 *  short/odd blurb never gets a dangling/duplicated period appended. */
function firstSentence(text: string): string {
  const trimmed = text.trim();
  const idx = trimmed.indexOf('.');
  return idx === -1 ? trimmed : trimmed.slice(0, idx + 1);
}

const NEARBY_LIMIT = 4;

export interface MapCourtPreviewProps {
  /** The court whose preview is showing — MapExplorer sets/clears this on marker tap. */
  court: CourtSummaryDTO;
  /**
   * The same filtered set `/map` already plots (`MapExplorer`'s `visibleCourts`) — used
   * ONLY to compute "More courts nearby" in memory (approx-distance sort). No new fetch.
   */
  visibleCourts: CourtSummaryDTO[];
  /** Whether this viewer carries an active membership (Task 26) — unmasks a locked court. */
  viewerIsEntitled?: boolean;
  /** Clears the preview entirely (the ✕ control, both stages). The pin itself is untouched. */
  onClose: () => void;
  /** Replaces the selected court (a "More courts nearby" tap) — reuses MapExplorer's own
   *  `setSelectedCourt`; this component's `expanded` state resets via the parent's `key`. */
  onSelectCourt: (court: CourtSummaryDTO) => void;
}

export function MapCourtPreview({
  court,
  visibleCourts,
  viewerIsEntitled = false,
  onClose,
  onSelectCourt,
}: MapCourtPreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const display = courtDisplay(court, viewerIsEntitled);
  // The same mask condition `courtDisplay` itself applies — kept explicit here because the
  // blurb fetch and the feature-icon row gate on it directly, not on `display.locked`
  // (which deliberately stays the CONTENT flag regardless of viewer entitlement).
  const isMaskedForViewer = court.isLocked && !viewerIsEntitled;

  // ── Blurb fetch (unlocked-for-viewer only) ─────────────────────────────────────────
  const [blurb, setBlurb] = useState<string | null>(null);
  const [blurbLoading, setBlurbLoading] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!expanded || isMaskedForViewer || fetchedRef.current) return;
    fetchedRef.current = true;
    let cancelled = false;
    setBlurbLoading(true);
    repositories.courts
      .getBySlug(court.slug)
      .then((full) => {
        if (!cancelled && full) setBlurb(full.blurb);
      })
      // Decorative content, not critical path — a failed fetch just leaves the
      // description empty, no error banner (per the brief).
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setBlurbLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, isMaskedForViewer, court.slug]);

  // ── "More courts nearby" — in-memory, no fetch ─────────────────────────────────────
  const nearby = useMemo(() => {
    const origin = { lat: court.approxLat, lng: court.approxLng };
    return visibleCourts
      .filter((c) => c.slug !== court.slug)
      .map((c) => ({
        court: c,
        distanceKm: haversineDistanceKm(origin, { lat: c.approxLat, lng: c.approxLng }),
      }))
      .filter((entry) => Number.isFinite(entry.distanceKm))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, NEARBY_LIMIT);
  }, [visibleCourts, court]);

  return (
    <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-40 rounded-t-xl bg-paper shadow-card md:hidden">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close preview"
        className="absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-pill bg-ink/10 text-graphite transition-colors hover:bg-ink/20"
      >
        <CloseGlyph />
      </button>

      <div className="max-h-[70vh] overflow-y-auto">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse preview' : 'Expand preview'}
          className="flex w-full justify-center pt-2"
        >
          <span aria-hidden className="h-1 w-9 rounded-pill bg-mist" />
        </button>

        {!expanded ? (
          // ── Compact stage — tapping anywhere expands in place; no navigation. ──────
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-expanded={false}
            className="flex w-full gap-3 p-3 pr-10 text-left"
          >
            <div className="relative h-[72px] w-[88px] shrink-0 overflow-hidden rounded-lg">
              <Image src={court.heroImageUrl} alt="" fill sizes="88px" className="object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              {court.isLocked ? (
                <Badge tone="locked" className="mb-1.5">
                  <LockGlyph />
                  Locked
                </Badge>
              ) : null}
              <p className="serif truncate text-[17px] font-medium leading-tight">
                {display.name}
              </p>
              <p className="body-s mt-0.5 truncate text-stone">{display.location}</p>
              <ul className="no-scrollbar mt-1.5 flex gap-1.5 overflow-x-auto">
                {courtCategoryTags(court).map((tag) => (
                  <li key={tag} className="shrink-0">
                    <span className="inline-flex items-center whitespace-nowrap rounded-pill bg-ink/[0.06] px-2 py-[3px] text-[11px] font-medium text-graphite">
                      {tag}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </button>
        ) : (
          // ── Expanded stage — bigger photo, description, feature icons, CTA, nearby. ─
          <div className="p-3 pt-2">
            <div className="flex gap-3">
              <div className="relative h-[110px] w-[130px] shrink-0 overflow-hidden rounded-lg">
                <Image
                  src={court.heroImageUrl}
                  alt=""
                  fill
                  sizes="130px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                {court.isLocked ? (
                  <Badge tone="locked" className="mb-1.5">
                    <LockGlyph />
                    Locked
                  </Badge>
                ) : null}
                <ul className="no-scrollbar -mt-0.5 mb-1.5 flex gap-1.5 overflow-x-auto">
                  {courtCategoryTags(court).map((tag) => (
                    <li key={tag} className="shrink-0">
                      <span className="inline-flex items-center whitespace-nowrap rounded-pill bg-ink/[0.06] px-2 py-[3px] text-[11px] font-medium text-graphite">
                        {tag}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="serif truncate text-[17px] font-medium leading-tight">
                  {display.name}
                </p>
                <p className="body-s mt-0.5 truncate text-stone">{display.location}</p>
                {isMaskedForViewer ? (
                  <p className="body-s mt-1.5 leading-snug text-stone">
                    Unlock to see this court&rsquo;s full description and exact location.
                  </p>
                ) : blurbLoading ? (
                  <span className="mt-1.5 inline-block">
                    <InlineSpinner label="Loading description…" />
                  </span>
                ) : blurb ? (
                  <p className="body-s mt-1.5 leading-snug text-stone">{firstSentence(blurb)}</p>
                ) : null}
              </div>
            </div>

            {/* Feature icons — same `tags` array, unlocked-for-viewer only (matches the
                prototype's own gate; there is no separate amenities field). */}
            {!isMaskedForViewer && court.tags.length > 0 ? (
              <div className="mt-3 flex gap-2">
                {court.tags.slice(0, 4).map((tag) => (
                  <div key={tag} className="flex flex-1 flex-col items-center gap-1">
                    <span className="flex h-8 w-8 items-center justify-center rounded-pill bg-bone text-graphite">
                      <FeatureGlyph />
                    </span>
                    <span className="text-center text-[9px] leading-tight text-stone">
                      {tag}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {/* CTA — "View details" only (no Directions here, see file header); locked
                courts get "Unlock access" — both just navigate to Court Detail, which
                owns the real unlock/Directions flows. */}
            <PendingCardLink
              href={`/courts/${court.slug}`}
              ariaLabel={isMaskedForViewer ? `Unlock ${display.name}` : `View details for ${display.name}`}
              className={
                isMaskedForViewer
                  ? 'btn mt-3 w-full justify-center gap-1.5 border border-gold bg-transparent text-gold'
                  : 'btn btn-secondary mt-3 w-full justify-center'
              }
            >
              {isMaskedForViewer ? (
                <>
                  <LockGlyph /> Unlock access
                </>
              ) : (
                'View details'
              )}
            </PendingCardLink>

            {nearby.length > 0 ? (
              <div className="mt-4 border-t border-hairline pt-3">
                <p className="mb-2 text-[13px] font-medium text-ink">More courts nearby</p>
                <ul className="no-scrollbar flex gap-3 overflow-x-auto">
                  {nearby.map(({ court: nearbyCourt, distanceKm }) => {
                    const nearbyDisplay = courtDisplay(nearbyCourt, viewerIsEntitled);
                    return (
                      <li key={nearbyCourt.id} className="w-[100px] shrink-0">
                        <button
                          type="button"
                          onClick={() => onSelectCourt(nearbyCourt)}
                          className="block w-full text-left"
                        >
                          <span className="relative block h-[75px] w-full overflow-hidden rounded-md">
                            <Image
                              src={nearbyCourt.heroImageUrl}
                              alt=""
                              fill
                              sizes="100px"
                              className="object-cover"
                            />
                          </span>
                          <span className="mt-1.5 block truncate text-[12px] font-medium leading-tight text-ink">
                            {nearbyDisplay.name}
                          </span>
                          <span className="block text-[11px] text-stone">
                            ~{Math.round(distanceKm)} km
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Visual-only save heart — compact stage only (matches the prototype; the
          expanded stage's CTA row replaces it). No onClick, same non-interactive
          pattern CourtCard's `showSaved` prop uses. */}
      {!expanded ? (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-pill bg-ink/10 text-stone"
        >
          <HeartGlyph />
        </span>
      ) : null}
    </div>
  );
}
