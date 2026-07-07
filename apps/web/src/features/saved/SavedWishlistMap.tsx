import type { CourtSummaryDTO } from '@tennis/contracts';
import { LeafletMap, courtToMarker } from '@/features/map';
import { ConsultationTrigger } from '@/features/consultation';
import { SavedEmptyState } from './SavedEmptyState';

// SavedWishlistMap — the Wishlist Map tab of the Saved page (FEATURE_19 §3.3).
//
// REAL MAP (Feature 74): the abstract StylizedMapCanvas is gone. Saved courts are
// plotted on a real Leaflet map (env-configured tiles) at their APPROXIMATE geo.
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
      <LeafletMap
        markers={markers}
        navigateOnClick
        className="h-[60vh] max-h-[500px] w-full rounded-md border border-hairline"
      />

      {/* Opens the shared Consultation modal (presentational only). No mutation here. */}
      <ConsultationTrigger source="saved" className="btn btn-primary mt-5">
        Plan a Trip
      </ConsultationTrigger>
    </div>
  );
}
