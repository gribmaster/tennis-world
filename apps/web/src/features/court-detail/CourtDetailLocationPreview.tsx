import type { ExactLocationDTO } from '@tennis/contracts';
import { LeafletMap, type MapMarker } from '@/features/map';
import { PaywallTrigger } from '@/features/paywall';

// CourtDetailLocationPreview — the location block on Court Detail (Feature 11 §2),
// now a REAL Leaflet map (Feature 74) instead of the old abstract placeholder.
//
// COORDINATE SAFETY (Architecture Plan §9 Risk #17) — two strictly separate paths:
//   • LOCKED / free viewer: the map is centered on the ALWAYS-PUBLIC approximate geo
//     (`approxLat`/`approxLng`), rendered BLURRED and non-interactive behind the lock
//     glyph + Unlock CTA. No exact coordinate is ever sent to this state.
//   • ENTITLED viewer: `exactLocation` (from the PROTECTED
//     `GET /v1/me/courts/:slug/exact-location` endpoint — an authenticated, premium
//     read, never a public one) supplies the exact `lat`/`lng` for a single precise
//     marker, plus the server-built `directionsUrl` for the real Get Directions link.
//     Exact coords reach the client ONLY on this entitled path, exactly as the
//     endpoint intends — the public court reads that back this page still mask them.
//
// `locked` and `exactLocation` are computed once at the page level (Feature 64); the
// component never derives its own lock state.

function LockGlyph() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function ArrowGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export interface CourtDetailLocationPreviewProps {
  /** Whether the exact location is locked. Computed at the page level — see Feature 64. */
  locked: boolean;
  /** Court name — the marker's accessible label. */
  courtName: string;
  /** Always-public approximate latitude — centers the (locked or fallback) map. */
  approxLat: number;
  /** Always-public approximate longitude. */
  approxLng: number;
  /**
   * Protected exact-location payload for an ENTITLED viewer (Feature 63/64): exact
   * `lat`/`lng` (precise marker) + server-built `directionsUrl` (Get Directions).
   * `null` when locked, in mock mode, or for an unlocked court with no fetch — the
   * map then centers on the approximate geo and Get Directions falls back to inert.
   */
  exactLocation: ExactLocationDTO | null;
}

export function CourtDetailLocationPreview({
  locked,
  courtName,
  approxLat,
  approxLng,
  exactLocation,
}: CourtDetailLocationPreviewProps) {
  const entitled = !locked && exactLocation !== null;

  // The single marker to plot. Entitled → the EXACT point (premium, protected read).
  // Otherwise → the APPROXIMATE point (public). Locked state renders no marker (the
  // map sits blurred behind the CTA), so we only build one when not locked.
  const marker: MapMarker | null = locked
    ? null
    : entitled
      ? {
          id: exactLocation.courtId,
          slug: exactLocation.slug,
          name: courtName,
          lat: exactLocation.lat,
          lng: exactLocation.lng,
          state: 'exact',
        }
      : {
          id: 'approx',
          slug: '',
          name: courtName,
          lat: approxLat,
          lng: approxLng,
          state: 'featured',
        };

  return (
    <div>
      <p className="eyebrow mb-4 text-stone">Location</p>

      <div className="relative aspect-[16/9] overflow-hidden rounded-md border border-hairline">
        {locked ? (
          <>
            {/* Blurred APPROXIMATE map — real tiles, non-interactive, obscured. No exact
                coord is present in this state; the viewer sees only the rough area. */}
            <div aria-hidden className="absolute inset-0 scale-105 blur-[6px]">
              <LeafletMap
                markers={[]}
                center={[approxLat, approxLng]}
                zoom={6}
                interactive={false}
                className="h-full w-full"
              />
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bone/50 px-6 text-center text-graphite backdrop-blur-[2px]">
              <LockGlyph />
              <p className="body-m">Unlock to reveal exact location</p>
              {/* Opens the shared Paywall modal (presentational only — no Stripe here). */}
              <PaywallTrigger
                source="court-detail-location"
                className="btn btn-premium mt-1 !h-11 !px-5"
              >
                Unlock Full Access
              </PaywallTrigger>
            </div>
          </>
        ) : (
          // Unlocked: entitled → exact marker; otherwise → approximate marker.
          <LeafletMap
            markers={marker ? [marker] : []}
            center={[marker!.lat, marker!.lng]}
            zoom={entitled ? 13 : 6}
            interactive
            className="h-full w-full"
          />
        )}
      </div>

      {!locked ? (
        exactLocation?.directionsUrl ? (
          // Entitled viewer: real server-built directions deep link, new tab.
          <a
            href={exactLocation.directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary mt-3 inline-flex items-center gap-2"
          >
            Get Directions
            <ArrowGlyph />
          </a>
        ) : (
          // Unlocked court with no exact-location fetch, or mock mode — inert placeholder.
          <a href="#" className="btn btn-secondary mt-3 inline-flex items-center gap-2">
            Get Directions
            <ArrowGlyph />
          </a>
        )
      ) : null}
    </div>
  );
}
