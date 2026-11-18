import { z } from 'zod';
import { AccessType, Continent, CourtStatus, CourtTag, IndoorOutdoor, Surface } from './enums';

// ─────────────────────────────────────────────────────────────────────────────
// Admin API response DTOs (TASK_73) — SHAPES ONLY. These back `/v1/admin/*`
// (apps/api/src/admin/**), which is a completely SEPARATE identity/auth surface
// from the public contract (see CLAUDE.md "Admin API"). Imported `type`-only by
// apps/api (the [[api-contracts-type-only-import]] rule — this package's `main`
// points at TS source, which Node cannot `require` at runtime); the API's local
// class-validator DTOs are the runtime request validators (see
// `apps/api/src/admin/**/*.dto.ts`), checked against these types with a
// compile-time `satisfies`/structural assertion the same way `consultations.dto.ts`
// does.
//
// PRIVACY: `AdminUser.passwordHash` NEVER appears here or anywhere on the admin
// wire. `AdminCourtDetailDTO` DOES carry exact `lat`/`lng`/`mapLinkUrl` — that is
// the point of an editing tool — but ONLY admin responses use this file; the
// public court DTOs in `court.ts` are unaffected and stay structurally incapable
// of leaking coordinates.
// ─────────────────────────────────────────────────────────────────────────────

/** The signed-in admin's own identity. Never carries `passwordHash`. */
export const AdminSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: z.string(),
});
export type AdminDTO = z.infer<typeof AdminSchema>;

/** Response of `POST /v1/admin/auth/login`. */
export const AdminSessionSchema = z.object({
  admin: AdminSchema,
  accessToken: z.string(),
  /** ISO-8601 expiry of the admin session token. */
  expiresAt: z.string(),
});
export type AdminSessionDTO = z.infer<typeof AdminSessionSchema>;

/** One image on an admin court read/write (never redacted — admin tool only). */
export const AdminCourtImageSchema = z.object({
  id: z.string(),
  url: z.string(),
  alt: z.string().nullable(),
  sortOrder: z.number().int(),
  isHero: z.boolean(),
});
export type AdminCourtImageDTO = z.infer<typeof AdminCourtImageSchema>;

/** `{ id, name }` reference, used for the court's country/region in admin reads. */
export const AdminRefSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type AdminRefDTO = z.infer<typeof AdminRefSchema>;

/** One row of `GET /v1/admin/courts` (list view — includes drafts). */
export const AdminCourtListItemSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: CourtStatus,
  isLocked: z.boolean(),
  isFeatured: z.boolean(),
  country: AdminRefSchema,
  region: AdminRefSchema,
  heroImageUrl: z.string().nullable(),
  imageCount: z.number().int(),
  /** ISO-8601. */
  updatedAt: z.string(),
});
export type AdminCourtListItemDTO = z.infer<typeof AdminCourtListItemSchema>;

export const AdminCourtListResponseSchema = z.object({
  items: z.array(AdminCourtListItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export type AdminCourtListResponseDTO = z.infer<typeof AdminCourtListResponseSchema>;

/**
 * `GET /v1/admin/courts/:id` and the `POST`/`PATCH` write responses — every
 * editable field (decisions 9–13 of TASK_73) plus the server-computed derived
 * fields (`approxLat`/`approxLng`/`mapX`/`mapY`/`seedOrder`) and the ordered
 * image gallery. The admin never SENDS the derived fields (see the request DTOs
 * in `apps/api/src/admin/courts/admin-courts.dto.ts`); it only ever reads them
 * back here.
 */
export const AdminCourtDetailSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: CourtStatus,
  isLocked: z.boolean(),
  isFeatured: z.boolean(),
  countryId: z.string(),
  regionId: z.string(),
  country: AdminRefSchema,
  region: AdminRefSchema,
  surface: Surface,
  setting: z.string(),
  access: AccessType,
  indoorOutdoor: IndoorOutdoor,
  isScenic: z.boolean(),
  blurb: z.string(),
  tags: z.array(CourtTag),
  /** Exact geo — admin-only surface, never on a public response. */
  lat: z.number(),
  lng: z.number(),
  mapLinkUrl: z.string().nullable(),
  /** Server-computed (decision 8) — recomputed only when lat/lng change. */
  approxLat: z.number(),
  approxLng: z.number(),
  /** Decorative screen position — set once at creation from the slug, never geo. */
  mapX: z.number().int(),
  mapY: z.number().int(),
  /** Set once at creation (`max(seedOrder) + 1`); never changed afterward. */
  seedOrder: z.number().int(),
  images: z.array(AdminCourtImageSchema),
  /** ISO-8601. */
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminCourtDetailDTO = z.infer<typeof AdminCourtDetailSchema>;

/** 422 body when a publish attempt fails the publishing gate (decision 10). */
export const PublishGateErrorSchema = z.object({
  message: z.string(),
  missing: z.array(z.string()),
});
export type PublishGateErrorDTO = z.infer<typeof PublishGateErrorSchema>;

/** One row of `GET /v1/admin/countries` — ALL countries, with their regions. */
export const AdminCountrySchema = z.object({
  id: z.string(),
  name: z.string(),
  isoCode: z.string(),
  continent: Continent,
  regions: z.array(AdminRefSchema),
});
export type AdminCountryDTO = z.infer<typeof AdminCountrySchema>;

/** Response of `POST /v1/admin/countries`. */
export const AdminCountryCreatedSchema = z.object({
  id: z.string(),
  name: z.string(),
  isoCode: z.string(),
  continent: Continent,
});
export type AdminCountryCreatedDTO = z.infer<typeof AdminCountryCreatedSchema>;

/** Response of `POST /v1/admin/regions`. */
export const AdminRegionCreatedSchema = z.object({
  id: z.string(),
  name: z.string(),
  countryId: z.string(),
  lat: z.number(),
  lng: z.number(),
});
export type AdminRegionCreatedDTO = z.infer<typeof AdminRegionCreatedSchema>;
