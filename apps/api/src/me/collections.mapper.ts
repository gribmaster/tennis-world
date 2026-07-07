import type {
  CourtSummaryDTO,
  UserCollectionDTO,
  UserCollectionWithCourtsDTO,
} from '@tennis/contracts';
import type { CourtSummaryRow } from '../courts/courts.mapper';
import { toCourtSummaryDTO } from '../courts/courts.mapper';

// ─────────────────────────────────────────────────────────────────────────────
// User-collection slug helpers + mappers (Feature 55).
//
// SLUG PARITY (prompt task 4): these two pure helpers are a faithful copy of the web
// mock's `slugifyCollectionName` + `ensureUniqueSlug`
// (apps/web/src/domain/saved/mock-saved.repository.ts). They are RE-IMPLEMENTED here,
// not imported, because the API must not depend on web code (the dependency only goes
// contracts/mock-data → both sides). Keep the two algorithms identical so the server's
// derived slug matches the mock's for the same name + existing set — a parity risk if
// they drift. Any change here MUST be mirrored in the mock (and vice-versa).
//
// COVERS / COUNT (prompt task 5): `count` = membership row count; `coverImageUrls` =
// the hero images of the first COVER_COUNT member courts, in membership order. This
// mirrors the mock's `coversFor` (first 3 hero urls) and `toDTO` (count = courtIds
// length, covers undefined when empty). The first-N order is the same sortOrder the
// detail `courts` list uses (see the service's orderBy), so the covers are a prefix of
// the detail list.
//
// COORDINATE MASKING (prompt task 13): the detail mapper resolves member courts via the
// Courts module's PUBLIC `toCourtSummaryDTO` — the rows are fetched with
// `courtSummarySelect`, which omits lat/lng, so a folder's `courts`/covers are
// structurally incapable of carrying exact geo (same guarantee as saved-courts).
// ─────────────────────────────────────────────────────────────────────────────

/** How many member-court hero images make up a folder's cover thumbnail stack. */
export const COVER_COUNT = 3;

/**
 * Kebab-case a display name the SAME way the web mock derives a collection slug
 * (`name.toLowerCase().replace(/[^a-z0-9]+/g,'-')`), additionally trimming any leading
 * or trailing hyphens so " Summer Trip! " → "summer-trip". Returns '' if the name has
 * no slug-able characters (caller decides the fallback). MUST stay identical to the
 * web mock's `slugifyCollectionName`.
 */
export function slugifyCollectionName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Ensure a slug is unique against `existingSlugs`, appending `-2`, `-3`, … on collision
 * (so a second "Summer Trip" becomes `summer-trip-2`). `currentSlug`, when supplied, is
 * the folder's own slug being renamed — it is excluded from the collision set so a
 * no-op rename keeps the same slug. MUST stay identical to the web mock's
 * `ensureUniqueSlug`. Uniqueness here is scoped per-user by the caller passing only
 * THAT user's existing slugs.
 */
export function ensureUniqueSlug(
  base: string,
  existingSlugs: Iterable<string>,
  currentSlug?: string,
): string {
  const taken = new Set(existingSlugs);
  if (currentSlug) taken.delete(currentSlug);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

// ── Row payload types (membership join → public court rows, no lat/lng) ─────────

/**
 * A `UserCollection` row with the durable folder fields plus its `courts` membership
 * rows, each joined to the PUBLIC court summary select. Built by the service's Prisma
 * `select`; the `court` row type is exactly `CourtSummaryRow` (lat/lng-free).
 */
export interface UserCollectionRow {
  id: string;
  slug: string;
  name: string;
  courts: { court: CourtSummaryRow }[];
}

// ── Mappers ───────────────────────────────────────────────────────────────────

/** Member courts → public summaries, in membership (sortOrder) order. */
function memberSummaries(row: UserCollectionRow): CourtSummaryDTO[] {
  return row.courts.map((m) => toCourtSummaryDTO(m.court));
}

/**
 * Project a folder row to the minimal `UserCollectionDTO` (list / create / rename).
 * `count` and `coverImageUrls` are DERIVED from the member rows: count = membership
 * length, covers = the first COVER_COUNT member hero images (undefined when empty,
 * matching the mock's `toDTO`). Requires the row to carry its `courts` membership.
 */
export function toUserCollectionDTO(row: UserCollectionRow): UserCollectionDTO {
  const courts = memberSummaries(row);
  const coverImageUrls = courts.slice(0, COVER_COUNT).map((c) => c.heroImageUrl);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    count: courts.length,
    coverImageUrls: coverImageUrls.length > 0 ? coverImageUrls : undefined,
  };
}

/**
 * Project a folder row to `UserCollectionWithCourtsDTO` (detail by slug / add / remove)
 * — the `UserCollectionDTO` fields plus the resolved member `CourtSummaryDTO[]`. The
 * `count`/`coverImageUrls` are consistent with the included `courts` (all derived from
 * the same member rows). No lat/lng — `toCourtSummaryDTO` uses the public select.
 */
export function toUserCollectionWithCourtsDTO(
  row: UserCollectionRow,
): UserCollectionWithCourtsDTO {
  return {
    ...toUserCollectionDTO(row),
    courts: memberSummaries(row),
  };
}
