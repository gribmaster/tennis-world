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
//     module (src/features/map/geo-distance.ts — no React, no DOM, no map library), so this
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
// FEATURE 88 (2026-09-10): the map engine migrated from Leaflet to Google Maps (Map ID +
// AdvancedMarkerElement — see docs/MAP_PROVIDER_DECISION.md §0). LeafletMapInner.tsx /
// LeafletMap.tsx were renamed to CourtMapInner.tsx / CourtMap.tsx. Every check below that
// used to assert on Leaflet-specific source text (`map.flyTo`, `map.on('dragstart', ...)`,
// `dragging: interactive`, …) has been RE-POINTED at the Google source it was ported to —
// none were deleted; each still covers the exact requirement it did before. Checks whose
// underlying MEANING changed (not just the literal it matches) are called out inline with
// a "Feature 88:" note. A new "Feature 88: Google Maps engine" section at the end adds
// checks with no Leaflet-era equivalent (Map ID / variant B, no Places/Geocoding/Directions
// call, the loader's shared-promise dedupe, the locked Court Detail preview no longer
// mounting a live map, the renamed-file/package hygiene). Baseline before this rewrite:
// 78 checks, 78 pass, 0 fail (captured on a clean tree, 2026-09-09). The Feature 88 rewrite
// added 3 module/rename checks ("Modules" section) + 9 Feature-88-specific checks ("Feature
// 88: Google Maps engine" section) = 90 total, 78+12, verified by running BOTH the old
// (Leaflet-era) and new scripts and diffing every check name position-by-position: all 78
// original checks survive 1:1 in the same relative order (only wording changed on the ones
// that talk about Leaflet-specific APIs) — none were merged or dropped.
//
// TASK 17 (2026-09-10): §1 added 2 checks for the programmatic-move suppression-window
// hardening fix (the `idle`-clears-mid-animation defect); §4's manual verification found and
// fixed a real marker-anchor defect (the wrapper `<span>` defaulted to `display: inline`,
// which silently ignored its explicit width/height and broke the translateY(50%) anchor
// compensation), covered by 1 more check → 93 checks total.
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
const WEB_ROOT = join(HERE, '..');

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

