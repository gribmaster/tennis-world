'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useRouter } from 'next/navigation';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { MarkerClusterer, SuperClusterAlgorithm } from '@googlemaps/markerclusterer';
import type { Cluster, ClusterStats, Renderer } from '@googlemaps/markerclusterer';
import { getGoogleMapsConfig } from './map-config';
import type { MapMarker, MapMarkerState } from './map-markers';

// CourtMapInner — the REAL, interactive Google Maps engine (Feature 88).
//
// Replaces the Leaflet engine from Feature 74 — see docs/MAP_PROVIDER_DECISION.md §0 for
// the dated, superseding decision (this reverses Feature 74's "no Google Maps" call).
//
// CLIENT-ONLY. It is never imported directly by a page/feature — only through the
// `next/dynamic({ ssr: false })` wrapper in CourtMap, because the Maps JS API touches
// `window`/`document` and needs the browser just as Leaflet did.
//
// VARIANT B (decided, Feature 88 §1 — not open for reconsideration): a Map ID
// (`NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`) styled in Google Cloud Console + `AdvancedMarkerElement`
// for markers, NOT JSON `styles` + the legacy `Marker` class. Setting `mapId` makes a
// `styles` option inert, so this file never sets one — the map's visual style lives in
// Cloud Console, not in this repository (documented in MAP_PROVIDER_DECISION.md §0).
//
// COORDINATE SAFETY (unchanged invariant): markers are positioned from the always-public
// `approxLat`/`approxLng` the CALLER passes in as `MapMarker.lat/lng`. Exact `lat`/`lng`
// never reach this component — they stay behind the protected
// `GET /v1/me/courts/:slug/exact-location` endpoint. This component has no notion of exact
// geo; it only ever plots whatever approximate (or, for the one entitled marker Court
// Detail builds, exact) point the caller hands it — and it makes no Places, Geocoding, or
// Directions call of its own, so no coordinate this component receives is ever sent to any
// Google API beyond the single marker position placed on the map itself.

// App palette (from tailwind.config.ts) — inlined because marker content is built as a
// plain DOM element outside React, so Tailwind utility classes can't be relied on inside it.
const COLOR: Record<MapMarkerState, string> = {
  featured: '#B95C3A', // clay
  open: '#4A5D3F', // moss
  locked: '#2A2A2A', // graphite
  exact: '#B95C3A', // clay — the single entitled exact marker
};

interface GoogleMapsLibraries {
  readonly Map: typeof google.maps.Map;
  readonly AdvancedMarkerElement: typeof google.maps.marker.AdvancedMarkerElement;
}

// Module-level so every mount (the /map explorer, the Saved Wishlist map, unlocked Court
// Detail) shares the SAME load — @googlemaps/js-api-loader's `importLibrary` dedupes the
// script tag internally, and caching the resulting promise here too means a second mount
// doesn't even re-invoke it, it just awaits the one already in flight (or resolved).
//
// `@googlemaps/js-api-loader` v2 deprecated the `Loader` class in favour of this
// standalone `setOptions`/`importLibrary` pair (the modern, documented API — the `Loader`
// class in v2 is a no-op stub kept only for migration).
let librariesPromise: Promise<GoogleMapsLibraries> | null = null;

function loadGoogleMapsLibraries(apiKey: string): Promise<GoogleMapsLibraries> {
  if (!librariesPromise) {
    setOptions({ key: apiKey, v: 'weekly' });
    librariesPromise = Promise.all([importLibrary('maps'), importLibrary('marker')]).then(
      ([mapsLib, markerLib]) => ({
        Map: mapsLib.Map,
        AdvancedMarkerElement: markerLib.AdvancedMarkerElement,
      }),
    );
  }
  return librariesPromise;
}

