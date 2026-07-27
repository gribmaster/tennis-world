'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import L from 'leaflet';
// Leaflet's own stylesheet. Imported HERE (a client module that is only ever loaded
// via `next/dynamic({ ssr: false })`, see LeafletMap) so it never runs during SSR.
// The app has no CSP that blocks local CSS, and we self-host it from the package —
// no external stylesheet request.
import 'leaflet/dist/leaflet.css';
import { getMapTileConfig } from './map-config';
import type { MapMarker, MapMarkerState } from './map-markers';

// LeafletMapInner — the REAL, interactive Leaflet map (Feature 74).
//
// CLIENT-ONLY. It is never imported directly by a page/feature — only through the
// `next/dynamic({ ssr: false })` wrapper in LeafletMap, because Leaflet touches
// `window`/`document` at module load and would crash Next SSR otherwise.
//
// It replaces the old abstract StylizedMapCanvas blobs with actual map tiles from an
// env-configured provider (OSM for dev; MapTiler etc. for prod — see map-config).
//
// COORDINATE SAFETY (unchanged invariant): markers are positioned from the
// always-public `approxLat`/`approxLng` the CALLER passes in as `MapMarker.lat/lng`.
// Exact `lat`/`lng` never reach this component — they stay behind the protected
// `GET /v1/me/courts/:slug/exact-location` endpoint. The map layer has no notion of
// exact geo; it only ever plots whatever approximate points it is handed.

// App palette (from tailwind.config.ts) — inlined because Leaflet builds marker DOM
// outside React, so Tailwind utility classes can't be relied on inside a divIcon.
const COLOR: Record<MapMarkerState, string> = {
  featured: '#B95C3A', // clay
  open: '#4A5D3F', // moss
  locked: '#2A2A2A', // graphite
  exact: '#B95C3A', // clay — the single entitled exact marker
};

/**
 * Build a custom `divIcon` for a marker state — a small ringed dot matching the app
 * style, with an optional soft halo for featured/exact. Deliberately NOT the default
 * blue Leaflet pin (task 8: no ugly default markers).
 */
