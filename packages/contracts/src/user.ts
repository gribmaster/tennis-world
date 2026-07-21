import { z } from 'zod';
import { CourtSummarySchema } from './court';
import { EntitlementKind, EntitlementSource, EntitlementStatus } from './enums';

// ─────────────────────────────────────────────────────────────────────────────
// User & Entitlement DTOs — INTENTIONALLY MINIMAL STUBS (Phase 0).
//
// Auth and payments are Phase 4 (Decision #11). These shapes exist only so that
// Phase 1's mock UserRepository can return a User-shaped object (Risk #7) rather
// than a flat boolean, and so the enums have a home. Do NOT elaborate these here —
// the full Entitlement model (receiptRef, grantedAt, revokedAt, revokedReason,
// grantedByAdminId, refund flows) is Phase 4 work (Decision #12).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Membership badge state surfaced in the UI. `subscription` is a currently-active
 * recurring Stripe subscription; `lifetime` is a one-time/lifetime unlock (kept for
 * back-compat with existing lifetime entitlement data — do NOT collapse it into
 * `subscription`). `free` is the no-entitlement default.
 */
export const MembershipStatus = z.enum(['free', 'subscription', 'lifetime']);
export type MembershipStatus = z.infer<typeof MembershipStatus>;

/** Minimal profile shape consumed by the Phase-1 mock user repository. */
export const UserProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  initials: z.string(),
  membership: MembershipStatus,
  /**
   * Whether the user's currently-active `subscription` is scheduled to end at
   * `activeUntil` rather than auto-renew (Stripe `cancel_at_period_end`). OPTIONAL and
   * present only for an active subscription — omitted (not `false`) for `free`/`lifetime`
   * so the UI never renders a cancellation notice for a plan that isn't ending. Derived
   * server-side from the effective entitlement; never a raw entitlement-metadata blob.
   */
  cancelAtPeriodEnd: z.boolean().optional(),
  /**
   * ISO-8601 date the current paid access ends — the subscription's current period end
   * (same value whether or not it's set to auto-renew). OPTIONAL/null: absent for `free`
   * (nothing to show) and `lifetime` (no expiration to report, never a misleading date).
   */
  activeUntil: z.string().nullable().optional(),
});
export type UserProfileDTO = z.infer<typeof UserProfileSchema>;

/**
 * User wishlist folder ("Honeymoon 2026"-style) — the user's OWN saved-collection,
 * distinct from the editorial `CollectionDTO`. INTENTIONALLY MINIMAL for Phase 1:
 * just enough for the Saved page's Collections tab to render a folder row (name +
 * count + a couple of cover thumbnails) and to route into the per-folder detail view.
 * The full UserCollection / membership model (sort order, create/rename/delete) is
 * Phase 4 work (Architecture Plan §2 `UserCollection`, Decision #11) — do NOT
 * elaborate here.
 */
export const UserCollectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Number of courts in the folder (derived; display-only in Phase 1). */
  count: z.number().int(),
  /** A few court hero images for the row's thumbnail stack. */
  coverImageUrls: z.array(z.string()).optional(),
  /**
   * Routing key for the per-folder detail view (`/saved/collections/[slug]`,
   * Feature 33). Required — every folder is addressable.
   */
  slug: z.string(),
});
export type UserCollectionDTO = z.infer<typeof UserCollectionSchema>;

/**
 * A user wishlist folder together with the member courts it contains — the shape the
 * user-collection detail page (`/saved/collections/[slug]`) reads. Mirrors the
 * editorial `CollectionWithCourtsDTO` pattern: the folder fields plus resolved
 * `CourtSummaryDTO[]` (lightweight, approximate-geo-only — never exact lat/lng). The
 * detail page renders entirely from this; it does not re-resolve membership.
 */
export const UserCollectionWithCourtsSchema = UserCollectionSchema.extend({
  courts: z.array(CourtSummarySchema),
});
export type UserCollectionWithCourtsDTO = z.infer<typeof UserCollectionWithCourtsSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Phase-4 request DTOs (Feature 51 groundwork) — the small write-shapes the
// /v1/me endpoints (Features 53/55) will accept. SHAPES ONLY: no endpoint, no repo,
// no behavior is added here. The RESPONSE shapes are the already-stable DTOs above
// (`UserProfileDTO`, `UserCollectionDTO`) — these are only the request bodies.
//
// Like the auth DTOs, the API derives its class-validator request classes from these
// types (imported `type`-only; [[api-contracts-type-only-import]]); the zod schema is
// the structural source of truth. The existing public/read DTOs above are UNCHANGED
// (web depends on `UserProfileDTO` / `UserCollectionDTO` / `UserCollectionWithCourtsDTO`
// by those exact names — do not rename them).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Body for `POST /v1/me/collections` — create a wishlist folder from a display name.
 * The server trims and derives a unique-per-user `slug` (same algorithm as the web
 * mock's `slugifyCollectionName` + `ensureUniqueSlug`); the response is the created
 * `UserCollectionDTO`.
 */
export const CreateUserCollectionSchema = z.object({
  name: z.string(),
});
export type CreateUserCollectionDTO = z.infer<typeof CreateUserCollectionSchema>;

/**
 * Body for `PATCH /v1/me/collections/:id` — rename a folder (re-derives the slug).
 * Same trivial `{ name }` shape as create; kept distinct so the two endpoints can
 * diverge later without a breaking change. Response is the updated `UserCollectionDTO`.
 */
export const RenameUserCollectionSchema = z.object({
  name: z.string(),
});
export type RenameUserCollectionDTO = z.infer<typeof RenameUserCollectionSchema>;

/**
 * Body for `POST /v1/me/collections/:id/courts` (and the saved-courts add) — the
 * court being added to a folder / saved list, by id. The matching remove is a path
 * param on a DELETE, so it needs no body.
 */
export const CourtIdRefSchema = z.object({
  courtId: z.string(),
});
export type CourtIdRefDTO = z.infer<typeof CourtIdRefSchema>;

/**
 * Body for `PATCH /v1/me` — update the current user's profile. Only `name` is
 * editable in the Phase-4 scope (the Profile screen has no edit UI yet, Feature 50
 * §4.2 — this exists so the endpoint has a contract when one is built). `membership`
 * is entitlement-derived and NOT user-editable; `email` is the login key and not
 * patched here.
 */
export const UpdateProfileSchema = z.object({
  name: z.string().optional(),
});
export type UpdateProfileDTO = z.infer<typeof UpdateProfileSchema>;

/** Stub only. Expanded in Phase 4 (Decision #12). */
export const EntitlementSchema = z.object({
  id: z.string(),
  userId: z.string(),
  kind: EntitlementKind,
  status: EntitlementStatus,
  source: EntitlementSource,
  expiresAt: z.string().nullable(),
});
export type EntitlementDTO = z.infer<typeof EntitlementSchema>;
