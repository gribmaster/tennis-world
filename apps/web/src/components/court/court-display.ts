// Locked-court PRESENTATION rules (Feature 74; relocated to `components/court/` in
// Task 25 once callers beyond Home needed it — see below).
//
// The prototype renders a locked court as "Premium Court" / "Unlock to reveal location"
// (design_v2_stripped.html:456, 553–559). This module is the ONE place that rule lives,
// so no card/row/marker across the app can drift apart on what "locked" looks like.
//
// THIS IS PRESENTATION, NOT A GATE. `GET /v1/courts` serves `name`, `country` and
// `region` to everyone, deliberately — the public court pages are indexable and the
// masking here is a teaser treatment, not a security boundary. The real gate is the
// exact `lat`/`lng`, which is server-side (`GET /v1/me/courts/:slug/exact-location`,
// entitlement-checked) and is untouched by this feature. So:
//   • the mask is derived from `isLocked`, a field the summary DTO already carries;
//   • no client-side entitlement check is invented here;
//   • the exact-location endpoint is never called from any of this module's callers.
// A court's real name still reaches the browser in the payload (it always did) and the
// court's own public page still shows it. Nothing is being hidden that was not already
// public.
//
// VIEWER ENTITLEMENT (Task 26): `isLocked` alone is CONTENT classification, not a
// per-viewer signal — every caller of `GET /v1/courts` gets the same value regardless of
// who's asking. Task 25 masked purely off `isLocked`, which meant even a paying member
// saw "Premium Court" everywhere except a court's own detail page (the one surface that
// checks REAL per-viewer entitlement via the exact-location endpoint). `viewerIsEntitled`
// fixes that: pass the caller's real, per-page-resolved membership signal (see
// `getViewerAuthState` in `lib/session.server.ts`) and an entitled viewer sees the real
// name/location on every surface, not just Court Detail. Defaults to `false` — the safe,
// masked default — so a call site that forgets to pass it degrades to Task 25's behavior
// rather than leaking content.

import type { CourtSummaryDTO } from '@tennis/contracts';

/** The masked-or-real strings a card/row/marker renders for one court. */
export interface CourtDisplay {
  /** Court name, or the locked placeholder. */
  readonly name: string;
  /** "Country · Region", or the locked placeholder. */
  readonly location: string;
  /**
   * Whether this is premium CONTENT (`court.isLocked`) — drives the "Premium"
   * badge/ribbon callers render over the photo. Deliberately UNAFFECTED by
   * `viewerIsEntitled`: it keeps meaning "this is one of our premium courts," which an
   * entitled viewer may still reasonably want to see (an acknowledgment of what their
   * membership unlocks), not "this is masked for you." Only `name`/`location`
   * above are gated by viewer entitlement.
   */
  readonly locked: boolean;
}

/** The unmasked "Country · Region" line — the location format every surface uses. */
export function courtLocation(court: CourtSummaryDTO): string {
  return [court.country, court.region].filter(Boolean).join(' · ');
}

/**
 * Resolve what to display for one court, applying the locked mask.
 *
 * `viewerIsEntitled` (Task 26) determines whether the mask actually applies: a locked
 * court still masks for a non-entitled viewer (the default), but shows real strings to a
 * viewer this page has determined carries an active membership. `locked` in the returned
 * `CourtDisplay` stays the CONTENT flag (`court.isLocked`) regardless — see the file
 * header and `CourtDisplay.locked`'s own doc comment.
 */
export function courtDisplay(court: CourtSummaryDTO, viewerIsEntitled = false): CourtDisplay {
  const mask = court.isLocked && !viewerIsEntitled;
  return {
    name: mask ? 'Premium Court' : court.name,
    location: mask ? 'Unlock to reveal location' : courtLocation(court),
    locked: court.isLocked,
  };
}

/**
 * The court's location/experience tag — its first `CourtTag`, if it has one — as a
 * single-element array (or empty). Kept as an array, not a plain string | undefined, so
 * every render site's existing `.map()` over this value keeps working unchanged; only the
 * SOURCE fields changed (Task 35 correction: card shows location only, not surface/access).
 * NEVER masked — see the file header and `CourtSummarySchema`'s own doc comment: tags are
 * always-public descriptive metadata, not part of the name/location teaser gate.
 */
export function courtCategoryTags(court: CourtSummaryDTO): string[] {
  return court.tags[0] ? [court.tags[0]] : [];
}
