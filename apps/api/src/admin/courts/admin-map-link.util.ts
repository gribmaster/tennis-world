import { BadRequestException } from '@nestjs/common';

// ─────────────────────────────────────────────────────────────────────────────
// `mapLinkUrl` validation (TASK_73 decision 12, TIGHTENED by TASK_75 decision 3).
// This field is USER-VISIBLE (entitled viewers get a "Directions" link built
// from it — see `courts.mapper.ts#toExactLocationDTO`), so it is validated
// strictly: an admin mistake or a compromised admin account must not be able to
// plant an off-site redirect that an entitled visitor then clicks as
// "Directions".
//
// TASK_73's first pass accepted `google.com` / `maps.google.com` with ANY path
// — which includes Google's own `/url?q=<anything>` open-redirect endpoint.
// TASK_75 closes that: every host now has an explicit path rule, not just a
// path PREFIX.
//
//   www.google.com, google.com : path === '/maps' or starts with '/maps/'
//   maps.google.com            : path === '/' (the legacy `?q=` form), '/maps',
//                                 or starts with '/maps/' — and NEVER '/url'
//   goo.gl                     : path === '/maps' or starts with '/maps/'
//   maps.app.goo.gl            : any path (Google's own Maps-only shortener —
//                                 this host serves nothing but Maps links)
//
// `startsWith('/maps/')` (WITH the trailing slash), not `startsWith('/maps')`,
// deliberately — the latter would also accept `/mapsfoo`.
//
// The rule table is a `Map`, not a plain object (TASK_76 decision 1): a plain
// object indexed by an attacker-controlled hostname is reachable through the
// prototype chain (`https://constructor/x` resolved to `Object`, a truthy
// function; `https://__proto__/x` threw and surfaced as a 500). A `Map` has no
// prototype-inherited keys, so every hostname not explicitly listed above
// falls through to the same 400 as any other unknown host.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_LENGTH = 2000;

const MAPS_PATH_ONLY = (pathname: string): boolean =>
  pathname === '/maps' || pathname.startsWith('/maps/');

const HOST_PATH_RULES = new Map<string, (pathname: string) => boolean>([
  ['www.google.com', MAPS_PATH_ONLY],
  ['google.com', MAPS_PATH_ONLY],
  [
    'maps.google.com',
    (pathname) => pathname !== '/url' && (pathname === '/' || MAPS_PATH_ONLY(pathname)),
  ],
  ['goo.gl', MAPS_PATH_ONLY],
  ['maps.app.goo.gl', () => true],
]);

/**
 * Validate (and normalize-by-trimming) an admin-supplied `mapLinkUrl`.
 *   - `null` / `undefined` / empty string → `null` (clears the field).
 *   - otherwise: https-only, no embedded credentials, no explicit port,
 *     ≤ 2000 chars, hostname EXACTLY one of the allowed values (never a
 *     suffix/prefix match — rejects e.g. `www.google.com.evil.example`), and
 *     the path must match that host's rule (see the module comment above).
 * Throws `BadRequestException` (400) on any violation.
 */
export function validateMapLinkUrl(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  if (trimmed.length > MAX_LENGTH) {
    throw new BadRequestException(`mapLinkUrl must be at most ${MAX_LENGTH} characters.`);
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new BadRequestException('mapLinkUrl must be a valid absolute URL.');
  }

  if (url.protocol !== 'https:') {
    throw new BadRequestException('mapLinkUrl must use https.');
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new BadRequestException('mapLinkUrl must not contain embedded credentials.');
  }
  if (url.port.length > 0) {
    throw new BadRequestException('mapLinkUrl must not specify an explicit port.');
  }

  const hostname = url.hostname.toLowerCase();
  const pathRule = HOST_PATH_RULES.get(hostname);
  if (pathRule && pathRule(url.pathname)) {
    return trimmed;
  }

  throw new BadRequestException(
    'mapLinkUrl must be a Google Maps link: google.com/www.google.com with a /maps path, ' +
      'maps.google.com (root or /maps, never /url), a goo.gl/maps/… short link, or any ' +
      'maps.app.goo.gl link.',
  );
}
