import type { AccessType, AdminCourtDetailDTO, CourtStatus, CourtTag, IndoorOutdoor, Surface } from '@tennis/contracts';

// ─────────────────────────────────────────────────────────────────────────────
// Pure diff helper (TASK_74 Testing §3 — "the PATCH payload only contains
// changed editable fields"). The edit form always holds the FULL set of
// values, but the API's `UpdateCourtRequestDTO` only wants the fields that
// actually changed — sending untouched fields back is harmless to the API,
// but diffing here keeps the network call small and makes "what did this
// save actually change" obvious when debugging.
// ─────────────────────────────────────────────────────────────────────────────

export interface CourtFormValues {
  name: string;
  slug: string;
  countryId: string;
  regionId: string;
  lat: number;
  lng: number;
  mapLinkUrl: string;
  surface: Surface;
  setting: string;
  access: AccessType;
  indoorOutdoor: IndoorOutdoor;
  isScenic: boolean;
  isFeatured: boolean;
  isLocked: boolean;
  status: CourtStatus;
  blurb: string;
  tags: CourtTag[];
}

export type CourtPatchPayload = Partial<Omit<CourtFormValues, 'mapLinkUrl'>> & { mapLinkUrl?: string | null };

export function buildCourtPatch(
  original: AdminCourtDetailDTO,
  values: CourtFormValues,
): CourtPatchPayload {
  const patch: CourtPatchPayload = {};

  if (values.name !== original.name) patch.name = values.name;
  if (values.slug !== original.slug) patch.slug = values.slug;
  if (values.countryId !== original.countryId) patch.countryId = values.countryId;
  if (values.regionId !== original.regionId) patch.regionId = values.regionId;
  if (values.lat !== original.lat) patch.lat = values.lat;
  if (values.lng !== original.lng) patch.lng = values.lng;

  const normalizedMapLink = values.mapLinkUrl.trim().length > 0 ? values.mapLinkUrl.trim() : null;
  if (normalizedMapLink !== original.mapLinkUrl) patch.mapLinkUrl = normalizedMapLink;

  if (values.surface !== original.surface) patch.surface = values.surface;
  if (values.setting !== original.setting) patch.setting = values.setting;
  if (values.access !== original.access) patch.access = values.access;
  if (values.indoorOutdoor !== original.indoorOutdoor) patch.indoorOutdoor = values.indoorOutdoor;
  if (values.isScenic !== original.isScenic) patch.isScenic = values.isScenic;
  if (values.isFeatured !== original.isFeatured) patch.isFeatured = values.isFeatured;
  if (values.isLocked !== original.isLocked) patch.isLocked = values.isLocked;
  if (values.status !== original.status) patch.status = values.status;
  if (values.blurb !== original.blurb) patch.blurb = values.blurb;

  if (!sameTagSet(values.tags, original.tags)) patch.tags = values.tags;

  return patch;
}

function sameTagSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((tag) => setB.has(tag));
}

export function courtDetailToFormValues(court: AdminCourtDetailDTO): CourtFormValues {
  return {
    name: court.name,
    slug: court.slug,
    countryId: court.countryId,
    regionId: court.regionId,
    lat: court.lat,
    lng: court.lng,
    mapLinkUrl: court.mapLinkUrl ?? '',
    surface: court.surface,
    setting: court.setting,
    access: court.access,
    indoorOutdoor: court.indoorOutdoor,
    isScenic: court.isScenic,
    isFeatured: court.isFeatured,
    isLocked: court.isLocked,
    status: court.status,
    blurb: court.blurb,
    tags: court.tags,
  };
}