function markerIcon(state: MapMarkerState): L.DivIcon {
  const color = COLOR[state];
  const halo = state === 'featured' || state === 'exact';
  const size = halo ? 20 : 16;
  const dot = halo ? 12 : 11;
  const html = `
    <span class="tw-map-marker" style="--mk: ${color};">
      ${halo ? '<span class="tw-map-marker__halo"></span>' : ''}
      <span class="tw-map-marker__dot" style="width:${dot}px;height:${dot}px;"></span>
    </span>`;
  return L.divIcon({
    className: 'tw-map-marker-icon',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/**
 * A one-shot request to move the view somewhere specific (the nearest-court auto-focus).
 *
 * `token` is what makes it one-shot: the focus effect remembers the last token it applied
 * and ignores any render that carries the same one, so an unrelated re-render can never
 * re-centre a map the user has since panned. A NEW token means "the caller genuinely wants
 * another focus" (e.g. the manual locate control was clicked).
 */
export interface MapFocusRequest {
  readonly lat: number;
  readonly lng: number;
  readonly zoom: number;
  readonly token: number;
}

export interface LeafletMapInnerProps {
  /** Points to plot — positioned from approximate geo only (caller's responsibility). */
  markers: MapMarker[];
  /** Explicit center [lat, lng]. Defaults to the markers' bounds/centroid. */
  center?: [number, number];
  /** Explicit zoom. Ignored when the map auto-fits to multiple markers. */
  zoom?: number;
  /** Disable all interaction (pan/zoom) — used for compact/locked previews. */
  interactive?: boolean;
  /** Navigate to `/courts/{slug}` when a marker is clicked (list/explorer maps). */
  navigateOnClick?: boolean;
  /** One-shot view move, applied once per distinct `token` (see MapFocusRequest). */
  focus?: MapFocusRequest | null;
  /**
   * Called when the USER pans/zooms the map themselves (drag, wheel, zoom control,
   * keyboard) — never for programmatic moves this component makes. Lets the caller stand
   * down an automatic recentre once the user has taken control.
   */
  onUserInteraction?: () => void;
}

/** Sensible world-ish default when there are no markers (should be rare). */
const FALLBACK_CENTER: [number, number] = [30, 10];
const FALLBACK_ZOOM = 2;

/**
 * How long after a programmatic move we keep ignoring Leaflet's ambiguous
 * `movestart`/`zoomstart` (they fire for our own `flyTo`/`fitBounds` too). The window is
 * also cleared early on `moveend`; it exists as the self-healing backstop for the case
 * where a no-op `setView` never fires `moveend` at all, which would otherwise leave user
 * interaction suppressed forever.
 */
const PROGRAMMATIC_MOVE_GRACE_MS = 1_500;

export function LeafletMapInner({
  markers,
  center,
  zoom,
  interactive = true,
  navigateOnClick = false,
  focus = null,
  onUserInteraction,
}: LeafletMapInnerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const router = useRouter();

  // Suppression window for our OWN view changes, so they are not mistaken for the user
  // grabbing the map (see PROGRAMMATIC_MOVE_GRACE_MS).
  const suppressUntilRef = useRef(0);
  const beginProgrammaticMove = useCallback(() => {
    suppressUntilRef.current = Date.now() + PROGRAMMATIC_MOVE_GRACE_MS;
  }, []);

  // Held in a ref so the map-creation effect can stay mount-only while still calling the
  // caller's latest handler.
  const onUserInteractionRef = useRef(onUserInteraction);
  useEffect(() => {
    onUserInteractionRef.current = onUserInteraction;
  }, [onUserInteraction]);

  // The last focus token actually applied — the one-shot guard.
  const appliedFocusTokenRef = useRef<number | null>(null);

  const tile = useMemo(() => getMapTileConfig(), []);

  // ── Create the map once (tile layer + interaction options). ──────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      // Restrained controls: keep a zoom control ONLY when interactive; attribution
      // stays (OSM/most providers require it) but is compact.
      zoomControl: interactive,
      attributionControl: true,
      scrollWheelZoom: interactive,
      dragging: interactive,
      doubleClickZoom: interactive,
      boxZoom: interactive,
      keyboard: interactive,
      touchZoom: interactive,
      // No default fade so the restrained look settles quickly.
      fadeAnimation: true,
    });

    L.tileLayer(tile.tileUrl, {
      attribution: tile.attribution,
      maxZoom: 19,
      // OSM's subdomains; harmless for providers that ignore {s}.
      subdomains: 'abc',
    }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // ── User-interaction detection ────────────────────────────────────────────
    // `dragstart` is unambiguous: Leaflet only fires it for a real mouse/touch drag.
    // `movestart`/`zoomstart` also fire for our own flyTo/fitBounds, so those are
    // filtered through the programmatic-move suppression window. A click on Leaflet's
    // own zoom control arrives as an unsuppressed `zoomstart` — correctly counted as
    // the user taking control.
    const reportUserInteraction = () => onUserInteractionRef.current?.();
    const reportIfNotProgrammatic = () => {
      if (Date.now() < suppressUntilRef.current) return;
      reportUserInteraction();
    };
    const clearSuppression = () => {
      suppressUntilRef.current = 0;
    };

    map.on('dragstart', reportUserInteraction);
    map.on('movestart', reportIfNotProgrammatic);
    map.on('zoomstart', reportIfNotProgrammatic);
    map.on('moveend', clearSuppression);

    return () => {
      map.off('dragstart', reportUserInteraction);
      map.off('movestart', reportIfNotProgrammatic);
      map.off('zoomstart', reportIfNotProgrammatic);
      map.off('moveend', clearSuppression);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // Tile config + interactivity are effectively static per mount; markers are
    // handled in a separate effect so re-filtering never re-creates the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── (Re)draw markers + fit the view whenever the marker set changes. ─────────
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    const latlngs: L.LatLngExpression[] = [];
    for (const m of markers) {
      const marker = L.marker([m.lat, m.lng], {
        icon: markerIcon(m.state),
        title: m.name,
        alt: m.name,
        keyboard: false,
        // Non-interactive previews shouldn't offer clickable markers.
        interactive: interactive || navigateOnClick,
      });
      if (navigateOnClick) {
        marker.on('click', () => router.push(`/courts/${m.slug}`));
      }
      marker.addTo(layer);
      latlngs.push([m.lat, m.lng]);
    }

    // View: explicit center/zoom wins; else fit to markers; else world fallback.
    // This is OUR move, not the user's — suppress the interaction report it would trigger.
    beginProgrammaticMove();
    const only = latlngs[0];
    if (center) {
      map.setView(center, zoom ?? 6);
    } else if (latlngs.length === 1 && only) {
      map.setView(only, zoom ?? 6);
    } else if (latlngs.length > 1) {
      map.fitBounds(L.latLngBounds(latlngs), { padding: [48, 48], maxZoom: 6 });
    } else {
      map.setView(FALLBACK_CENTER, FALLBACK_ZOOM);
    }
    // Recompute size in case the container was hidden (tab) when created.
    map.invalidateSize();
  }, [markers, center, zoom, interactive, navigateOnClick, router, beginProgrammaticMove]);

  // ── Apply a one-shot focus request (nearest-court auto-focus / manual locate). ─
  //
  // Runs ONCE per distinct `focus.token`. Any re-render carrying an already-applied token
  // is a no-op, so this can never fight the user for control of the viewport, and it never
  // re-runs "on every render" or when the filter set changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    if (appliedFocusTokenRef.current === focus.token) return;
    appliedFocusTokenRef.current = focus.token;

    // Honour the map's real zoom range rather than assuming the requested level exists
    // (the tile layer caps at 19; a different provider could cap lower).
    const targetZoom = Math.min(Math.max(focus.zoom, map.getMinZoom()), map.getMaxZoom());

    beginProgrammaticMove();
    // Smooth but quick — a short flyTo reads as "the map moved you here" without the long
    // cinematic swoop of the default duration.
    map.flyTo([focus.lat, focus.lng], targetZoom, { duration: 0.9 });
  }, [focus, beginProgrammaticMove]);

  return <div ref={containerRef} className="tw-map-surface" aria-hidden={!navigateOnClick} />;
}
