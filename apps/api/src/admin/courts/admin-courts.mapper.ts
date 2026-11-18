import { Prisma } from '@prisma/client';
import type { AdminCourtDetailDTO, AdminCourtListItemDTO } from '@tennis/contracts';
import { orderCourtTags } from '../../courts/court-tags';

// ─────────────────────────────────────────────────────────────────────────────
// Admin court selects + mappers (TASK_73). UNLIKE `courts/courts.mapper.ts`'s
// PUBLIC selects, these DELIBERATELY INCLUDE `lat`/`lng`/`mapLinkUrl` — this is
// the admin-only editing surface (decision 6: admin responses MAY carry exact
// geo, but ONLY here, never on a public route). Both selects omit
// `passwordHash` trivially — that field doesn't exist on `Court` at all; the
// no-leak guard that matters for THIS model is "never select exact geo from a
// PUBLIC select", which `courts.mapper.ts` already owns and this file does not
// touch.
// ─────────────────────────────────────────────────────────────────────────────

export const adminCourtListSelect = {
  id: true,
  slug: true,
  name: true,
  status: true,
  isLocked: true,
  isFeatured: true,
  country: { select: { id: true, name: true } },
  region: { select: { id: true, name: true } },
  images: {
    where: { isHero: true },
    select: { url: true },
    orderBy: { sortOrder: 'asc' },
    take: 1,
  },
  _count: { select: { images: true } },
  updatedAt: true,
} satisfies Prisma.CourtSelect;

export const adminCourtDetailSelect = {
  id: true,
  slug: true,
  name: true,
  status: true,
  isLocked: true,
  isFeatured: true,
  countryId: true,
  regionId: true,
  country: { select: { id: true, name: true } },
  region: { select: { id: true, name: true } },
  surface: true,
  setting: true,
  access: true,
  indoorOutdoor: true,
  isScenic: true,
  blurb: true,
  tags: true,
  lat: true,
  lng: true,
  mapLinkUrl: true,
  approxLat: true,
  approxLng: true,
  mapX: true,
  mapY: true,
  seedOrder: true,
  images: {
    select: { id: true, url: true, alt: true, sortOrder: true, isHero: true },
    orderBy: { sortOrder: 'asc' },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CourtSelect;

export type AdminCourtListRow = Prisma.CourtGetPayload<{ select: typeof adminCourtListSelect }>;
export type AdminCourtDetailRow = Prisma.CourtGetPayload<{ select: typeof adminCourtDetailSelect }>;

export function toAdminCourtListItemDTO(row: AdminCourtListRow): AdminCourtListItemDTO {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    isLocked: row.isLocked,
    isFeatured: row.isFeatured,
    country: row.country,
    region: row.region,
    heroImageUrl: row.images[0]?.url ?? null,
    imageCount: row._count.images,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toAdminCourtDetailDTO(row: AdminCourtDetailRow): AdminCourtDetailDTO {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    isLocked: row.isLocked,
    isFeatured: row.isFeatured,
    countryId: row.countryId,
    regionId: row.regionId,
    country: row.country,
    region: row.region,
    surface: row.surface,
    setting: row.setting,
    access: row.access,
    indoorOutdoor: row.indoorOutdoor,
    isScenic: row.isScenic,
    blurb: row.blurb,
    tags: orderCourtTags(row.tags),
    lat: row.lat,
    lng: row.lng,
    mapLinkUrl: row.mapLinkUrl,
    approxLat: row.approxLat,
    approxLng: row.approxLng,
    mapX: row.mapX,
    mapY: row.mapY,
    seedOrder: row.seedOrder,
    images: row.images.map((img) => ({
      id: img.id,
      url: img.url,
      alt: img.alt,
      sortOrder: img.sortOrder,
      isHero: img.isHero,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Fields the publishing gate (decision 10) checks. */
export interface PublishGateInput {
  blurb: string;
  lat: number;
  lng: number;
  images: readonly { isHero: boolean }[];
}

/**
 * Returns the list of missing requirements for `status: 'published'` (empty =
 * publishable). `countryId`/`regionId` are NOT checked here: both are
 * non-nullable FKs on `Court`, so a row that exists already has them — there is
 * no state in which they could be "missing" on an already-validated write.
 */
export function publishGateMissing(input: PublishGateInput): string[] {
  const missing: string[] = [];

  if (input.images.length < 1) {
    missing.push('image');
  } else if (input.images.filter((img) => img.isHero).length !== 1) {
    missing.push('exactlyOneHeroImage');
  }

  if (input.blurb.trim().length === 0) {
    missing.push('blurb');
  }
  if (!Number.isFinite(input.lat) || input.lat < -90 || input.lat > 90) {
    missing.push('lat');
  }
  if (!Number.isFinite(input.lng) || input.lng < -180 || input.lng > 180) {
    missing.push('lng');
  }

  return missing;
}