// Same file public/placeholders fallback CourtImage.tsx and gallery-context.tsx already use
// when a court has no photo — duplicated here (not imported) the same way those two already
// duplicate it rather than share one constant across features.
const FALLBACK_HERO_IMAGE = '/placeholders/ben-hershey-K9HgyI3qmqA-unsplash.jpg';

// Widths Next's `/_next/image` optimizer will actually serve. `apps/web/next.config.mjs`
// does not override `images.imageSizes`, so this mirrors Next 15's own default bucket list
// — the endpoint 400s on any `w` outside `images.imageSizes` ∪ `images.deviceSizes`, so a
// pin's requested width must land on one of these rather than an arbitrary retina target.
// Keep in sync with next.config.mjs if that default is ever overridden there.
const NEXT_IMAGE_WIDTHS = [16, 32, 48, 64, 96, 128, 256, 384];

/**
 * Build a `/_next/image?url=…&w=…&q=…` request for a marker photo — the same optimizer
 * endpoint `next/image` calls under the hood, hit manually because this DOM node is built
 * with `document.createElement` outside React (`next/image` itself needs a React tree).
 * Requests roughly 2x `renderedPx` for retina screens, snapped up to the nearest width the
 * optimizer will actually serve, so a full-size source photo isn't downloaded in full for a
 * ~44px pin — multiplied by however many markers are on screen.
 */