function readWebFile(rel: string): string {
  const p = join(WEB_ROOT, rel);
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
  // Feature 88: renamed from LeafletMapInner.tsx / LeafletMap.tsx.
  const courtMapInner = readSrc('features/map/CourtMapInner.tsx');
  const courtMapWrapper = readSrc('features/map/CourtMap.tsx');
  const locateControl = readSrc('features/map/MapLocateControl.tsx');
  const useGeolocation = readSrc('features/map/useGeolocation.ts');
  const geoDistance = readSrc('features/map/geo-distance.ts');
  const mapPage = readSrc('app/map/page.tsx');
  const savedWishlistMap = readSrc('features/saved/SavedWishlistMap.tsx');
  const courtDetailLocationPreview = readSrc(
    'features/court-detail/CourtDetailLocationPreview.tsx',
  );

  console.log('Modules');
  expectTrue('geo-distance helper exists', geoDistance.length > 0);
  expectTrue('useGeolocation hook exists', useGeolocation.length > 0);
  expectTrue('MapLocateControl exists', locateControl.length > 0);
  expectTrue('CourtMapInner exists (Feature 88: renamed from LeafletMapInner)', courtMapInner.length > 0);
  expectTrue('CourtMap exists (Feature 88: renamed from LeafletMap)', courtMapWrapper.length > 0);
  expectTrue(
    'the old Leaflet-named files are gone, not just superseded',
    !existsSync(join(SRC, 'features/map/LeafletMapInner.tsx')) &&
      !existsSync(join(SRC, 'features/map/LeafletMap.tsx')),
  );

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
      const elsewhere = [mapExplorer, locateControl, courtMapInner, courtMapWrapper, mapPage]
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
    'the zoom is clamped to the map\'s real supported range (nearest valid zoom if 17 is ' +
      'out of range) — Feature 88: the Maps JS API has no getMinZoom/getMaxZoom query ' +
      '(unlike Leaflet), so the clamp uses the same MIN_ZOOM/MAX_ZOOM constants the map ' +
      'was constructed with, on the same Math.min(Math.max(...)) shape',
    /const targetZoom = Math\.min\(Math\.max\(focus\.zoom, MIN_ZOOM\), MAX_ZOOM\);/.test(
      courtMapInner,
    ) &&
      /minZoom: MIN_ZOOM,/.test(courtMapInner) &&
      /maxZoom: MAX_ZOOM,/.test(courtMapInner),
  );
  expectTrue(
    'the move uses a composed pan+zoom camera animation at the same duration the old ' +
      'Leaflet flyTo used (Feature 88 §4: Google\'s panTo animates pan only, so ' +
      'CourtMapInner runs its own requestAnimationFrame loop calling map.moveCamera — ' +
      'the documented Google pattern for a combined animated camera move)',
    /const CAMERA_ANIMATION_MS = 900;/.test(courtMapInner) &&
      /requestAnimationFrame\(step\)/.test(courtMapInner) &&
      /map\.moveCamera\(\{/.test(courtMapInner) &&
      /animateCamera\(map, cameraAnimationRef, \{ lat: focus\.lat, lng: focus\.lng \}, targetZoom, CAMERA_ANIMATION_MS\)/.test(
        courtMapInner,
      ),
  );
  expectTrue(
    'the focus is applied at most ONCE per token (no repeated refocusing after the initial move)',
    /if \(appliedFocusTokenRef\.current === focus\.token\) return;\s*\n\s*appliedFocusTokenRef\.current = focus\.token;/.test(
      courtMapInner,
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
        courtMapInner,
      )?.[0];
      if (!focusEffect) return false;
      return (
        !/router\.|push\(|href/.test(stripComments(focusEffect)) &&
        /animateCamera\(/.test(focusEffect)
      );
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
    'CourtMapInner reports genuine user gestures (drag/zoom) upward — Feature 88: Google\'s ' +
      'zoom_changed replaces Leaflet\'s zoomstart as the (suppressible) zoom-gesture signal',
    /map\.addListener\('dragstart', reportUserInteraction\)/.test(courtMapInner) &&
      /map\.addListener\('zoom_changed', reportIfNotProgrammatic\)/.test(courtMapInner) &&
      /onUserInteraction=\{handleUserInteraction\}/.test(mapExplorer),
  );
  expectTrue(
    'the map\'s OWN moves (fitBounds/the camera animation) are suppressed so they are not ' +
      'misread as the user',
    /beginProgrammaticMove\(\);\s*\n\s*const only = points\[0\]/.test(courtMapInner) &&
      /beginProgrammaticMove\(\);\s*\n(?:\s*\/\/.*\n)*\s*animateCamera\(/.test(courtMapInner),
  );
  expectTrue(
    'the suppression window self-heals on a timer AND clears on idle (Feature 88: Google\'s ' +
      'moveend-equivalent) — a no-op move that never fires idle cannot deafen the map to ' +
      'real interaction forever',
    /PROGRAMMATIC_MOVE_GRACE_MS/.test(courtMapInner) &&
      /map\.addListener\('idle', clearSuppression\)/.test(courtMapInner),
  );
  expectTrue(
    'Task 17 §1: `idle` clearing the suppression window is GUARDED while a camera ' +
      'animation is in flight — otherwise an `idle` firing between animation frames (the ' +
      'focus flyTo-replacement) would zero the window mid-move and every remaining frame ' +
      'would be reported as a genuine user gesture',
    /if \(cameraAnimationRef\.current !== null\) return;\s*\n\s*suppressUntilRef\.current = 0;/.test(
      courtMapInner,
    ),
  );
  expectTrue(
    'Task 17 §1: the fitBounds zoom clamp RE-ARMS the suppression window immediately ' +
      'before its own setZoom — the general `idle` listener (registered first, so it runs ' +
      'first) has already cleared the window by the time the clamp\'s one-shot `idle` ' +
      'listener fires, so without re-arming here the clamp\'s own zoom_changed would be ' +
      'reported as a user gesture',
    /beginProgrammaticMove\(\);\s*\n\s*map\.setZoom\(FIT_BOUNDS_MAX_ZOOM\);/.test(courtMapInner),
  );
  expectTrue(
    'every lifecycle listener added for this feature is released on unmount — Feature 88: ' +
      'the Maps JS API has no per-listener map.off(); the 4 map.addListener calls ' +
      '(dragstart/center_changed/zoom_changed/idle) are released as a group by the one ' +
      'documented clearInstanceListeners(map) call in the same cleanup',
    (() => {
      const code = stripComments(courtMapInner);
      const addCount = (code.match(/map\.addListener\(/g) ?? []).length;
      return addCount === 4 && /google\.maps\.event\.clearInstanceListeners\(map\)/.test(code);
    })(),
  );

  // ── Requirement 12: local pending indicator, never a full-page loader ────────────────
  console.log('\nReq 12: a small local pending indicator — no full-page blocking loader');
  for (const [label, src] of [
    ['MapLocateControl', locateControl],
    ['MapExplorer', mapExplorer],
    ['CourtMapInner', courtMapInner],
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
    'the CourtMap chunk loader is unchanged (still the quiet in-frame placeholder)',
    /loading: \(\) => <MapLoading \/>/.test(courtMapWrapper) &&
      !/fixed\s+inset-0/.test(stripComments(courtMapWrapper)),
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
    'the map is still created fully interactive — Feature 88: gestureHandling is the ' +
      'primary Google gate (auto vs none), with draggable/scrollwheel set from the same ' +
      '`interactive` flag alongside it',
    /gestureHandling: interactive \? 'auto' : 'none',/.test(courtMapInner) &&
      /draggable: interactive,/.test(courtMapInner) &&
      /scrollwheel: interactive,/.test(courtMapInner),
  );
  expectTrue(
    'Google\'s zoom control is still rendered (nothing was removed for the overlay) — ' +
      'same `zoomControl: interactive` field name Leaflet used',
    /zoomControl: interactive,/.test(courtMapInner),
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
    ['CourtMapInner', courtMapInner],
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
    'geo-distance stays a pure module (no React/DOM/map-library import and no client ' +
      'directive — it is unit-testable, as this script itself demonstrates)',
    !/from 'react'|from 'leaflet'|from '@googlemaps|from 'google|'use client'/.test(
      stripComments(geoDistance),
    ),
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

  // ── Feature 88: Google Maps engine (no Leaflet-era equivalent) ───────────────────────
  console.log('\nFeature 88: Google Maps engine (Map ID + AdvancedMarkerElement, variant B)');
  expectTrue(
    'no leftover Leaflet import or stylesheet anywhere in the map feature',
    (() => {
      const files = [mapExplorer, courtMapInner, courtMapWrapper, savedWishlistMap, courtDetailLocationPreview];
      return files.every((f) => !/from 'leaflet'|leaflet\/dist\/leaflet\.css/.test(stripComments(f)));
    })(),
  );
  expectTrue(
    'variant B is what shipped: the map is constructed with a Map ID and AdvancedMarkerElement, ' +
      'never a JSON `styles` array (mapId makes styles inert — the two are mutually exclusive, ' +
      'decided Feature 88 §1)',
    /mapId: config\.mapId,/.test(courtMapInner) &&
      /new AdvancedMarkerElement\(/.test(courtMapInner) &&
      !/\bstyles:\s*\[/.test(stripComments(courtMapInner)),
  );
  expectTrue(
    'the Maps JS API is loaded through @googlemaps/js-api-loader\'s modern ' +
      'setOptions/importLibrary pair (v2\'s documented API — the old Loader class is a ' +
      'deprecated no-op stub in this version), and the resulting library promise is ' +
      'cached at module scope so every mount (the /map explorer, the Saved Wishlist map, ' +
      'unlocked Court Detail) shares ONE script load',
    /import \{ setOptions, importLibrary \} from '@googlemaps\/js-api-loader';/.test(courtMapInner) &&
      /let librariesPromise: Promise<GoogleMapsLibraries> \| null = null;/.test(courtMapInner) &&
      /if \(!librariesPromise\) \{/.test(courtMapInner),
  );
  expectTrue(
    'no Places, Geocoding, or Directions API call was added anywhere in the map feature — ' +
      'Feature 88 §2: the map layer only ever plots the coordinate its caller handed it',
    (() => {
      const files = [
        mapExplorer,
        courtMapInner,
        courtMapWrapper,
        savedWishlistMap,
        courtDetailLocationPreview,
        readSrc('features/map/map-markers.ts'),
      ].map(stripComments);
      const forbidden = /google\.maps\.places|google\.maps\.Geocoder|google\.maps\.DirectionsService|PlacesService|DirectionsService|Geocoder\(/;
      return files.every((f) => !forbidden.test(f));
    })(),
  );
  expectTrue(
    'directionsUrl is still rendered verbatim from the server — the web app does not ' +
      'assemble a maps URL from coordinates now that it is on Google either',
    /href=\{exactLocation\.directionsUrl\}/.test(courtDetailLocationPreview) &&
      !/directionsUrl.*\$\{.*(lat|lng)/i.test(stripComments(courtDetailLocationPreview)),
  );
  expectTrue(
    'the LOCKED Court Detail preview no longer mounts a live map at all (Feature 88 §6.1 — ' +
      'a real Google map behind a blur would be a billable load for zero markers, and ' +
      'blurring it would obscure Google\'s required attribution/logo). Exactly the two ' +
      'UNLOCKED branches (v2 + rail) still mount <CourtMap>; both LOCKED branches (v2 + ' +
      'rail) render the non-Google LockedMapPlaceholder instead',
    (() => {
      const code = stripComments(courtDetailLocationPreview);
      const courtMapMounts = (code.match(/<CourtMap\b/g) ?? []).length;
      const placeholderMounts = (code.match(/<LockedMapPlaceholder \/>/g) ?? []).length;
      return (
        courtMapMounts === 2 &&
        placeholderMounts === 2 &&
        /function LockedMapPlaceholder\(\)/.test(code)
      );
    })(),
  );
  expectTrue(
    'the env surface matches the new config: apps/web/.env.example documents ' +
      'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY + NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID and no longer ' +
      'mentions the retired Leaflet tile vars',
    (() => {
      const env = readWebFile('.env.example');
      return (
        /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=/.test(env) &&
        /NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=/.test(env) &&
        !/NEXT_PUBLIC_MAP_TILE_URL/.test(env) &&
        !/NEXT_PUBLIC_MAP_PROVIDER/.test(env)
      );
    })(),
  );
  expectTrue(
    'package.json dropped leaflet/@types/leaflet and added @googlemaps/js-api-loader + ' +
      '@types/google.maps',
    (() => {
      const pkg = readWebFile('package.json');
      return (
        !/"leaflet"\s*:/.test(pkg) &&
        !/"@types\/leaflet"\s*:/.test(pkg) &&
        /"@googlemaps\/js-api-loader"\s*:/.test(pkg) &&
        /"@types\/google\.maps"\s*:/.test(pkg)
      );
    })(),
  );
  expectTrue(
    'the marker content is a real HTMLElement carrying the .tw-map-marker* classes the CSS ' +
      'styles (a near-1:1 port of the old divIcon markup, per Feature 88 §1) — Task 20: the ' +
      'plain `.tw-map-marker__dot` was replaced by the `.tw-map-marker__photo` pin',
    /wrapper\.className = 'tw-map-marker-icon';/.test(courtMapInner) &&
      /marker\.className = 'tw-map-marker';/.test(courtMapInner) &&
      /haloEl\.className = 'tw-map-marker__halo';/.test(courtMapInner) &&
      /photo\.className = 'tw-map-marker__photo';/.test(courtMapInner),
  );
  expectTrue(
    'Task 17 §4: the marker wrapper is forced to `display: inline-block` BEFORE its ' +
      'width/height/translateY(50%) anchor compensation are set — verified on-screen: a ' +
      'bare `<span>` defaults to `display: inline`, which makes the browser ignore an ' +
      'explicit width/height entirely, so the box collapses to its content\'s intrinsic ' +
      'size and the percentage-based `translateY(50%)` (computed from that WRONG size) ' +
      'resolves to zero — the dot then renders visibly off the true point instead of ' +
      'centered on it',
    /wrapper\.style\.display = 'inline-block';\s*\n\s*wrapper\.style\.width = /.test(
      courtMapInner,
    ),
  );

  // ── Task 19: Airbnb-style marker clustering ──────────────────────────────────────────
  console.log('\nTask 19: marker clustering (@googlemaps/markerclusterer)');
  expectTrue(
    'the official SuperClusterAlgorithm (wrapping the same `supercluster` engine as ' +
      'Airbnb\'s own clustering) is used, not the simpler grid-based default',
    /import \{ MarkerClusterer, SuperClusterAlgorithm \} from '@googlemaps\/markerclusterer';/.test(
      courtMapInner,
    ) && /new SuperClusterAlgorithm\(/.test(courtMapInner),
  );
  expectTrue(
    'ONE MarkerClusterer is built per map, alongside map construction — not re-created ' +
      'inside drawMarkers() on every redraw (which would leak/rebuild renderer state on ' +
      'every filter change)',
    (() => {
      const mapCreation = /void loadGoogleMapsLibraries[\s\S]*?clustererRef\.current = new MarkerClusterer\(/.exec(
        courtMapInner,
      )?.[0];
      const drawMarkersBody = /const drawMarkers = useCallback\(\(\) => \{[\s\S]*?\n  \}, \[markers/.exec(
        courtMapInner,
      )?.[0];
      return (
        !!mapCreation &&
        !!drawMarkersBody &&
        !/new MarkerClusterer\(/.test(drawMarkersBody)
      );
    })(),
  );
  expectTrue(
    'drawMarkers() hands the built markers to the clusterer (clearMarkers + addMarkers) ' +
      'instead of setting `.map` directly — the clusterer decides per-marker visibility. ' +
      'Both hand-off assertions run against stripComments() (a commented-out hand-off must ' +
      'not pass), and the negative check is shape-generic (any `<ident>.map = map;` inside ' +
      'drawMarkers(), not just the literal `advancedMarker` name) so renaming the loop ' +
      'variable cannot smuggle a direct attach past it',
    (() => {
      const code = stripComments(courtMapInner);
      const drawMarkersBody =
        /const drawMarkers = useCallback\(\(\) => \{[\s\S]*?\n  \}, \[markers/.exec(code)?.[0] ??
        '';
      return (
        !!drawMarkersBody &&
        /clusterer\.clearMarkers\(\);/.test(code) &&
        /clusterer\.addMarkers\(advancedMarkers\);/.test(code) &&
        !/\w+\.map = map;/.test(drawMarkersBody)
      );
    })(),
  );
  expectTrue(
    'the cluster badge is a custom renderer building its own AdvancedMarkerElement content ' +
      '(never the legacy Marker / default pin), matching the individual court markers',
    /function createClusterRenderer\(/.test(courtMapInner) &&
      /return new AdvancedMarkerElement\(\{\s*\n\s*position: cluster\.position,/.test(
        courtMapInner,
      ),
  );
  expectTrue(
    'the cluster badge reuses the existing marker-content pattern (a plain DOM element) ' +
      'and its own sibling CSS classes, distinct from the per-court state colors',
    /function clusterContent\(/.test(courtMapInner) &&
      /wrapper\.className = 'tw-map-cluster-icon';/.test(courtMapInner) &&
      /badge\.className = 'tw-map-cluster';/.test(courtMapInner) &&
      /countEl\.className = 'tw-map-cluster__count';/.test(courtMapInner) &&
      /\.tw-map-cluster\s*\{/.test(readWebFile('src/app/globals.css')) &&
      /\.tw-map-cluster__count\s*\{/.test(readWebFile('src/app/globals.css')),
  );
  expectTrue(
    'Task 19 §3: the cluster-click path is NOT wrapped in beginProgrammaticMove() — no ' +
      '`onClusterClick` override is passed, so MarkerClusterer\'s default handler ' +
      '(map.fitBounds(cluster.bounds)) reports through the ordinary, unsuppressed ' +
      'center_changed/zoom_changed listeners exactly like a manual zoom or a zoom-control ' +
      'click, correctly standing down the automatic nearest-court recentre',
    (() => {
      const ctorCall = /clustererRef\.current = new MarkerClusterer\(\{[\s\S]*?\n\s*\}\);/.exec(
        courtMapInner,
      )?.[0];
      return !!ctorCall && !/onClusterClick:/.test(stripComments(ctorCall));
    })(),
  );
  expectTrue(
    'Task 19 §4 / Task 21 §3: the MarkerClusterer constructor call actually PASSES ' +
      '`renderer: createClusterRenderer(AdvancedMarkerElement)` and `map` as options — ' +
      'deleting (or swapping) either would silently fall back to the library\'s own default ' +
      'renderer (a legacy google.maps.Marker with an SVG data-URI icon: variant A, decided ' +
      'against in Feature 88 §1) while every other clustering check in this file stays green',
    (() => {
      const ctorCall = /clustererRef\.current = new MarkerClusterer\(\{[\s\S]*?\n\s*\}\);/.exec(
        courtMapInner,
      )?.[0];
      if (!ctorCall) return false;
      const code = stripComments(ctorCall);
      return (
        /renderer: createClusterRenderer\(AdvancedMarkerElement\),/.test(code) &&
        /\n\s*map(?:: map)?,/.test(code)
      );
    })(),
  );
  expectTrue(
    'the clusterer is torn down on unmount alongside the map (setMap(null), refs cleared)',
    /clustererRef\.current\?\.setMap\(null\);\s*\n\s*clustererRef\.current = null;/.test(
      courtMapInner,
    ),
  );
  expectTrue(
    'package.json added @googlemaps/markerclusterer as a real dependency (not dev)',
    (() => {
      const pkg = JSON.parse(readWebFile('package.json')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      return (
        !!pkg.dependencies?.['@googlemaps/markerclusterer'] &&
        !pkg.devDependencies?.['@googlemaps/markerclusterer']
      );
    })(),
  );

  expectTrue(
    'clusterContent()\'s wrapper gets its OWN inline-block + translateY(50%) anchor check, ' +
      'not just markerContent()\'s (Task 17\'s check is hard-coded to markerContent\'s ' +
      '`${size}px` wrapper) — this exact class of bug (a bare <span> defaulting to ' +
      '`display: inline`, which silently breaks the percentage-based translateY math) has ' +
      'had to be fixed or re-applied three times across this codebase\'s history, and the ' +
      'cluster badge\'s wrapper currently gets away without explicit width/height only ' +
      'because its child .tw-map-cluster happens to be display: flex today',
    (() => {
      const clusterContentBody =
        /function clusterContent\([\s\S]*?\n\}/.exec(stripComments(courtMapInner))?.[0] ?? '';
      return (
        !!clusterContentBody &&
        /wrapper\.style\.display = 'inline-block';\s*\n\s*wrapper\.style\.transform = 'translateY\(50%\)';/.test(
          clusterContentBody,
        )
      );
    })(),
  );

  // ── Task 20: photo pins instead of the plain colored dot ─────────────────────────────
  console.log('\nTask 20: photo pins on the map (heroImageUrl threaded to markerContent)');
  const mapMarkers = readSrc('features/map/map-markers.ts');
  expectTrue(
    'MapMarker carries an optional heroImageUrl, and courtToMarker copies it across (the ' +
      'single conversion every public map surface goes through)',
    /readonly heroImageUrl\?: string;/.test(mapMarkers) &&
      /heroImageUrl: court\.heroImageUrl,/.test(mapMarkers),
  );
  expectTrue(
    'CourtDetailLocationPreview threads heroImageUrl into BOTH hand-built markers (the ' +
      'entitled/exact one and the approximate/featured one) — the one marker-building call ' +
      'site outside courtToMarker',
    (() => {
      const code = stripComments(courtDetailLocationPreview);
      return (
        /heroImageUrl: string;/.test(code) &&
        /state: 'exact',\s*\n\s*heroImageUrl,/.test(code) &&
        /state: 'featured',\s*\n\s*heroImageUrl,/.test(code)
      );
    })(),
  );
  expectTrue(
    'page.tsx passes heroImageUrl at both CourtDetailLocationPreview call sites (locked and unlocked)',
    (() => {
      const code = stripComments(readSrc('app/courts/[slug]/page.tsx'));
      const blocks = code.split('<CourtDetailLocationPreview').slice(1);
      return (
        blocks.length === 2 &&
        blocks.every((block) => /heroImageUrl=\{court\.heroImageUrl\}/.test(block.split('/>')[0] ?? ''))
      );
    })(),
  );
  expectTrue(
    'markerContent() takes heroImageUrl and the drawMarkers() call site passes it through ' +
      '(falling back to \'\' for a marker with none, which itself falls back to the shared ' +
      'placeholder image)',
    /function markerContent\(\s*\n\s*state: MapMarkerState,\s*\n\s*name: string,\s*\n\s*clickable: boolean,\s*\n\s*heroImageUrl: string,/.test(
      courtMapInner,
    ) && /markerContent\(m\.state, m\.name, clickable, m\.heroImageUrl \?\? ''\)/.test(courtMapInner),
  );
  expectTrue(
    'a missing/empty heroImageUrl falls back to the SAME shared placeholder file ' +
      'CourtImage.tsx/gallery-context.tsx already use for a court with no photo (not a ' +
      'second "no photo" visual language)',
    /const FALLBACK_HERO_IMAGE = '\/placeholders\/ben-hershey-K9HgyI3qmqA-unsplash\.jpg';/.test(
      courtMapInner,
    ) && /const src = heroImageUrl \|\| FALLBACK_HERO_IMAGE;/.test(courtMapInner),
  );
  expectTrue(
    'a failed image request (not just an empty URL) also falls back, exactly once — no ' +
      'broken-image glyph and no infinite onerror loop',
    /img\.onerror = \(\) => \{\s*\n\s*if \(usedFallback\) return;\s*\n\s*usedFallback = true;\s*\n\s*img\.src = optimizedPinImageUrl\(FALLBACK_HERO_IMAGE, pin\);/.test(
      courtMapInner,
    ),
  );
  expectTrue(
    'the image request goes through Next\'s own /_next/image optimizer endpoint with a ' +
      'small width (not the raw full-size source URL) — a deliberate bandwidth/cost choice, ' +
      'not the raw-URL fallback the brief also allowed',
    /`\/_next\/image\?url=\$\{encodeURIComponent\(src\)\}&w=\$\{width\}&q=70`/.test(courtMapInner),
  );
  expectTrue(
    'the requested width accounts for retina (~2x the rendered pin size) and snaps to a ' +
      'width Next\'s optimizer will actually serve (images.imageSizes — an arbitrary `w` 400s)',
    /const target = renderedPx \* 2;/.test(courtMapInner) &&
      /const NEXT_IMAGE_WIDTHS = \[16, 32, 48, 64, 96, 128, 256, 384\];/.test(courtMapInner),
  );
  expectTrue(
    'the source comment\'s "keep NEXT_IMAGE_WIDTHS in sync with next.config.mjs" claim is ' +
      'enforced, not just documented: next.config.mjs does not override `images.imageSizes` ' +
      '(so Next\'s own default bucket list — which NEXT_IMAGE_WIDTHS mirrors — is still the ' +
      'one actually in effect); if it ever legitimately needs to, this check must be updated ' +
      'to compare the two arrays instead of merely asserting the override is absent',
    !/imageSizes/.test(readWebFile('next.config.mjs')),
  );
  expectTrue(
    'the state signal survives the switch from a solid dot to a photo: the ring (border) ' +
      'color still comes from COLOR[state] via the same --mk custom property, and the halo ' +
      'pulse is untouched',
    /const color = COLOR\[state\];/.test(courtMapInner) &&
      /marker\.style\.setProperty\('--mk', color\);/.test(courtMapInner) &&
      /border: 3px solid var\(--mk\);/.test(readWebFile('src/app/globals.css')),
  );
  expectTrue(
    'the photo pin is sized larger than the old dot (a photo needs to read as a photo) and ' +
      'still bigger for the featured/exact halo states, same halo > non-halo relationship ' +
      'the old size/dot pair had',
    /const size = halo \? 56 : 44;/.test(courtMapInner) && /const pin = halo \? 44 : 40;/.test(courtMapInner),
  );
  expectTrue(
    'the pin photo element follows the SAME inline-block + explicit width/height anchor ' +
      'pattern as the wrapper (Task 17\'s lesson applied to the new element, not just the ' +
      'old one) — a plain span would otherwise collapse to its intrinsic size',
    /photo\.style\.display = 'inline-block';\s*\n\s*photo\.style\.width = /.test(courtMapInner),
  );
  expectTrue(
    'the marker photo is decorative (empty alt) — the wrapper\'s title/aria-label (the ' +
      'court name) stays the ONE accessible name for the pin, unchanged from before',
    /img\.alt = '';/.test(courtMapInner) &&
      /wrapper\.title = name;/.test(courtMapInner) &&
      /wrapper\.setAttribute\('aria-label', name\);/.test(courtMapInner),
  );
  expectTrue(
    'Task 19\'s cluster badge is untouched by the photo-pin change — it still renders a ' +
      'count via clusterContent(), never a photo, and stays on its own .tw-map-cluster* classes',
    /function clusterContent\(count: number\): HTMLElement \{/.test(courtMapInner) &&
      !/heroImageUrl/.test(
        (/function clusterContent\([\s\S]*?\n\}/.exec(courtMapInner)?.[0]) ?? '',
      ),
  );

  // ── Task 23: fitBounds max-zoom clamp no longer stomps a focus that lands first ───────
  console.log(
    '\nTask 23: the fitBounds clamp bails when a focus has landed since it was armed',
  );
  expectTrue(
    'the clamp snapshots the currently-applied focus token AT ARM TIME, before the ' +
      'one-shot `idle` listener is even registered',
    /const armedFocusToken = appliedFocusTokenRef\.current;\s*\n\s*google\.maps\.event\.addListenerOnce\(map, 'idle', \(\) => \{/.test(
      courtMapInner,
    ),
  );
  expectTrue(
    'the bail check is the FIRST statement inside the clamp\'s `idle` callback — a stale ' +
      'clamp returns before it ever reads map.getZoom(), so it can never observe (let alone ' +
      'overwrite) a zoom a newer focus animation already landed',
    /addListenerOnce\(map, 'idle', \(\) => \{\s*\n\s*if \(appliedFocusTokenRef\.current !== armedFocusToken\) return;\s*\n\s*const currentZoom = map\.getZoom\(\);/.test(
      courtMapInner,
    ),
  );
  expectTrue(
    'a focus applied BEFORE the clamp was armed does not trip the guard — the token is ' +
      'unchanged, so a filter change with no NEW focus involved still clamps to ' +
      'FIT_BOUNDS_MAX_ZOOM exactly as before (applyFocus only reassigns ' +
      'appliedFocusTokenRef.current for a genuinely new, distinct token)',
    /if \(appliedFocusTokenRef\.current === focus\.token\) return;\s*\n\s*appliedFocusTokenRef\.current = focus\.token;/.test(
      courtMapInner,
    ),
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
