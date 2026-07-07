'use client';

import { useEffect, useMemo, useRef } from 'react';
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
}

/** Sensible world-ish default when there are no markers (should be rare). */
const FALLBACK_CENTER: [number, number] = [30, 10];
const FALLBACK_ZOOM = 2;

export function LeafletMapInner({
  markers,
  center,
  zoom,
  interactive = true,
  navigateOnClick = false,
}: LeafletMapInnerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const router = useRouter();

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

    return () => {
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
  }, [markers, center, zoom, interactive, navigateOnClick, router]);

  return <div ref={containerRef} className="tw-map-surface" aria-hidden={!navigateOnClick} />;
}