function optimizedPinImageUrl(heroImageUrl: string, renderedPx: number): string {
  const src = heroImageUrl || FALLBACK_HERO_IMAGE;
  const target = renderedPx * 2;
  const width =
    NEXT_IMAGE_WIDTHS.find((w) => w >= target) ?? NEXT_IMAGE_WIDTHS[NEXT_IMAGE_WIDTHS.length - 1];
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=70`;
}

/**
 * Build the custom marker content for a marker state — a photo pin (Task 20) ringed in the
 * court's state color, with an optional soft halo for featured/exact behind it. Deliberately
 * NOT Google's default red pin (task 8: no ugly default markers), and not a plain colored
 * dot either (Task 20 replaced that with the court's own hero photo, keeping the state
 * signal as the ring color instead of the fill): `AdvancedMarkerElement.content` takes a
 * real `HTMLElement`, so the existing `.tw-map-marker*` CSS applies unchanged.
 */
function markerContent(
  state: MapMarkerState,
  name: string,
  clickable: boolean,
  heroImageUrl: string,
): HTMLElement {
  const color = COLOR[state];
  const halo = state === 'featured' || state === 'exact';
  // Wrapper (== halo diameter when present) vs. the photo circle itself — the halo needs
  // visible room around the photo, same relationship the old size/dot pair had.
  const size = halo ? 56 : 44;
  const pin = halo ? 44 : 40;

  const wrapper = document.createElement('span');
  wrapper.className = 'tw-map-marker-icon';
  // `<span>` defaults to `display: inline`, and an inline element ignores an explicit
  // `width`/`height` entirely (CSS §10.3.1) — the box collapses to its content's intrinsic
  // size instead. That silently broke the anchor fix below: `translateY(50%)` is a
  // percentage of THIS element's own resolved height, so on the collapsed (wrong) box it
  // computed to translateY(0) instead of the intended half-height offset, AND it left
  // Google's own wrapping `<gmp-advanced-marker>` (which auto-sizes to match `content`'s
  // rendered box) undersized too — verified on-screen: the dot rendered a few px above the
  // true point. `inline-block` is enough to make the box (and the percentage transform
  // computed from it) honour the width/height set below. The photo pin (Task 20) reuses
  // this exact pattern for its own new element for the same reason — see CLAUDE.md's note
  // not to assume a new div/img is safe by default without checking its computed box.
  wrapper.style.display = 'inline-block';
  wrapper.style.width = `${size}px`;
  wrapper.style.height = `${size}px`;
  // AdvancedMarkerElement anchors the BOTTOM-CENTER of `content` at the marker's LatLng by
  // default. Shifting the whole box down by half its own height re-centers it on the point
  // instead — the same centered anchor Leaflet's `iconAnchor: [size / 2, size / 2]` gave us.
  wrapper.style.transform = 'translateY(50%)';
  if (clickable) wrapper.style.cursor = 'pointer';
  wrapper.title = name;
  wrapper.setAttribute('aria-label', name);

  const marker = document.createElement('span');
  marker.className = 'tw-map-marker';
  marker.style.setProperty('--mk', color);
  wrapper.appendChild(marker);

  if (halo) {
    const haloEl = document.createElement('span');
    haloEl.className = 'tw-map-marker__halo';
    marker.appendChild(haloEl);
  }

  // The photo circle. Also `inline-block` + explicit width/height for the same reason as
  // the wrapper above — it is the box `object-fit: cover` and the border-ring clip both
  // depend on.
  const photo = document.createElement('span');
  photo.className = 'tw-map-marker__photo';
  photo.style.display = 'inline-block';
  photo.style.width = `${pin}px`;
  photo.style.height = `${pin}px`;
  marker.appendChild(photo);

  const img = document.createElement('img');
  img.src = optimizedPinImageUrl(heroImageUrl, pin);
  // Decorative: `wrapper.title`/`aria-label` above already carry the court name as this
  // marker's one accessible name — an alt here would double-announce it (the same "alt
  // describes the photograph, not a masked surface" reasoning as CourtDetailGalleryStrip,
  // just inverted: here the photo needs no alt at all because it isn't the accessible name).
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  // A court with no photo (heroImageUrl === '') already requested the fallback image above;
  // this covers the rarer case of the REQUEST itself failing (a broken/expired URL) so the
  // pin never shows a broken-image glyph.
  let usedFallback = false;
  img.onerror = () => {
    if (usedFallback) return;
    usedFallback = true;
    img.src = optimizedPinImageUrl(FALLBACK_HERO_IMAGE, pin);
  };
  photo.appendChild(img);

  return wrapper;
}

/**
 * Build the custom cluster badge content — a rounded pill showing the grouped-court count,
 * the same "custom DOM content on an AdvancedMarkerElement" treatment as `markerContent()`
 * above, never Google's default cluster pin. Distinct from the per-court dots on purpose
 * (a cluster isn't any one court's state): solid ink/graphite fill, bone bold count text.
 */
function clusterContent(count: number): HTMLElement {
  const label = count > 99 ? '99+' : String(count);

  const wrapper = document.createElement('span');
  wrapper.className = 'tw-map-cluster-icon';
  // Same inline-block + translateY(50%) anchor fix as markerContent() — AdvancedMarkerElement
  // anchors the bottom-center of `content`, so this re-centers the pill on its point.
  wrapper.style.display = 'inline-block';
  wrapper.style.transform = 'translateY(50%)';
  wrapper.style.cursor = 'pointer';
  wrapper.title = `${count} courts`;
  wrapper.setAttribute('aria-label', `${count} courts`);

  const badge = document.createElement('span');
  badge.className = 'tw-map-cluster';

  const countEl = document.createElement('span');
  countEl.className = 'tw-map-cluster__count';
  countEl.textContent = label;
  badge.appendChild(countEl);

  wrapper.appendChild(badge);
  return wrapper;
}

/**
 * The MarkerClusterer `Renderer` — turns a `Cluster` into the custom badge above. Built as
 * an `AdvancedMarkerElement` (never the legacy `Marker`/default pin), matching variant B
 * (Feature 88 §1) the same way the individual court markers do.
 */
function createClusterRenderer(
  AdvancedMarkerElement: typeof google.maps.marker.AdvancedMarkerElement,
): Renderer {
  return {
    render(cluster: Cluster, _stats: ClusterStats) {
      return new AdvancedMarkerElement({
        position: cluster.position,
        content: clusterContent(cluster.count),
        zIndex: 1000 + cluster.count,
      });
    },
  };
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

export interface CourtMapInnerProps {
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
  /**
   * Called instead of navigating when a marker is clicked (Task 27's tap-to-preview). When
   * provided, this component does NOT navigate internally — the caller decides what a
   * marker click means (e.g. MapExplorer routes it to a preview sheet on mobile, straight
   * navigation on desktop). `navigateOnClick` is ignored while this is set.
   */
  onMarkerClick?: (marker: MapMarker) => void;
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
const FALLBACK_CENTER: google.maps.LatLngLiteral = { lat: 30, lng: 10 };
const FALLBACK_ZOOM = 2;
/** The map's enforced zoom range (also the focus clamp's bounds below — the Maps JS API
 *  has no `getMinZoom`/`getMaxZoom` query to read it back, unlike Leaflet). 19 mirrors the
 *  old Leaflet tile layer's own cap; 2 mirrors the fallback world view. */
const MIN_ZOOM = 2;
const MAX_ZOOM = 19;
const FIT_BOUNDS_MAX_ZOOM = 6;
const FIT_BOUNDS_PADDING_PX = 48;

/**
 * How long after a programmatic move we keep ignoring Google's ambiguous
 * `center_changed`/`zoom_changed` (they fire for our own moves too, including every frame
 * of the composed camera animation below). The window is also cleared early on `idle`; it
 * exists as the self-healing backstop for the case where a no-op move never fires `idle`
 * at all, which would otherwise leave user interaction suppressed forever.
 */
const PROGRAMMATIC_MOVE_GRACE_MS = 1_500;

/**
 * The visual duration of the composed pan+zoom camera animation that stands in for
 * Leaflet's `flyTo` (Feature 88 §4 — Google's `panTo` animates pan only; there is no
 * built-in combined animated camera move). Same length as the old `flyTo` so a focus move
 * still reads as "the map took me here" rather than an instant jump or a long swoop.
 */
const CAMERA_ANIMATION_MS = 900;

/**
 * Animate `map`'s center + zoom together to `toCenter`/`toZoom` over `durationMs`, using
 * `moveCamera` inside a `requestAnimationFrame` loop (Google's own documented pattern for a
 * composed camera move — there is no single built-in method that animates both at once).
 * `rafRef` lets a new focus request cancel an animation already in flight.
 */
function animateCamera(
  map: google.maps.Map,
  rafRef: MutableRefObject<number | null>,
  toCenter: google.maps.LatLngLiteral,
  toZoom: number,
  durationMs: number,
): void {
  if (rafRef.current !== null) {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }

  const fromCenter = map.getCenter();
  const startLat = fromCenter?.lat() ?? toCenter.lat;
  const startLng = fromCenter?.lng() ?? toCenter.lng;
  const startZoom = map.getZoom() ?? toZoom;
  const dLat = toCenter.lat - startLat;
  const dLng = toCenter.lng - startLng;
  const dZoom = toZoom - startZoom;
  const start = performance.now();

  const step = (now: number) => {
    const t = Math.min(1, (now - start) / durationMs);
    // easeOutCubic — a quick, decelerating move, close to the feel of the old flyTo
    // without needing Leaflet's own easing curve.
    const eased = 1 - (1 - t) ** 3;
    map.moveCamera({
      center: { lat: startLat + dLat * eased, lng: startLng + dLng * eased },
      zoom: startZoom + dZoom * eased,
    });
    if (t < 1) {
      rafRef.current = requestAnimationFrame(step);
    } else {
      rafRef.current = null;
    }
  };
  rafRef.current = requestAnimationFrame(step);
}

export function CourtMapInner({
  markers,
  center,
  zoom,
  interactive = true,
  navigateOnClick = false,
  onMarkerClick,
  focus = null,
  onUserInteraction,
}: CourtMapInnerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const advancedMarkerCtorRef = useRef<typeof google.maps.marker.AdvancedMarkerElement | null>(
    null,
  );
  const markerInstancesRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const cameraAnimationRef = useRef<number | null>(null);
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

  const config = useMemo(() => getGoogleMapsConfig(), []);

  // Google's map loads ASYNCHRONOUSLY (unlike `L.map()`, which was synchronous), so the
  // marker/focus effects below can run before `mapRef.current` exists. Each keeps its
  // latest draw function in a ref; once the map finishes loading, the mount effect calls
  // both refs once to apply whatever the latest props already were.
  const drawMarkersRef = useRef<() => void>(() => {});
  const applyFocusRef = useRef<() => void>(() => {});

  // ── Create the map once (load the JS API, then construct it). ────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!config.apiKey || !config.mapId) {
      // eslint-disable-next-line no-console
      console.error(
        '[CourtMap] NEXT_PUBLIC_GOOGLE_MAPS_API_KEY / NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID are ' +
          'not set — the map cannot render. See apps/web/.env.example.',
      );
      return;
    }

    let cancelled = false;
    const container = containerRef.current;

    void loadGoogleMapsLibraries(config.apiKey).then(({ Map, AdvancedMarkerElement }) => {
      if (cancelled || !container) return;

      const map = new Map(container, {
        mapId: config.mapId,
        center: FALLBACK_CENTER,
        zoom: FALLBACK_ZOOM,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        // Restrained controls: keep a zoom control ONLY when interactive. Google draws its
        // own required attribution/logo, which is not removable and deliberately not
        // restyled — see docs/MAP_PROVIDER_DECISION.md §0.
        zoomControl: interactive,
        gestureHandling: interactive ? 'auto' : 'none',
        draggable: interactive,
        scrollwheel: interactive,
        disableDoubleClickZoom: !interactive,
        keyboardShortcuts: interactive,
        // No map type/street view/rotate/scale chrome — matches the restrained single
        // zoom-control look the Leaflet layer had; Leaflet never had these to begin with.
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        rotateControl: false,
        scaleControl: false,
      });

      advancedMarkerCtorRef.current = AdvancedMarkerElement;
      mapRef.current = map;

      // One clusterer per map, built once — mutating its marker set on redraw (rather than
      // constructing a fresh instance every drawMarkers() call) avoids rebuilding its
      // internal renderer state on every filter change. SuperClusterAlgorithm wraps the
      // same `supercluster` engine Airbnb's own map clustering is built on; library
      // defaults are used as-is (no radius/maxZoom tuning) per Task 19 §5.
      clustererRef.current = new MarkerClusterer({
        map,
        algorithm: new SuperClusterAlgorithm({}),
        renderer: createClusterRenderer(AdvancedMarkerElement),
        // Default onClusterClick (map.fitBounds(cluster.bounds)) is left as-is — deliberately
        // NOT wrapped in beginProgrammaticMove(); see Task 19 §3: a cluster click is a real,
        // deliberate user gesture (the same precedent as a zoom-control click), so it should
        // report through the existing center_changed/zoom_changed listeners like any other
        // manual zoom and correctly stand down the automatic nearest-court recentre.
      });

      // ── User-interaction detection ──────────────────────────────────────────
      // `dragstart` is unambiguous: it only fires for a real mouse/touch drag.
      // `center_changed`/`zoom_changed` also fire for our own moves (setCenter/setZoom/
      // fitBounds/the camera animation), so those are filtered through the
      // programmatic-move suppression window. A click on Google's own zoom control
      // arrives as an unsuppressed `zoom_changed` — correctly counted as the user taking
      // control.
      const reportUserInteraction = () => onUserInteractionRef.current?.();
      const reportIfNotProgrammatic = () => {
        if (Date.now() < suppressUntilRef.current) return;
        reportUserInteraction();
      };
      const clearSuppression = () => {
        // While a camera animation is actively requesting frames, `idle` can fire BETWEEN
        // frames (the map briefly settles mid-animation) — clearing the window there would
        // let every remaining frame's center_changed/zoom_changed be reported as a genuine
        // user gesture. Leave the window intact until the animation itself is done; the
        // animation's own end (or the grace window's own timeout) is what should let the
        // NEXT idle clear it.
        if (cameraAnimationRef.current !== null) return;
        suppressUntilRef.current = 0;
      };

      // Removed on unmount via `google.maps.event.clearInstanceListeners(map)` below —
      // that single call releases every listener registered on this map instance, so
      // there is no separate handle-tracking array to keep in sync.
      map.addListener('dragstart', reportUserInteraction);
      map.addListener('center_changed', reportIfNotProgrammatic);
      map.addListener('zoom_changed', reportIfNotProgrammatic);
      map.addListener('idle', clearSuppression);

      // Apply whatever the latest markers/focus props already were while the API loaded.
      drawMarkersRef.current();
      applyFocusRef.current();
    });

    return () => {
      cancelled = true;
      if (cameraAnimationRef.current !== null) {
        cancelAnimationFrame(cameraAnimationRef.current);
        cameraAnimationRef.current = null;
      }
      const map = mapRef.current;
      // Tear down the clusterer before the map's own listeners are cleared, so its
      // internal onRemove() (releasing its own `idle` listener, clearing its markers) runs
      // cleanly rather than racing clearInstanceListeners below.
      clustererRef.current?.setMap(null);
      clustererRef.current = null;
      if (map) {
        // No `map.remove()` equivalent in the Maps JS API — release listeners, drop the
        // markers, and null the refs; the container itself is removed by React unmounting
        // this component's DOM.
        google.maps.event.clearInstanceListeners(map);
      }
      for (const marker of markerInstancesRef.current) marker.map = null;
      markerInstancesRef.current = [];
      mapRef.current = null;
      advancedMarkerCtorRef.current = null;
    };
    // Map ID + interactivity are effectively static per mount; markers/focus are handled
    // in the effects below so re-filtering never re-creates the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── (Re)draw markers + fit the view whenever the marker set changes. ─────────
  const drawMarkers = useCallback(() => {
    const map = mapRef.current;
    const AdvancedMarkerElement = advancedMarkerCtorRef.current;
    const clusterer = clustererRef.current;
    if (!map || !AdvancedMarkerElement || !clusterer) return;

    clusterer.clearMarkers();
    markerInstancesRef.current = [];

    const clickable = interactive || navigateOnClick || Boolean(onMarkerClick);
    const points: google.maps.LatLngLiteral[] = [];
    const advancedMarkers: google.maps.marker.AdvancedMarkerElement[] = [];
    for (const m of markers) {
      const position = { lat: m.lat, lng: m.lng };
      const advancedMarker = new AdvancedMarkerElement({
        position,
        content: markerContent(m.state, m.name, clickable, m.heroImageUrl ?? ''),
        gmpClickable: clickable,
      });
      if (onMarkerClick) {
        advancedMarker.addListener('gmp-click', () => onMarkerClick(m));
      } else if (navigateOnClick) {
        advancedMarker.addListener('gmp-click', () => router.push(`/courts/${m.slug}`));
      }
      advancedMarkers.push(advancedMarker);
      markerInstancesRef.current.push(advancedMarker);
      points.push(position);
    }
    // Hand the built markers to the clusterer instead of setting `.map` directly — it
    // decides per-marker visibility (a lone pin once zoomed in enough to stand alone,
    // hidden behind a cluster badge otherwise). The `gmp-click` listener already attached
    // above keeps working once a marker is shown on its own: the clusterer only ever
    // toggles `.map`, it never touches listeners.
    clusterer.addMarkers(advancedMarkers);

    // View: explicit center/zoom wins; else fit to markers; else world fallback.
    // This is OUR move, not the user's — suppress the interaction report it would trigger.
    beginProgrammaticMove();
    const only = points[0];
    if (center) {
      map.setCenter({ lat: center[0], lng: center[1] });
      map.setZoom(zoom ?? 6);
    } else if (points.length === 1 && only) {
      map.setCenter(only);
      map.setZoom(zoom ?? 6);
    } else if (points.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      for (const point of points) bounds.extend(point);
      map.fitBounds(bounds, FIT_BOUNDS_PADDING_PX);
      // fitBounds has no built-in maxZoom — clamp once the resulting move settles.
      //
      // Race guarded against: `applyFocus()` (nearest-court auto-focus / manual locate) can
      // start its own animated camera move before the map reaches its first post-fitBounds
      // `idle` — the map only goes idle once THAT animation stops requesting frames, so this
      // one-shot callback can fire AFTER a focus has already landed the view at its own
      // (intentionally larger) zoom. Snapshot the focus token at arm time and bail if a newer
      // one has landed since: a focus that lands after this clamp was armed wins outright,
      // while a filter change with no focus involved still clamps exactly as before (the
      // token is unchanged, so the check passes through).
      const armedFocusToken = appliedFocusTokenRef.current;
      google.maps.event.addListenerOnce(map, 'idle', () => {
        if (appliedFocusTokenRef.current !== armedFocusToken) return;
        const currentZoom = map.getZoom();
        if (currentZoom !== undefined && currentZoom > FIT_BOUNDS_MAX_ZOOM) {
          // The general `idle` listener (registered on mount, so it runs before this
          // one-shot listener added here in drawMarkers) has already cleared the
          // suppression window by the time this fires. Re-arm it immediately before our
          // own setZoom so THAT call's zoom_changed is suppressed too, rather than
          // reported as a user gesture.
          beginProgrammaticMove();
          map.setZoom(FIT_BOUNDS_MAX_ZOOM);
        }
      });
    } else {
      map.setCenter(FALLBACK_CENTER);
      map.setZoom(FALLBACK_ZOOM);
    }
  }, [
    markers,
    center,
    zoom,
    interactive,
    navigateOnClick,
    onMarkerClick,
    router,
    beginProgrammaticMove,
  ]);

  useEffect(() => {
    drawMarkersRef.current = drawMarkers;
    if (mapRef.current) drawMarkers();
  }, [drawMarkers]);

  // ── Apply a one-shot focus request (nearest-court auto-focus / manual locate). ─
  //
  // Runs ONCE per distinct `focus.token`. Any re-render carrying an already-applied token
  // is a no-op, so this can never fight the user for control of the viewport, and it never
  // re-runs "on every render" or when the filter set changes.
  const applyFocus = useCallback(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    if (appliedFocusTokenRef.current === focus.token) return;
    appliedFocusTokenRef.current = focus.token;

    // Honour the map's real zoom range rather than assuming the requested level exists.
    // The Maps JS API exposes no `getMinZoom`/`getMaxZoom` query (unlike Leaflet) — clamp
    // against the same MIN_ZOOM/MAX_ZOOM constants the map itself was constructed with.
    const targetZoom = Math.min(Math.max(focus.zoom, MIN_ZOOM), MAX_ZOOM);

    beginProgrammaticMove();
    // Composed pan+zoom animation standing in for Leaflet's flyTo (Feature 88 §4) —
    // smooth but quick, so the move reads as "the map moved you here".
    animateCamera(map, cameraAnimationRef, { lat: focus.lat, lng: focus.lng }, targetZoom, CAMERA_ANIMATION_MS);
  }, [focus, beginProgrammaticMove]);

  useEffect(() => {
    applyFocusRef.current = applyFocus;
    if (mapRef.current) applyFocus();
  }, [applyFocus]);

  return (
    <div
      ref={containerRef}
      className="tw-map-surface"
      aria-hidden={!navigateOnClick && !onMarkerClick}
    />
  );
}
