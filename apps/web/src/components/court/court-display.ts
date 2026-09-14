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

import type { CourtSummaryDTO } from '@tennis/contracts';

/** The masked-or-real strings a card/row/marker renders for one court. */
export interface CourtDisplay {
  /** Court name, or the locked placeholder. */
  readonly name: string;
  /** "Country · Region", or the locked placeholder. */
  readonly location: string;
  /** First experience tag (the single chip the prototype shows), or the locked label. */
  readonly chip: string;
  /** Whether the premium badge/teaser treatment applies. */
  readonly locked: boolean;
}

/** The unmasked "Country · Region" line — the location format every surface uses. */
export function courtLocation(court: CourtSummaryDTO): string {
  return [court.country, court.region].filter(Boolean).join(' · ');
}

/**
 * Resolve what to display for one court, applying the locked mask.
 *
 * The chip falls back to the court's `setting` when it carries no tags, so a card never
 * renders an empty chip (the prototype's `c.labels[0]` assumes every court has at least
 * one label; the real `tags` array is allowed to be empty).
 */
export function courtDisplay(court: CourtSummaryDTO): CourtDisplay {
  if (court.isLocked) {
    return {
      name: 'Premium Court',
      location: 'Unlock to reveal location',
      chip: 'Premium',
      locked: true,
    };
  }
  return {
    name: court.name,
    location: courtLocation(court),
    chip: court.tags[0] ?? court.setting,
    locked: false,
  };
}
