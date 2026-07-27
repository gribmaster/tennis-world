/* eslint-disable no-console */
//
// Map nearest-court auto-focus verification.
//
// On the first visit to /map the app asks for the visitor's position once and, if granted,
// flies the map to the NEAREST court at zoom ~17. This script is the executable proof.
//
// It is a HYBRID harness, and deliberately so:
//
//   • BEHAVIOURAL (real assertions, real code): the nearest-court rule lives in a pure
//     module (src/features/map/geo-distance.ts — no React, no DOM, no Leaflet), so this
//     script IMPORTS IT and runs it against fixtures. Nearest-court selection, invalid
//     coordinate handling, tie-break stability, the empty case, and the proof that this is
//     true great-circle geodesy rather than a numeric/bounding-box comparison are all
//     genuinely executed here, not merely grepped for.
//
//   • SOURCE-LEVEL: the remaining requirements are about BROWSER RUNTIME lifecycle (a
//     permission prompt firing once under React Strict Mode, a user's pan pre-empting the
//     automatic recentre, no full-page loader). This repo has no DOM test runner — no
//     Jest/Vitest/Playwright/RTL is configured for apps/web; every sibling scripts/verify-*.ts
//     asserts on source text and factory wiring instead. Those checks follow that same
//     convention: they assert the SOURCE-LEVEL GUARANTEE that makes the runtime behaviour
//     true (the ref guard exists, the shared in-flight promise exists, the interaction
//     handler is wired), which is the closest deterministic, CI-safe proxy available.
//
// Covers the thirteen required verifications from the brief; each is labelled below.
//
// Run: pnpm --filter @tennis/web verify:map-autofocus
//
// Source is imported by RELATIVE path (tsx doesn't read the Next tsconfig `paths`).

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  findNearestPoint,
  haversineDistanceKm,
  isValidLatLng,
  type GeoPoint,
} from '../src/features/map/geo-distance';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');

// ── Tiny assertion harness (matches the sibling verify-*.ts scripts) ────────────────
interface CheckResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail?: string;
}
const results: CheckResult[] = [];

