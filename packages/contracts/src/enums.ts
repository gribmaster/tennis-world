import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Enums — the cheapest, highest-leverage shared definitions (Architecture Plan §2).
// Defined first so DTOs and (later) Prisma can both reference the same vocabulary.
// Each is a zod enum so it doubles as a runtime validator; the TS union type is
// inferred from it.
// ─────────────────────────────────────────────────────────────────────────────

export const Surface = z.enum(['Clay', 'Hard', 'Grass']);
export type Surface = z.infer<typeof Surface>;

export const AccessType = z.enum(['Resort', 'Club', 'Academy', 'Private']);
export type AccessType = z.infer<typeof AccessType>;

export const IndoorOutdoor = z.enum(['Indoor', 'Outdoor']);
export type IndoorOutdoor = z.infer<typeof IndoorOutdoor>;

export const SkillLevel = z.enum(['Beginner', 'Intermediate', 'Advanced', 'Pro']);
export type SkillLevel = z.infer<typeof SkillLevel>;

export const GroupSize = z.enum(['Solo', 'Couple', 'Family', 'Group']);
export type GroupSize = z.infer<typeof GroupSize>;

export const Continent = z.enum(['Europe', 'Asia', 'Americas', 'Africa', 'Oceania']);
export type Continent = z.infer<typeof Continent>;

export const CourtStatus = z.enum(['draft', 'published']);
export type CourtStatus = z.infer<typeof CourtStatus>;

export const CollectionType = z.enum(['editorial', 'system']);
export type CollectionType = z.infer<typeof CollectionType>;

// ─────────────────────────────────────────────────────────────────────────────
// Court tags — the CLOSED "Experience" vocabulary (Feature 72).
//
// This covers the experience/scenery dimension ONLY. Surface, access,
// indoor/outdoor and scenic already have their own fields (`surface`, `access`,
// `indoorOutdoor`, `isScenic`) and MUST NOT be duplicated here — a chip row must
// never show the same fact twice, and a filter needs a closed set.
//
// The declaration order below is the CANONICAL RENDER/STORAGE ORDER. Authored
// order is not stable across the mock dataset and the content importer, so both
// paths normalize through `orderCourtTags` before emitting a court — otherwise
// `verify:api-parity` fails on ordering alone.
// ─────────────────────────────────────────────────────────────────────────────

export const CourtTag = z.enum([
  'Sea View',
  'Beach Club',
  'Mountains',
  'Lakeside',
  'Garden',
  'Historic',
  'Jungle',
  'Island',
  'Rooftop',
  'Countryside',
]);
export type CourtTag = z.infer<typeof CourtTag>;

/** The vocabulary in canonical order. */
export const COURT_TAGS: readonly CourtTag[] = CourtTag.options;

/**
 * Normalize a tag list to the canonical vocabulary order, dropping duplicates.
 * The ONE place ordering is decided, so the mock dataset and the content
 * importer cannot drift (mock↔API parity depends on exact array equality).
 */
export function orderCourtTags(tags: readonly string[]): CourtTag[] {
  const present = new Set(tags);
  return COURT_TAGS.filter((tag) => present.has(tag));
}

// Entitlement vocabulary is fully modeled now (Decision #12) even though auth/
// payments are Phase 4 — the enums are well-specified and cheap to declare. The
// EntitlementDTO that uses them is intentionally only stubbed (see user.ts).
export const EntitlementKind = z.enum([
  'lifetime_unlock',
  'subscription',
  'promo_unlock',
  'manual_grant',
]);
export type EntitlementKind = z.infer<typeof EntitlementKind>;

export const EntitlementStatus = z.enum(['active', 'revoked', 'refunded', 'expired']);
export type EntitlementStatus = z.infer<typeof EntitlementStatus>;

export const EntitlementSource = z.enum([
  'stripe_web',
  'iap_ios',
  'iap_android',
  'promo_code',
  'admin',
]);
export type EntitlementSource = z.infer<typeof EntitlementSource>;
