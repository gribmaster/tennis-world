import { z } from 'zod';
import { Continent } from './enums';

// ─────────────────────────────────────────────────────────────────────────────
// Country aggregate DTO (Feature 75) — backs the Collections screen's "By Country"
// strip: a circular photo, the country name, and "N courts".
//
// AGGREGATE, NOT AN ENTITY READ. `courtCount` is DERIVED from the published courts
// in that country and `imageUrl` is DERIVED from a representative published court's
// hero image — neither is authored on `Country` (the model has `{ id, name, isoCode,
// continent, regions, courts }` and deliberately gains NO image column in this
// feature; curated per-country photography is a content decision with no content
// behind it yet, and would be an additive column plus an admin surface later, with
// this derived value becoming the fallback).
//
// GEO IS DELIBERATELY ABSENT. `Region.lat`/`lng` exist in the schema but MUST NOT
// appear here, directly or nested: this read carries no coordinates at any depth,
// and there are no nested objects at all. Country/region geo is not part of this
// surface (the ONE place exact coordinates are ever read stays the protected
// `GET /v1/me/courts/:slug/exact-location`).
// ─────────────────────────────────────────────────────────────────────────────

export const CountrySchema = z.object({
  /** Display name, e.g. `"Italy"`. */
  name: z.string(),
  /** ISO-3166 alpha-2 code, e.g. `"IT"` — the stable identity for this country. */
  isoCode: z.string(),
  /** Continent bucket (closed vocabulary, shared with the seed). */
  continent: Continent,
  /** Number of PUBLISHED courts in this country. Always >= 1 (see below). */
  courtCount: z.number().int(),
  /**
   * Hero image of the country's representative published court. Countries with no
   * published court are omitted from the response entirely, so this is never empty
   * for lack of a court.
   */
  imageUrl: z.string(),
});
export type CountryDTO = z.infer<typeof CountrySchema>;
