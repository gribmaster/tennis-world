import type { CourtSummaryDTO } from '@tennis/contracts';
import { CourtMap, courtToMarker } from '@/features/map';
import { ConsultationTrigger } from '@/features/consultation';
import { SavedEmptyState } from './SavedEmptyState';

// SavedWishlistMap — the Wishlist Map tab of the Saved page (FEATURE_19 §3.3).
//
// ── FEATURE 77 TOUCHED ONLY THIS TAB'S CHROME ───────────────────────────────────────────
// The v2 redesign restyled the frame this panel sits in (its rounding matches the v2 cards,
// its CTA takes the compact `.btn` sizing the redesign uses) and nothing else. The MAP
// SURFACE and every behaviour below are deliberately untouched by that redesign. The map
// engine itself later moved off Leaflet to Google Maps (Feature 88 —
// `docs/MAP_PROVIDER_DECISION.md` §0); that was its own feature too. The tab itself stays
// — the prototype models only Courts and Collections, but a shipped feature is not deleted
// as a redesign side effect (intake §8 Q2, decided).
//
// REAL MAP (Feature 74; engine migrated to Google Maps in Feature 88): the abstract
// StylizedMapCanvas is gone. Saved courts are plotted on a real map at their
// APPROXIMATE geo.
//
// COORDINATE SAFETY — the single most important constraint here (Architecture Plan
// §9 Risk #17, FEATURE_19 §3.3 / Risk #6):
//   • Markers are positioned EXCLUSIVELY from each saved court's `approxLat`/
//     `approxLng` (via `courtToMarker`) — the always-public approximate coordinates.
//   • This component NEVER reads exact `lat`/`lng` — they are not part of the saved
//     `CourtSummaryDTO` (the protected `/v1/me/saved-courts` read masks them), so
//     there is nothing exact to leak into the DOM, props, or tooltips.
//
// The "Plan a Trip" CTA opens the shared Consultation modal (presentational only — no
// backend/CRM/email). The wishlist itself is never mutated here.

export interface SavedWishlistMapProps {
  courts: CourtSummaryDTO[];
}

export function SavedWishlistMap({ courts }: SavedWishlistMapProps) {
  if (courts.length === 0) {
    return (
      <SavedEmptyState
        title="Nothing to map yet."
        description="Save courts and we'll plot them here — the start of your next trip."
        cta={{ href: '/map', label: 'Explore the map' }}
      />
    );
  }

  // Approximate-geo markers only — one per saved court, navigable to its detail page.
  const markers = courts.map((court) => courtToMarker(court));

  return (
    <div>
      <CourtMap
        markers={markers}
        navigateOnClick
        className="h-[60vh] max-h-[500px] w-full overflow-hidden rounded-[14px] border border-mist/30"
      />

      {/* Opens the shared Consultation modal (presentational only). No mutation here. */}
      <ConsultationTrigger source="saved" className="btn btn-primary mt-4 h-11 px-5 text-[11px]">
        Plan a Trip
      </ConsultationTrigger>
    </div>
  );
}
