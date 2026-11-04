import { Prisma } from '@prisma/client';
import type {
  CourtDTO,
  CourtImageDTO,
  CourtSummaryDTO,
  ExactLocationDTO,
  MapPinDTO,
} from '@tennis/contracts';
import { orderCourtTags } from './court-tags';

// ─────────────────────────────────────────────────────────────────────────────
// Court mappers + PUBLIC Prisma selects (intake §4 masking; prompt tasks 7, 8).
//
// COORDINATE MASKING — the strongest guarantee is "you can't leak what you didn't
// fetch". Each public select below DELIBERATELY OMITS `Court.lat`/`Court.lng`.
// Because Prisma types a `select`-ed row to exactly the selected fields, the
// payload types (`SummaryRow`, `DetailRow`, `MapRow`) literally have no `lat`/
// `lng` properties — so the mappers are STRUCTURALLY INCAPABLE of attaching exact
// coordinates. If a future feature needs exact geo it MUST add a separate private
// select; it must never widen these public ones (see the `satisfies` guards).
//
// The mappers always include the decorative `mapCoords` ([mapX, mapY] — screen %,
// never geo, Risk #17). The detail mapper (CourtDTO) leaves `lat`/`lng` undefined
// in Phase 2 (no entitlement system yet → every request is non-entitled).
//
// APPROX-GEO REDACTION (TASK_72) — `approxLat`/`approxLng` are always-public ONLY
// for an unlocked court. For `court.isLocked`, they are withheld from a viewer who
// is not currently entitled: not sent as `null`/`0`, the keys are simply ABSENT
// from the response. `redactCourtGeo` is the ONE function that applies this rule,
// and `toCourtSummaryDTO`/`toCourtDTO` take `viewerEntitled` as a REQUIRED
// parameter (not optional, not a separate post-processing step) specifically so a
// new producer cannot compile without deciding what to pass — see each call site
// (`courts.service.ts`, `me/saved-courts.service.ts`, `me/collections.mapper.ts`).
// ─────────────────────────────────────────────────────────────────────────────

// ── Public selects (lat/lng intentionally absent) ────────────────────────────

/**
 * Summary/list/map-card read. Joins `country`/`region` only to flatten their
 * `name` back to the denormalized string the DTO/mock expects. NO lat/lng.
 */
export const courtSummarySelect = {
  id: true,
  slug: true,
  name: true,
  country: { select: { name: true } },
  region: { select: { name: true } },
  surface: true,
  setting: true,
  access: true,
  indoorOutdoor: true,
  isScenic: true,
  isFeatured: true,
  isLocked: true,
  // Public "Experience" tags (Feature 72) — descriptive metadata, never geo.
  tags: true,
  approxLat: true,
  approxLng: true,
  mapX: true,
  mapY: true,
  // Hero image only — the summary's `heroImageUrl`. (Full gallery is detail-only.)
  images: {
    where: { isHero: true },
    select: { url: true },
    orderBy: { sortOrder: 'asc' },
    take: 1,
  },
} satisfies Prisma.CourtSelect;