function record(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
  const tag = ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  ${tag}  ${name}`);
  if (!ok && detail) for (const line of detail.split('\n')) console.log(`        ${line}`);
}
function expectTrue(name: string, ok: boolean, detail?: string): void {
  record(name, ok, ok ? undefined : detail);
}

function readSrc(rel: string): string {
  const p = join(SRC, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

/** Strip `//` and block comments so "absence" checks assert against actual CODE, not the
 *  prose that explains what was deliberately avoided (these files document that heavily). */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

// ── Fixtures: real courts at real coordinates, shaped like the app's MapMarker ──────
interface Fixture extends GeoPoint {
  readonly slug: string;
}
const WIMBLEDON: Fixture = { slug: 'wimbledon', lat: 51.4342, lng: -0.2144 };
const ROLAND_GARROS: Fixture = { slug: 'roland-garros', lat: 48.847, lng: 2.253 };
const FLUSHING_MEADOWS: Fixture = { slug: 'flushing-meadows', lat: 40.75, lng: -73.845 };
const MELBOURNE_PARK: Fixture = { slug: 'melbourne-park', lat: -37.8216, lng: 145.0021 };
const COURTS: readonly Fixture[] = [WIMBLEDON, ROLAND_GARROS, FLUSHING_MEADOWS, MELBOURNE_PARK];

// Positions a visitor might open /map from.
const IN_LONDON: GeoPoint = { lat: 51.5074, lng: -0.1278 };
const IN_PARIS: GeoPoint = { lat: 48.8566, lng: 2.3522 };
const IN_MELBOURNE: GeoPoint = { lat: -37.8136, lng: 144.9631 };

async function main(): Promise<void> {
  console.log('Map audit — nearest-court auto-focus on /map\n');

  const mapExplorer = readSrc('features/map/MapExplorer.tsx');
  const leafletInner = readSrc('features/map/LeafletMapInner.tsx');
  const leafletWrapper = readSrc('features/map/LeafletMap.tsx');
  const locateControl = readSrc('features/map/MapLocateControl.tsx');
  const useGeolocation = readSrc('features/map/useGeolocation.ts');
  const geoDistance = readSrc('features/map/geo-distance.ts');
  const mapPage = readSrc('app/map/page.tsx');

  console.log('Modules');
  expectTrue('geo-distance helper exists', geoDistance.length > 0);
  expectTrue('useGeolocation hook exists', useGeolocation.length > 0);
  expectTrue('MapLocateControl exists', locateControl.length > 0);

  // ── Requirement 2 & 5: granted geolocation finds the nearest court, and that court is
  //    one of the markers actually on the map (so its marker is necessarily visible). ────
  console.log('\nReq 2 & 5: granted geolocation resolves to the nearest court (executed)');
  expectTrue(
    'a visitor in London gets Wimbledon (not Paris/NY/Melbourne)',
    findNearestPoint(COURTS, IN_LONDON)?.slug === 'wimbledon',
    `got ${findNearestPoint(COURTS, IN_LONDON)?.slug}`,
  );
  expectTrue(
    'a visitor in Paris gets Roland Garros',
    findNearestPoint(COURTS, IN_PARIS)?.slug === 'roland-garros',
    `got ${findNearestPoint(COURTS, IN_PARIS)?.slug}`,
  );
  expectTrue(
    'a visitor in Melbourne gets Melbourne Park (southern hemisphere, negative lat)',
    findNearestPoint(COURTS, IN_MELBOURNE)?.slug === 'melbourne-park',
    `got ${findNearestPoint(COURTS, IN_MELBOURNE)?.slug}`,
  );
  expectTrue(
    'the returned court is the SAME object from the input array (so it is one of the ' +
      'markers already rendered — its marker is on the map, not a re-fetched stranger)',
    findNearestPoint(COURTS, IN_LONDON) === WIMBLEDON,
  );
  expectTrue(
    'haversine matches the known London↔Paris great-circle distance (~343 km)',
    (() => {
      const km = haversineDistanceKm(IN_LONDON, IN_PARIS);
      return km > 340 && km < 346;
    })(),
    `got ${haversineDistanceKm(IN_LONDON, IN_PARIS).toFixed(1)} km`,
  );

  // ── Proof the calculation is real geodesy, not a numeric/bounding-box shortcut ───────
  console.log('\nNearest-court calculation is geographic, not numeric/string/bbox');
  expectTrue(
    'across the antimeridian the TRUE nearest wins (a naive |Δlng| comparison picks wrong)',
    (() => {
      const origin: GeoPoint = { lat: 0, lng: 179.9 };
      const acrossDateLine: Fixture = { slug: 'across', lat: 0, lng: -179.9 }; // ~22 km away
      const sameSide: Fixture = { slug: 'same-side', lat: 0, lng: 176.0 }; // ~434 km away
      // Naive numeric distance would call `across` 359.8 "units" away and `same-side` 3.9.
      const naiveWinner =
        Math.abs(origin.lng - acrossDateLine.lng) < Math.abs(origin.lng - sameSide.lng)
          ? acrossDateLine
          : sameSide;
      const actual = findNearestPoint([acrossDateLine, sameSide], origin);
      return actual?.slug === 'across' && naiveWinner.slug === 'same-side';
    })(),
  );
  expectTrue(
    'longitude degrees are correctly compressed at high latitude (1° lng ≪ 1° lat near the pole)',
    (() => {
      const origin: GeoPoint = { lat: 70, lng: 0 };
      const oneDegLng = haversineDistanceKm(origin, { lat: 70, lng: 1 });
      const oneDegLat = haversineDistanceKm(origin, { lat: 71, lng: 0 });
      return oneDegLng < oneDegLat * 0.5;
    })(),
  );
  expectTrue(
    'MapExplorer picks the nearest court via findNearestPoint (no city/region/string compare)',
    /findNearestPoint\(/.test(mapExplorer) &&
      !/\.(country|region|city|setting)\b/.test(
        stripComments(mapExplorer).split('focusNearestCourt')[1] ?? '',
      ),
  );
  expectTrue(
    'geo-distance implements the haversine formula over real lat/lng',
    /Math\.asin\(/.test(geoDistance) && /EARTH_RADIUS_KM/.test(geoDistance),
  );

  // ── Requirement 6: courts with invalid coordinates are ignored ───────────────────────
  console.log('\nReq 6: invalid-coordinate courts are ignored (executed)');
  const BROKEN = [
    { slug: 'nan', lat: Number.NaN, lng: Number.NaN },
    { slug: 'infinite', lat: Number.POSITIVE_INFINITY, lng: 0 },
    { slug: 'out-of-range-lat', lat: 999, lng: 0 },
    { slug: 'out-of-range-lng', lat: 0, lng: 480 },
    { slug: 'null-ish', lat: null as unknown as number, lng: undefined as unknown as number },
  ];
  expectTrue(
    'a broken court sitting "closest" numerically is never chosen',
    findNearestPoint([...BROKEN, WIMBLEDON], IN_LONDON)?.slug === 'wimbledon',
    `got ${findNearestPoint([...BROKEN, WIMBLEDON], IN_LONDON)?.slug}`,
  );
  expectTrue(
    'isValidLatLng rejects NaN / Infinity / out-of-range / null / undefined',
    !isValidLatLng(Number.NaN, 0) &&
      !isValidLatLng(Number.POSITIVE_INFINITY, 0) &&
      !isValidLatLng(999, 0) &&
      !isValidLatLng(0, 480) &&
      !isValidLatLng(null, undefined) &&
      isValidLatLng(51.4342, -0.2144),
  );
  expectTrue(
    'no distance is computed from invalid values (haversine returns Infinity, never NaN)',
    haversineDistanceKm({ lat: Number.NaN, lng: 0 }, WIMBLEDON) === Number.POSITIVE_INFINITY,
  );
  expectTrue(
    'findNearestPoint skips invalid points explicitly before measuring',
    /if \(!isValidLatLng\(point\?\.lat, point\?\.lng\)\) continue;/.test(geoDistance),
  );

  // ── Tie-break: first stable result from the existing dataset order ───────────────────
  console.log('\nTie-break: equal distances keep the dataset order');
  expectTrue(
    'two courts at identical coordinates → the FIRST in the array wins',
    (() => {
      const a: Fixture = { slug: 'first', lat: 51.4342, lng: -0.2144 };
      const b: Fixture = { slug: 'second', lat: 51.4342, lng: -0.2144 };
      return (
        findNearestPoint([a, b], IN_LONDON)?.slug === 'first' &&
        findNearestPoint([b, a], IN_LONDON)?.slug === 'second'
      );
    })(),
  );
  expectTrue(
    'the comparison is strict `<` (a later equal candidate cannot displace the first)',
    /if \(km < nearestKm\)/.test(geoDistance),
  );

  // ── Requirement 9: no court with valid coordinates → default viewport preserved ──────
  console.log('\nReq 9: no valid courts preserves the default map viewport');
  expectTrue('an empty court list yields null (nothing to focus)', findNearestPoint([], IN_LONDON) === null);
  expectTrue(
    'a list where EVERY court has invalid coordinates yields null',
    findNearestPoint(BROKEN, IN_LONDON) === null,
  );
  expectTrue(
    'MapExplorer bails out on a null nearest court, leaving the view untouched',
    /const nearest = findNearestPoint\([\s\S]{0,120}?\n\s*if \(!nearest\) return;/.test(mapExplorer),
  );

  // ── Requirement 1 & 10: geolocation is requested ONCE, Strict Mode included ──────────
  console.log('\nReq 1 & 10: geolocation is requested exactly once (Strict Mode safe)');
  expectTrue(
    'MapExplorer guards the automatic request with a ref flag set BEFORE the async call ' +
      '(so Strict Mode\'s double-invoked effect cannot fire a second request)',
    /if \(autoFocusStartedRef\.current\) return;\s*\n\s*autoFocusStartedRef\.current = true;/.test(
      mapExplorer,
    ),
  );
  expectTrue(
    'the automatic effect does not depend on the marker/filter state (it cannot re-arm ' +
      'when a filter or query changes)',
    (() => {
      const effect = /void focusNearestCourt\(\{ automatic: true \}\);\s*\n\s*\}, \[([^\]]*)\]\)/.exec(
        mapExplorer,
      );
      const deps = effect?.[1] ?? 'MISSING';
      return deps.trim() === 'focusNearestCourt';
    })(),
  );
  expectTrue(
    'useGeolocation shares ONE in-flight promise, so concurrent callers join the open ' +
      'request instead of opening a second browser prompt',
    /if \(inFlightRef\.current\) return inFlightRef\.current;/.test(useGeolocation) &&
      /inFlightRef\.current = request;/.test(useGeolocation),
  );
  expectTrue(
    'the in-flight slot is always released (success AND failure) so the control never sticks',
    /\.finally\(\(\) => \{[\s\S]*?inFlightRef\.current = null;[\s\S]*?setPending\(false\)/.test(
      useGeolocation,
    ),
  );
  expectTrue(
    '`locate` is a stable useCallback with no dependencies (a new identity each render ' +
      'would re-run the auto-focus effect)',
    /const locate = useCallback\(\(\): Promise<GeoPoint \| null> => \{[\s\S]*?\n\s*\}, \[\]\);/.test(
      useGeolocation,
    ),
  );
  expectTrue(
    'there is exactly ONE navigator.geolocation call site in the whole web app (auto-focus ' +
      'and the manual control share one implementation)',
    (() => {
      const inHook = (stripComments(useGeolocation).match(/navigator\.geolocation/g) ?? []).length;
      // The hook touches it twice: the support probe and the request itself.
      const elsewhere = [mapExplorer, locateControl, leafletInner, leafletWrapper, mapPage]
        .map((s) => (stripComments(s).match(/navigator\.geolocation|getCurrentPosition/g) ?? []).length)
        .reduce((a, b) => a + b, 0);
      return inHook > 0 && elsewhere === 0;
    })(),
  );
  expectTrue(
    'the manual control receives the SHARED hook state as props (it does not call ' +
      'useGeolocation a second time — it imports only the error TYPE)',
    /useGeolocation\(\)/.test(mapExplorer) &&
      !/useGeolocation\(/.test(stripComments(locateControl)) &&
      /import type \{ GeolocationError \} from '\.\/useGeolocation';/.test(locateControl) &&
      /pending=\{locating\}/.test(mapExplorer) &&
      /onLocate=\{handleLocateClick\}/.test(mapExplorer),
  );

  // ── Requirement 3 & 4: centre on that court at zoom ≈ 17 ─────────────────────────────
  console.log('\nReq 3 & 4: the map centres on the nearest court at zoom ≈ 17');
  expectTrue(
    'the focus request carries the NEAREST COURT\'s own coordinates',
    /setFocus\(\{\s*lat: nearest\.lat,\s*lng: nearest\.lng,/.test(mapExplorer),
  );
  expectTrue('the target zoom is 17', /const NEAREST_COURT_ZOOM = 17;/.test(mapExplorer));
  expectTrue(
    'the zoom is clamped to the map\'s real supported range (nearest valid zoom if 17 is out of range)',
    /Math\.min\(Math\.max\(focus\.zoom, map\.getMinZoom\(\)\), map\.getMaxZoom\(\)\)/.test(
      leafletInner,
    ),
  );
  expectTrue(
    'the move uses the current map library\'s own API (Leaflet flyTo) with a quick duration',
    /map\.flyTo\(\[focus\.lat, focus\.lng\], targetZoom, \{ duration: 0\.9 \}\)/.test(leafletInner),
  );
  expectTrue(
    'the focus is applied at most ONCE per token (no repeated refocusing after the initial move)',
    /if \(appliedFocusTokenRef\.current === focus\.token\) return;\s*\n\s*appliedFocusTokenRef\.current = focus\.token;/.test(
      leafletInner,
    ),
  );
  expectTrue(
    'the auto-focus does NOT navigate anywhere (no router call in the focus path — the ' +
      'court detail page is never opened automatically, and /map is never left). ' +
      'Marker CLICK navigation is untouched and stays outside this path.',
    (() => {
      // MapExplorer orchestrates the focus and must not route at all.
      if (/useRouter|router\.(push|replace)/.test(stripComments(mapExplorer))) return false;
      // Isolate the focus effect in the map layer and assert it only moves the view.
      const focusEffect = /\/\/ ── Apply a one-shot focus request[\s\S]*?\n  \}, \[focus, beginProgrammaticMove\]\);/.exec(
        leafletInner,
      )?.[0];
      if (!focusEffect) return false;
      return !/router\.|push\(|href/.test(stripComments(focusEffect)) && /map\.flyTo/.test(focusEffect);
    })(),
  );

  // ── Requirement 7 & 8: denial / timeout / unavailable preserve the default map ───────
  console.log('\nReq 7 & 8: denied, timed out, unavailable, unsupported → default map kept');
  expectTrue(
    'every GeolocationPositionError code is mapped (1 denied, 2 unavailable, 3 timeout)',
    /case 1:/.test(useGeolocation) && /case 3:/.test(useGeolocation) && /case 2:/.test(useGeolocation),
  );
  expectTrue(
    'an explicit request timeout is set (the request cannot hang forever)',
    /timeout: 10_000/.test(useGeolocation),
  );
  expectTrue(
    'an unsupported browser / non-secure context is handled before touching the API',
    /!\('geolocation' in navigator\)/.test(useGeolocation),
  );
  expectTrue(
    'a synchronously thrown error (Permissions-Policy block) is caught, not left unhandled',
    /try \{[\s\S]*?navigator\.geolocation\.getCurrentPosition\([\s\S]*?\} catch \{/.test(
      useGeolocation,
    ),
  );
  expectTrue(
    'locate() RESOLVES with null on failure and never rejects (no unhandled rejection)',
    /resolve\(null\)/.test(useGeolocation) && !/reject\(/.test(stripComments(useGeolocation)),
  );
  expectTrue(
    'a failed lookup returns BEFORE any setFocus, so the default centre and zoom survive',
    /const coords = await locate\(\);\s*\n(?:\s*\/\/.*\n)*\s*if \(!coords\) return;/.test(mapExplorer),
  );
  expectTrue(
    'no retry loop: nothing re-invokes locate() on failure (only an explicit user click does)',
    !/setTimeout\([^)]*locate/.test(stripComments(useGeolocation)) &&
      !/setInterval/.test(stripComments(useGeolocation)) &&
      !/setInterval|setTimeout/.test(stripComments(mapExplorer)),
  );
  expectTrue(
    'the failure message is small and local to the control (no blocking dialog/alert)',
    /role="status"/.test(locateControl) && !/alert\(|confirm\(/.test(stripComments(locateControl)),
  );

  // ── Requirement 11: a user who moves the map first keeps control ─────────────────────
  console.log('\nReq 11: manual interaction before the fix resolves cancels the auto-recentre');
  expectTrue(
    'MapExplorer tracks user control in a ref and skips the AUTOMATIC recentre when set',
    /userTookControlRef\.current = true;/.test(mapExplorer) &&
      /if \(automatic && userTookControlRef\.current\) return;/.test(mapExplorer),
  );
  expectTrue(
    'the check happens AFTER awaiting the position (covers a pan DURING the request)',
    (() => {
      const body = mapExplorer.split('const focusNearestCourt')[1] ?? '';
      const awaitAt = body.indexOf('await locate()');
      const guardAt = body.indexOf('if (automatic && userTookControlRef.current) return;');
      return awaitAt >= 0 && guardAt > awaitAt;
    })(),
  );
  expectTrue(
    'the manual control is exempt (an explicit click still works after the user has panned)',
    /focusNearestCourt\(\{ automatic: false \}\)/.test(mapExplorer),
  );
  expectTrue(
    'LeafletMapInner reports genuine user gestures (drag/zoom) upward',
    /map\.on\('dragstart', reportUserInteraction\)/.test(leafletInner) &&
      /map\.on\('zoomstart', reportIfNotProgrammatic\)/.test(leafletInner) &&
      /onUserInteraction=\{handleUserInteraction\}/.test(mapExplorer),
  );
  expectTrue(
    'the map\'s OWN moves (fitBounds/flyTo) are suppressed so they are not misread as the user',
    /beginProgrammaticMove\(\);\s*\n\s*const only = latlngs\[0\]/.test(leafletInner) &&
      /beginProgrammaticMove\(\);\s*\n(?:\s*\/\/.*\n)*\s*map\.flyTo/.test(leafletInner),
  );
  expectTrue(
    'the suppression window self-heals on a timer AND clears on moveend (a no-op setView ' +
      'that never fires moveend cannot deafen the map to real interaction forever)',
    /PROGRAMMATIC_MOVE_GRACE_MS/.test(leafletInner) &&
      /map\.on\('moveend', clearSuppression\)/.test(leafletInner),
  );
  expectTrue(
    'every Leaflet listener added for this feature is removed on unmount (no leak)',
    (() => {
      const code = stripComments(leafletInner);
      const on = (code.match(/map\.on\(/g) ?? []).length;
      const off = (code.match(/map\.off\(/g) ?? []).length;
      return on > 0 && on === off;
    })(),
  );

  // ── Requirement 12: local pending indicator, never a full-page loader ────────────────
  console.log('\nReq 12: a small local pending indicator — no full-page blocking loader');
  for (const [label, src] of [
    ['MapLocateControl', locateControl],
    ['MapExplorer', mapExplorer],
    ['LeafletMapInner', leafletInner],
    ['useGeolocation', useGeolocation],
  ] as const) {
    expectTrue(
      `${label} introduces no \`fixed inset-0\` full-viewport overlay`,
      !/fixed\s+inset-0/.test(stripComments(src)),
    );
  }
  expectTrue(
    'the pending indicator is the shared InlineSpinner on the control itself',
    /InlineSpinner/.test(locateControl) && /label="Finding the nearest court…"/.test(locateControl),
  );
  expectTrue(
    'the control follows the async-control triad (disabled + aria-busy + spinner)',
    /disabled=\{pending\}/.test(locateControl) &&
      /aria-busy=\{pending\}/.test(locateControl) &&
      /aria-label="Find the court nearest me"/.test(locateControl),
  );
  expectTrue(
    'the spinner swaps 1:1 with the glyph inside a fixed-size box (dimensions stay stable)',
    /h-9 w-9/.test(locateControl) &&
      /\{pending \? <InlineSpinner[^}]*\/> : <LocateGlyph \/>\}/.test(locateControl),
  );
  expectTrue(
    'the map keeps its own dimensions (the control is an overlay; no size/height prop changed)',
    /className="h-full w-full"/.test(mapExplorer) && /map-canvas-wrap/.test(mapExplorer),
  );
  expectTrue(
    'the LeafletMap chunk loader is unchanged (still the quiet in-frame placeholder)',
    /loading: \(\) => <MapLoading \/>/.test(leafletWrapper) &&
      !/fixed\s+inset-0/.test(stripComments(leafletWrapper)),
  );

  // ── Requirement 13: unrelated map controls stay usable ──────────────────────────────
  console.log('\nReq 13: manual map controls stay interactive throughout');
  expectTrue(
    'only the locate BUTTON is disabled while pending — nothing else takes a disabled/blocked state',
    (() => {
      const code = stripComments(locateControl);
      // Exactly one real `disabled` attribute (its `aria-disabled` mirror doesn't count),
      // and the explorer disables nothing at all.
      return (
        (code.match(/(?<!aria-)\bdisabled=/g) ?? []).length === 1 &&
        !/\bdisabled=/.test(stripComments(mapExplorer))
      );
    })(),
  );
  expectTrue(
    'the overlay wrapper is pointer-events-none (empty space beside the button never ' +
      'swallows a map drag); only the button re-enables pointer events',
    /pointer-events-none absolute/.test(locateControl) && /pointer-events-auto/.test(locateControl),
  );
  expectTrue(
    'the map is still created fully interactive (dragging/zoom/scroll wheel untouched)',
    /dragging: interactive/.test(leafletInner) && /scrollWheelZoom: interactive/.test(leafletInner),
  );
  expectTrue(
    'Leaflet\'s zoom control is still rendered (nothing was removed for the overlay)',
    /zoomControl: interactive/.test(leafletInner),
  );
  expectTrue(
    'the filter chips / search / list panel are untouched by the focus logic',
    /<MapFilterBar/.test(mapExplorer) && /<MapCourtList/.test(mapExplorer),
  );

  // ── Privacy: coordinates are in-memory only ─────────────────────────────────────────
  console.log('\nPrivacy: the visitor\'s coordinates never leave the browser session');
  for (const [label, src] of [
    ['useGeolocation', useGeolocation],
    ['MapExplorer', mapExplorer],
    ['MapLocateControl', locateControl],
    ['geo-distance', geoDistance],
    ['LeafletMapInner', leafletInner],
  ] as const) {
    const code = stripComments(src);
    expectTrue(`${label} never persists coordinates (no localStorage/sessionStorage/cookie)`,
      !/localStorage|sessionStorage|document\.cookie/.test(code));
    expectTrue(`${label} never transmits coordinates (no fetch/XHR/beacon/analytics)`,
      !/fetch\(|XMLHttpRequest|sendBeacon|gtag\(|analytics/.test(code));
  }
  expectTrue(
    'no repository / API call was added to the map screen for this feature (the nearest ' +
      'court is computed from the court data already loaded)',
    !/repositories|repository/i.test(stripComments(mapExplorer)) &&
      /repositories\.courts\.list\(\)/.test(mapPage),
  );
  expectTrue(
    'the map page still reads exactly the two court sources it always did (no new endpoint)',
    /repositories\.courts\.getMapPins\(\)/.test(mapPage) &&
      (stripComments(mapPage).match(/repositories\.\w+\./g) ?? []).length === 2,
  );
  expectTrue(
    'geo-distance stays a pure module (no React/DOM/Leaflet import and no client directive — ' +
      'it is unit-testable, as this script itself demonstrates)',
    !/from 'react'|from 'leaflet'|'use client'/.test(stripComments(geoDistance)),
  );

  // ── Coordinate-safety invariant (pre-existing, must not regress) ─────────────────────
  console.log('\nCoordinate safety: still approximate court geo only');
  expectTrue(
    'markers are still built from approxLat/approxLng (exact court lat/lng never client-side)',
    /lat: court\.approxLat/.test(readSrc('features/map/map-markers.ts')) &&
      /lng: court\.approxLng/.test(readSrc('features/map/map-markers.ts')),
  );
  expectTrue(
    'the nearest-court search runs over those same markers (no exact-coordinate source)',
    /findNearestPoint\(markersRef\.current, coords\)/.test(mapExplorer),
  );

  summarize();
}

function summarize(): void {
  const failed = results.filter((r) => !r.ok);
  console.log('\n──────────────────────────────────────────────');
  console.log(
    `Total checks: ${results.length}   Passed: ${results.length - failed.length}   Failed: ${failed.length}`,
  );
  if (failed.length) {
    console.log('\nFailing checks:');
    for (const f of failed) console.log(`  - ${f.name}`);
    console.log('\n\x1b[31mVERIFICATION FAILED\x1b[0m\n');
    process.exit(1);
  }
  console.log(
    '\n\x1b[32mVERIFICATION PASSED — nearest-court auto-focus wired as specified.\x1b[0m\n',
  );
}

main().catch((err) => {
  console.error('\n\x1b[31mHarness crashed:\x1b[0m', err);
  process.exitCode = 1;
});
