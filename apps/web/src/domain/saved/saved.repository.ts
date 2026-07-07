// Saved domain — repository INTERFACE.
//
// The contract the Saved page's data source must satisfy (Architecture Plan Decision
// #7 / Phase 1 §1.1, and docs/FEATURE_19_SAVED_PAGE_LAYOUT.md §4). UI depends ONLY on
// this interface; a factory decides which implementation is wired in (mock now, an
// auth-backed implementation in Phase 4), so the swap is a configuration change, not
// a UI rewrite (Architecture Plan §9 Risk #7 — the mock returns User-shaped data, not
// a flat boolean).
//
// MUTATION NOTE (Feature 34):
//   • Phase 1 originally shipped this interface READ-ONLY (Decision #11): no
//     toggleSavedCourt, no createUserCollection, no mutation of any kind.
//   • The new design wave (FEATURE_28_NEW_DESIGNS_INTAKE §4) requires the first
//     user-collection MUTATIONS — create a folder, toggle a court in/out, rename —
//     to drive the Create-Collection modal (Feature 35) and the Add-to-Collection
//     menu (Feature 36).
//   • These mutating methods are a LOCAL MOCK SEAM ONLY. There is no backend, no API,
//     no auth/session, and no persistence behind them in Phase 1 — they mutate the
//     mock repository's in-memory state (see mock-saved.repository.ts).
//   • The HTTP implementation comes LATER (Phase 4): the same method signatures get an
//     auth-backed implementation against `POST /v1/me/collections`,
//     `POST/DELETE /v1/me/collections/:id/courts/:courtId` (ARCHITECTURE_PLAN §4), so
//     the UI never changes when the real backend lands.
//
// STANDALONE SAVE/UNSAVE (Saved-court flow audit): `saveCourt` / `unsaveCourt` — the
// individual heart/bookmark toggle, distinct from collection-folder membership above —
// are now part of this interface. Phase 1 originally deferred them ("a later feature wires
// the real toggle"); the API landed them in Feature 54 (POST/DELETE /v1/me/saved-courts),
// but the web repository + UI were never wired, so the working endpoints were unreachable.
// These two methods close that gap. Both are idempotent (matching the API + mock), so the
// caller need not read-before-write; a single `isCourtSaved` read seeds the initial state.
//
// Signatures are typed against `@tennis/contracts` DTOs so the data shape is defined
// exactly once and reused by both the mock and the real (HTTP) repository.

import type {
  CourtSummaryDTO,
  UserCollectionDTO,
  UserCollectionWithCourtsDTO,
} from '@tennis/contracts';

export interface SavedRepository {
  // ── Reads ──────────────────────────────────────────────────────────────────

  /** The user's saved courts as lightweight summaries (card/grid/pin shape). */
  getSavedCourts(): Promise<CourtSummaryDTO[]>;

  /**
   * The user's wishlist folders ("user collections"), reflecting any in-session
   * mutations (create/rename/toggle) applied to the mock seam.
   */
  getSavedCollections(): Promise<UserCollectionDTO[]>;

  /**
   * A single wishlist folder + its member courts, by routing slug — the read path for
   * the per-folder detail page (`/saved/collections/[slug]`). Resolves from the current
   * (possibly mutated) state and to `null` when no folder matches the slug (the page
   * renders a 404). Member courts are `CourtSummaryDTO[]` — exact lat/lng is never
   * exposed.
   */
  getUserCollectionBySlug(slug: string): Promise<UserCollectionWithCourtsDTO | null>;

  /**
   * The ids of the folders that currently contain `courtId` — the membership read for
   * the Court Detail "Add to Collection" menu (Feature 36). Returns only the matching
   * folder ids (NOT each folder's full membership), so the client learns just "which of
   * my folders contain THIS court" and can seed the menu's checkmark state. This keeps
   * `UserCollectionDTO` minimal — the seed-only `courtIds` stays an internal join, never
   * a broadly-exposed wire field. Returns `[]` when the court is in no folder. Read-only.
   */
  getCollectionIdsForCourt(courtId: string): Promise<string[]>;

  /**
   * Whether `courtId` is in the user's individual saved courts (the standalone heart
   * state, NOT collection membership). Seeds the Court Detail save button's initial
   * pressed state. Derived from the same source as `getSavedCourts()` — a court is saved
   * iff it appears there. Read-only; returns `false` for an unknown/unsaved court.
   */
  isCourtSaved(courtId: string): Promise<boolean>;

  // ── Mutations (mock-only seam — see MUTATION NOTE above) ─────────────────────

  /**
   * Create a new (empty) wishlist folder from a display name. The name is trimmed; an
   * empty/whitespace-only name is rejected. A stable, unique `slug` is derived from the
   * name (kebab-cased; deduped as `summer-trip`, `summer-trip-2`, …). Returns the
   * created folder. Mock-only — no backend/auth/persistence.
   */
  createUserCollection(name: string): Promise<UserCollectionDTO>;

  /**
   * Toggle a court's membership in a folder by id: add it if absent, remove it if
   * present. Updates the folder's derived `count` and cover thumbnails. No-op on an
   * unknown folder id. Mock-only.
   */
  toggleCourtInCollection(collectionId: string, courtId: string): Promise<void>;

  /**
   * Rename a folder by id. The name is trimmed; an empty/whitespace-only name is
   * rejected. The `slug` is re-derived from the new name (kept unique against the other
   * folders), and member courts are preserved. Returns the updated folder. Mock-only.
   */
  renameUserCollection(collectionId: string, name: string): Promise<UserCollectionDTO>;

  // ── Individual saved courts (standalone heart — API-backed) ──────────────────

  /**
   * Save a court to the user's individual saved courts (the standalone heart). Idempotent:
   * saving an already-saved court is a no-op. In `api` mode → POST /v1/me/saved-courts; in
   * mock mode → the in-memory saved list. Returns `void` (the API's returned summary is
   * discarded — the caller already has the court).
   */
  saveCourt(courtId: string): Promise<void>;

  /**
   * Unsave a court from the user's individual saved courts. Idempotent: unsaving a court
   * that isn't saved is a no-op. In `api` mode → DELETE /v1/me/saved-courts/:courtId; in
   * mock mode → the in-memory saved list.
   */
  unsaveCourt(courtId: string): Promise<void>;
}
