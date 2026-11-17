import { createHash } from 'node:crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Shared Court derived-field math (TASK_73) — extracted VERBATIM from
// `apps/api/scripts/import-courts-from-content.ts` (`slugify`, `approxFromExact`,
// `mapCoordsFromSeed`) so the admin courts API and the content importer compute
// these fields with byte-for-byte identical behavior. The importer now imports
// from here instead of defining its own copies — see Testing §3/§14 in
// docs/TASK_73_ADMIN_COURTS_API.md for the parity check this enables.
//
// DO NOT change the hashing, rounding, or offset math here without re-running the
// importer's `--dry-run` plan diff (Testing §14) — any drift changes every
// existing court's approx geo / map position on the next admin edit or re-import.
// ─────────────────────────────────────────────────────────────────────────────

/** URL-safe slug shape: lower-case alphanumerics, single hyphens, no leading/trailing hyphen. */
export const URL_SAFE_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Lower-case, ASCII-fold diacritics, non-alphanumerics → `-`, trim leading/trailing `-`. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** ~10km deterministic jitter, matching the project's existing approx-coordinate convention. */
export function approxFromExact(
  lat: number,
  lng: number,
  seedKey: string,
): { approxLat: number; approxLng: number } {
  // Deterministic pseudo-random offset derived from a hash of the seed key, so
  // re-running the importer on the same court always yields the same approx
  // coords (mirrors the existing mock-data convention of small fixed offsets).
  const hash = createHash('sha256').update(seedKey).digest();
  const signLat = hash[0]! % 2 === 0 ? 1 : -1;
  const signLng = hash[1]! % 2 === 0 ? 1 : -1;
  // ~10km ≈ 0.09 degrees latitude; longitude degrees vary with latitude but we
  // keep the same small-fixed-offset convention the current mock data uses
  // (e.g. lat 45.9876 -> approxLat 45.99, i.e. hundredths-of-a-degree rounding).
  const offsetLat = signLat * (0.02 + (hash[2]! / 255) * 0.07);
  const offsetLng = signLng * (0.02 + (hash[3]! / 255) * 0.07);
  return {
    approxLat: Math.round((lat + offsetLat) * 100) / 100,
    approxLng: Math.round((lng + offsetLng) * 100) / 100,
  };
}

/**
 * Deterministic decorative [x%, y%] position for the stylized map canvas
 * (`Court.mapX`/`mapY` — NEVER geo, see schema.prisma Risk #17 note). Derived
 * from a hash of the slug so re-imports are stable; kept away from the 0/100
 * edges so pins never render flush against the canvas border.
 */
export function mapCoordsFromSeed(seedKey: string): { mapX: number; mapY: number } {
  const hash = createHash('sha256').update(`mapcoords:${seedKey}`).digest();
  const mapX = 10 + Math.round((hash[0]! / 255) * 80);
  const mapY = 10 + Math.round((hash[1]! / 255) * 80);
  return { mapX, mapY };
}
