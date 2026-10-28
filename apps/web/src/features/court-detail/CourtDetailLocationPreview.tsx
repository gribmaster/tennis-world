import type { ExactLocationDTO } from '@tennis/contracts';
import { CourtMap, type MapMarker } from '@/features/map';
import { PaywallTrigger } from '@/features/paywall';

// CourtDetailLocationPreview — the location block on Court Detail (Feature 11 §2),
// restyled for the v2 redesign (Feature 78). Its map engine moved off Leaflet to Google
// Maps in Feature 88 (`docs/MAP_PROVIDER_DECISION.md` §0) — see that change's §6.1 for
// why the LOCKED state below no longer mounts a live map at all.
//
// COORDINATE SAFETY (Architecture Plan §9 Risk #17) — two strictly separate paths, both
// UNCHANGED by the redesign or the map-engine migration:
//   • LOCKED / free viewer: NO live map is mounted at all (Feature 88 §6.1 — a real
//     Google map here would be a billable load for a screen with zero markers that
//     nobody can read, and blurring it would obscure Google's required attribution/logo,
//     a Maps Platform Terms violation). A non-Google decorative placeholder (a static
//     tonal gradient, no coordinates, no third-party request) sits behind the lock glyph
//     + Unlock CTA instead — visually the same soft blurred backdrop as before. No
//     coordinate, exact or approximate, reaches this state's DOM or any network request.
//   • ENTITLED viewer: `exactLocation` (from the PROTECTED
//     `GET /v1/me/courts/:slug/exact-location` endpoint — an authenticated, premium
//     read, never a public one) supplies the exact `lat`/`lng` for a single precise
//     marker, plus the server-built `directionsUrl` for the real directions link. The
//     component NEVER assembles a maps URL from coordinates itself, and never passes an
//     exact coordinate to any Google API call other than this single marker's position.
//
// `locked` and `exactLocation` are computed once at the page level (Feature 64); the
// component never derives its own lock state.
//
// LAYOUT VARIANTS (Feature 78, resized by TASK_59). The redesigns changed only the
// ARRANGEMENT, never the branching above:
//   • `variant="v2"` — the two-column arrangement both v3 prototypes draw (mobile
//     `CourtDetailScreen` ~line 745, desktop ~line 571): an equal-width map box on the
//     left (100px tall mobile, 140px desktop — TASK_59), the location text and the
//     directions button STACKED in the right column, `justify-between`. Feature 79 moved
//     the LOCKED page onto this variant too, so both readings of Court Detail render the
//     same block; only the strings and the directions control differ. TASK_59 also
//     REMOVED the dark unlock card that used to sit beside the locked map at md+ (Task
//     46) — it now lives in `CourtDetailShell`'s info panel / mobile-end slot instead
//     (see that file), and the directions/"Unlock location" button is no longer hidden
//     at md+: it shows at every size.
//   • `variant="rail"` — the original single-column block (eyebrow, 16/9 map, directions
//     button underneath). No longer used by Court Detail; kept because it is the component's
//     default and its locked branch carries its own paywall CTA.
//
// NO STREET ADDRESS. The prototype prints `court.address` (line 1108) — an invented field.
// The real data model has no `address`, and this feature does not add one (brief §6), so
// the right column shows the country · region line the rest of the app uses. A fabricated
// address next to a paywall would be worse than none.

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

function PinGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

/**
 * The LOCKED state's map-shaped backdrop (Feature 88 §6.1) — a static tonal gradient, the
 * same restrained panel `CourtMap`'s own loading state uses. NOT a map: no tiles, no
 * markers, no coordinate, no third-party request. Mounting a live Google map here just to
 * blur it would be a billable load for a screen with zero markers that conveys nothing
 * (nobody can read a blurred map), and blurring it would obscure Google's required
 * attribution/logo — a Maps Platform Terms violation. This keeps the same soft blurred
 * backdrop look the lock glyph + CTA sit on top of, without mounting anything Google.
 */