/** Detail read = summary fields + blurb/status + the full ordered image gallery. */
export const courtDetailSelect = {
  ...courtSummarySelect,
  blurb: true,
  status: true,
  images: {
    select: { url: true, alt: true, isHero: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' },
  },
} satisfies Prisma.CourtSelect;

/** Map-pin read — only what `MapPinDTO` needs. No geo, no image. */
export const mapPinSelect = {
  id: true,
  slug: true,
  mapX: true,
  mapY: true,
  isFeatured: true,
  isLocked: true,
} satisfies Prisma.CourtSelect;

// ── PRIVATE exact-location select (Feature 63 — the ONE select that reads coords) ─
//
// This is the SINGLE place exact `lat`/`lng` are ever fetched. It is used ONLY by the
// protected, entitlement-gated `GET /v1/me/courts/:slug/exact-location` handler — NEVER
// by any public read (the public selects above stay structurally incapable of leaking
// coords, intake §4.6). Selects only what `ExactLocationDTO` needs plus `status` (the
// handler resolves a PUBLISHED court → 404 otherwise, mirroring the public reads). It
// deliberately does NOT spread `courtSummarySelect` so it can never accidentally widen
// the public surface — and the public selects can never accidentally inherit coords.
export const courtExactLocationSelect = {
  id: true,
  slug: true,
  status: true,
  isLocked: true,
  lat: true,
  lng: true,
  mapLinkUrl: true,
} satisfies Prisma.CourtSelect;

// ── Row payload types (derived from the selects → cannot contain lat/lng) ─────

export type CourtSummaryRow = Prisma.CourtGetPayload<{ select: typeof courtSummarySelect }>;
export type CourtDetailRow = Prisma.CourtGetPayload<{ select: typeof courtDetailSelect }>;
export type MapPinRow = Prisma.CourtGetPayload<{ select: typeof mapPinSelect }>;
export type CourtExactLocationRow = Prisma.CourtGetPayload<{
  select: typeof courtExactLocationSelect;
}>;

// ── Mappers (typed to the contract DTOs) ──────────────────────────────────────

/** Hero URL = the (single) hero-image row's url, or '' if a court has none. */
function heroUrl(images: { url: string }[]): string {
  return images[0]?.url ?? '';
}

export function toCourtSummaryDTO(
  row: CourtSummaryRow,
  viewerEntitled: boolean,
): CourtSummaryDTO {
  // Typed explicitly (rather than inlined into redactCourtGeo's generic call) so
  // `mapCoords` is checked against the contract's `[number, number]` tuple here —
  // a generic call site would otherwise widen the two-element array literal to
  // `number[]` before inference ever sees the tuple.
  const dto: CourtSummaryDTO = {
    id: row.id,
    slug: row.slug,
    name: row.name,
    country: row.country.name,
    region: row.region.name,
    surface: row.surface,
    setting: row.setting,
    access: row.access,
    indoorOutdoor: row.indoorOutdoor,
    isScenic: row.isScenic,
    isFeatured: row.isFeatured,
    isLocked: row.isLocked,
    tags: orderCourtTags(row.tags),
    heroImageUrl: heroUrl(row.images),
    mapCoords: [row.mapX, row.mapY],
    // Exact lat/lng are never selected; approx geo is redacted below when locked.
    approxLat: row.approxLat,
    approxLng: row.approxLng,
  };
  return redactCourtGeo(dto, viewerEntitled);
}

/**
 * TASK_72 — the one place `approxLat`/`approxLng` are withheld. For
 * `dto.isLocked && !viewerEntitled`, the two keys are OMITTED from the returned
 * object entirely (not set to `undefined`/`null` — genuinely absent, so a
 * recursive key scan of the serialized JSON finds nothing). Every other field is
 * untouched. Unlocked courts and entitled viewers always keep both keys.
 */
function redactCourtGeo<T extends { isLocked: boolean; approxLat?: number; approxLng?: number }>(
  dto: T,
  viewerEntitled: boolean,
): T {
  if (!dto.isLocked || viewerEntitled) return dto;
  const { approxLat: _approxLat, approxLng: _approxLng, ...rest } = dto;
  return rest as T;
}

function toCourtImageDTO(img: {
  url: string;
  alt: string | null;
  isHero: boolean;
  sortOrder: number;
}): CourtImageDTO {
  return {
    url: img.url,
    // `alt` is optional on the wire — omit the key entirely when null.
    ...(img.alt !== null ? { alt: img.alt } : {}),
    isHero: img.isHero,
    sortOrder: img.sortOrder,
  };
}

export function toCourtDTO(row: CourtDetailRow, viewerEntitled: boolean): CourtDTO {
  const images = row.images;
  const hero = images.find((i) => i.isHero);
  // Typed explicitly for the same tuple-inference reason as toCourtSummaryDTO above.
  const dto: CourtDTO = {
    id: row.id,
    slug: row.slug,
    name: row.name,
    country: row.country.name,
    region: row.region.name,
    surface: row.surface,
    setting: row.setting,
    access: row.access,
    indoorOutdoor: row.indoorOutdoor,
    isScenic: row.isScenic,
    isFeatured: row.isFeatured,
    isLocked: row.isLocked,
    tags: orderCourtTags(row.tags),
    heroImageUrl: hero?.url ?? '',
    mapCoords: [row.mapX, row.mapY],
    approxLat: row.approxLat,
    approxLng: row.approxLng,
    blurb: row.blurb,
    images: images.map(toCourtImageDTO),
    status: row.status,
    // Exact lat/lng are intentionally OMITTED in Phase 2 (no entitlement gating).
    // They are not even selected from the DB, so there is nothing to attach.
  };
  return redactCourtGeo(dto, viewerEntitled);
}

/** locked > featured > open (matches the mock `pinState`). */
function pinState(row: MapPinRow): MapPinDTO['state'] {
  if (row.isLocked) return 'locked';
  if (row.isFeatured) return 'featured';
  return 'open';
}

export function toMapPinDTO(row: MapPinRow): MapPinDTO {
  return {
    courtId: row.id,
    slug: row.slug,
    mapCoords: [row.mapX, row.mapY],
    state: pinState(row),
  };
}

/**
 * Build the entitled-viewer exact-location payload (Feature 63). The ONLY mapper that
 * carries exact `lat`/`lng` — fed exclusively by `courtExactLocationSelect` from the
 * protected handler. `directionsUrl` prefers the court's own original Google Maps link
 * (`mapLinkUrl`, imported verbatim from content/<folder>/info.txt's "map link:") so the
 * entitled viewer opens the SAME link the content author supplied — never a different,
 * server-generated place link. Falls back to a coordinate-derived deep link only for
 * courts with no stored `mapLinkUrl` (e.g. older seeded/mock courts predating this field).
 */
export function toExactLocationDTO(row: CourtExactLocationRow): ExactLocationDTO {
  return {
    courtId: row.id,
    slug: row.slug,
    lat: row.lat,
    lng: row.lng,
    directionsUrl:
      row.mapLinkUrl ?? `https://www.google.com/maps/dir/?api=1&destination=${row.lat},${row.lng}`,
  };
}
