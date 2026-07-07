import { z } from 'zod';
import { AccessType, CourtStatus, IndoorOutdoor, Surface } from './enums';

// ─────────────────────────────────────────────────────────────────────────────
// Court DTOs (Architecture Plan §2, §3).
//
// Two coordinate concerns are kept strictly separate (Architecture Plan §9 Risk
// #17): `mapCoords` is the [x%, y%] screen position for the stylized Phase-1 map
// canvas and is NEVER a geographic location. `lat`/`lng` (exact) and
// `approxLat`/`approxLng` (~10km offset, always public) are real-geo and back the
// server-side coordinate-masking boundary. Exact lat/lng are OPTIONAL on the wire
// because they are omitted for non-entitled requests (Phase 4); approx fields and
// mapCoords are always present.
// ─────────────────────────────────────────────────────────────────────────────

/** [x%, y%] position on the stylized map canvas. Not geographic. */
export const MapCoordsSchema = z.tuple([z.number(), z.number()]);
export type MapCoords = z.infer<typeof MapCoordsSchema>;

export const CourtImageSchema = z.object({
  url: z.string(),
  alt: z.string().optional(),
  isHero: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});
export type CourtImageDTO = z.infer<typeof CourtImageSchema>;

/** Lightweight shape for list/map/card views. */
export const CourtSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  country: z.string(),
  region: z.string(),
  surface: Surface,
  setting: z.string(),
  access: AccessType,
  indoorOutdoor: IndoorOutdoor,
  isScenic: z.boolean(),
  isFeatured: z.boolean(),
  isLocked: z.boolean(),
  heroImageUrl: z.string(),
  mapCoords: MapCoordsSchema,
  // Always-public approximate geo. Exact lat/lng are not part of the summary.
  approxLat: z.number(),
  approxLng: z.number(),
});
export type CourtSummaryDTO = z.infer<typeof CourtSummarySchema>;

/** Full detail shape for the court page. */
export const CourtSchema = CourtSummarySchema.extend({
  blurb: z.string(),
  images: z.array(CourtImageSchema),
  status: CourtStatus,
  // Exact coordinates — omitted for non-entitled requests (Phase 4 gating).
  lat: z.number().optional(),
  lng: z.number().optional(),
});
export type CourtDTO = z.infer<typeof CourtSchema>;

/** Map pin payload — country/region-grouped, no PostGIS (Risk #1). */
export const MapPinSchema = z.object({
  courtId: z.string(),
  slug: z.string(),
  mapCoords: MapCoordsSchema,
  state: z.enum(['open', 'locked', 'featured']),
});
export type MapPinDTO = z.infer<typeof MapPinSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Phase-5 groundwork (Feature 61) — exact-location response shape. SHAPE ONLY: no
// endpoint, no select, no mapper is added here (the protected
// `GET /v1/me/courts/:slug/exact-location` endpoint is Feature 63, intake §4).
//
// This is the ONLY DTO that ever carries exact `lat`/`lng`, and only the future
// entitled, authenticated path populates it — the public court selects/mappers stay
// structurally incapable of leaking coords (intake §4.6). `directionsUrl` is built
// SERVER-side from the exact coords so the masking boundary stays server-owned and
// the client never assembles a maps link itself.
// ─────────────────────────────────────────────────────────────────────────────

/** Exact coordinates + a ready-to-open directions deep link for an entitled viewer. */
export const ExactLocationSchema = z.object({
  courtId: z.string(),
  slug: z.string(),
  lat: z.number(),
  lng: z.number(),
  /** e.g. https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng> */
  directionsUrl: z.string(),
});
export type ExactLocationDTO = z.infer<typeof ExactLocationSchema>;