function LockedMapPlaceholder() {
  return (
    <div
      aria-hidden
      className="h-full w-full bg-gradient-to-b from-[#eef0ea] to-[#d9dcd2]"
    />
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
   * The court's public hero photo (Task 20) — threaded into the single marker this
   * component builds by hand so its pin matches every other map surface's photo-pin
   * treatment. `page.tsx` already has `court.heroImageUrl` in scope at both call sites.
   */
  heroImageUrl: string;
  /**
   * Protected exact-location payload for an ENTITLED viewer (Feature 63/64): exact
   * `lat`/`lng` (precise marker) + server-built `directionsUrl` (Get Directions).
   * `null` when locked, in mock mode, or for an unlocked court with no fetch — the
   * map then centers on the approximate geo and Get Directions falls back to inert.
   */
  exactLocation: ExactLocationDTO | null;
  /**
   * Layout only — see the header note. `"rail"` is the pre-Feature-78 single-column
   * block (the locked page keeps it); `"v2"` is the redesigned two-column block.
   */
  variant?: 'rail' | 'v2';
  /**
   * The court's public "Country · Region" line, shown beside the map in the `v2`
   * variant in place of the prototype's invented street address. Not a coordinate.
   */
  locationLine?: string;
}

export function CourtDetailLocationPreview({
  locked,
  courtName,
  approxLat,
  approxLng,
  exactLocation,
  variant = 'rail',
  locationLine,
  heroImageUrl,
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
          heroImageUrl,
        }
      : {
          id: 'approx',
          slug: '',
          name: courtName,
          lat: approxLat,
          lng: approxLng,
          state: 'featured',
          heroImageUrl,
        };

  // ── v2: the prototype's two-column Location block (TASK_59 resizes + simplifies it) ──
  if (variant === 'v2') {
    return (
      <div>
        {/* Plain heading — the prototype's `<h2>Location</h2>` (both mobile and desktop
            `CourtDetailScreen`). The address line moved into the right column below,
            matching both prototypes; it no longer rides along inside the heading. */}
        <h2 className="mb-3 text-[16px] font-semibold text-ink md:mb-3.5 md:text-[17px]">
          Location
        </h2>

        {/* Two EQUAL columns at every size (`grid-cols-2` — the previous `md:flex
            md:flex-col` here was a bug: it stacked the map above the text at md+ instead
            of placing them side by side, as both prototypes draw). */}
        <div className="grid grid-cols-2 gap-2.5 md:gap-4">
          {/* Left: the map box. TASK_59: 100px tall mobile, 140px desktop (was a single
              200px→clamp(…,480px) rule that no longer matches either prototype). */}
          <div className="h-[100px] overflow-hidden rounded-[10px] border border-hairline md:h-[140px] md:rounded-[14px]">
            {locked ? (
              <div className="relative h-full w-full">
                {/* No live map — see LockedMapPlaceholder above (Feature 88 §6.1). No
                    coordinate, exact or approximate, is present in this state. */}
                <div aria-hidden className="absolute inset-0 scale-105 blur-[6px]">
                  <LockedMapPlaceholder />
                </div>
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-bone/60 text-stone backdrop-blur-[2px]">
                  <LockGlyph />
                  <span className="text-[10px]">Unlock to reveal</span>
                </div>
              </div>
            ) : (
              // Unlocked: entitled → exact marker; otherwise → approximate marker.
              <CourtMap
                markers={marker ? [marker] : []}
                center={[marker!.lat, marker!.lng]}
                zoom={entitled ? 17 : 6}
                interactive
                className="h-full w-full"
              />
            )}
          </div>

          {/* Right: the address line over the directions button, `justify-between`
              (both prototypes). TASK_59 moved the address text OUT of the heading above
              and into this column, and shows the button at EVERY size — it used to hide
              at md+ in favor of the dark unlock card embedded in this block, which has
              moved out (see CourtDetailShell). */}
          <div className="flex flex-col justify-between">
            <div className="flex items-start gap-1.5 text-[11px] text-stone md:text-[13px]">
              <PinGlyph size={13} />
              {/* Country · region — NOT a street address; the model carries none. Locked ⇒
                  the prototype's "Address hidden" (line 1106 desktop / 755 mobile). Unlike
                  the description below, this string is fully REPLACED — nothing to reveal
                  in the DOM. */}
              <span className="leading-[1.4] md:leading-[1.5]">
                {locked ? 'Address hidden' : (locationLine ?? '')}
              </span>
            </div>

            {locked ? (
              // LOCKED: the prototype disables this button (`disabled={isLocked}`) and
              // relabels it "Unlock location". There is no `directionsUrl` for a locked
              // viewer, so it must never be a link — a link needs a destination. We keep
              // the prototype's DISABLED reading rather than making it a second paywall
              // opener: the unlock card and the action row/bar are the unlock entry
              // points, and a control sitting inside the location block reads as "give me
              // directions", which this cannot do.
              //
              // A real `disabled` attribute would drop the button out of the tab order and
              // out of most screen-reader announcements, so the user would never learn WHY
              // it is inert. Instead: `aria-disabled` (announced as unavailable, still
              // focusable), no `onClick`, and a `title` + visually-hidden explanation that
              // says what would unlock it.
              <button
                type="button"
                aria-disabled="true"
                title="Membership required to see this court's exact location"
                className="btn btn-primary mt-2 w-full !h-10 cursor-not-allowed justify-center gap-1.5 !px-4 !text-[11px] opacity-40"
              >
                <PinGlyph size={11} />
                Unlock location
                <span className="sr-only">
                  — unavailable, membership required to see this court&rsquo;s exact location
                </span>
              </button>
            ) : exactLocation?.directionsUrl ? (
              // Entitled viewer: the REAL server-built deep link, opened in a new tab.
              // Never a URL this component assembled from coordinates.
              <a
                href={exactLocation.directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary mt-2 w-full !h-10 justify-center gap-1.5 !px-4 !text-[11px]"
              >
                <PinGlyph size={11} />
                Open in Maps
              </a>
            ) : (
              // Unlocked court with no exact-location fetch, or mock mode — inert
              // placeholder, exactly as before this redesign.
              <a
                href="#"
                className="btn btn-primary mt-2 w-full !h-10 justify-center gap-1.5 !px-4 !text-[11px]"
              >
                <PinGlyph size={11} />
                Open in Maps
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── rail: the original single-column block, used by the LOCKED page (Feature 79) ─────
  return (
    <div>
      <p className="eyebrow mb-4 text-stone">Location</p>

      <div className="relative aspect-[16/9] overflow-hidden rounded-md border border-hairline">
        {locked ? (
          <>
            {/* No live map — see LockedMapPlaceholder above (Feature 88 §6.1). No
                coordinate, exact or approximate, is present in this state. */}
            <div aria-hidden className="absolute inset-0 scale-105 blur-[6px]">
              <LockedMapPlaceholder />
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
          <CourtMap
            markers={marker ? [marker] : []}
            center={[marker!.lat, marker!.lng]}
            zoom={entitled ? 17 : 6}
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
