// Saved domain — HTTP repository implementation (Phase 4, `api` data source).
//
// Implements the SAME `SavedRepository` interface as `MockSavedRepository`, backed by
// the protected `/v1/me/*` collection endpoints (Features 54/55). This is the Phase-4
// swap the interface was designed for (saved.repository.ts MUTATION NOTE) — the UI
// (Saved page, Add-to-Collection menu, Create/Rename modals) never changes.
//
// NOT WIRED YET (Feature 56): the factory keeps `saved` on the mock in `api` mode
// until Feature 57 flips it. This class is added + verified directly
// (scripts/verify-user-saved-http.ts) so it is ready to drop in.
//
// ENDPOINT MAP (Feature 55 controller + Feature 54 saved-courts controller):
//   getSavedCourts()                       → GET    /v1/me/saved-courts
//   isCourtSaved(courtId)                  → GET    /v1/me/saved-courts (membership check)
//   saveCourt(courtId)                     → POST   /v1/me/saved-courts   { courtId }
//   unsaveCourt(courtId)                   → DELETE /v1/me/saved-courts/:courtId
//   getSavedCollections()                  → GET    /v1/me/collections
//   getUserCollectionBySlug(slug)          → GET    /v1/me/collections/:slug  (404→null)
//   getCollectionIdsForCourt(courtId)      → GET    /v1/me/courts/:courtId/collection-ids
//   createUserCollection(name)             → POST   /v1/me/collections   { name }
//   renameUserCollection(id, name)         → PATCH  /v1/me/collections/:id { name }
//   toggleCourtInCollection(id, courtId)   → POST   /v1/me/collections/:id/courts { courtId }
//                                          | DELETE /v1/me/collections/:id/courts/:courtId
//
// ── TOGGLE BRIDGE (prompt task 4; intake §12 Q1) ─────────────────────────────────
// The web interface exposes a single idempotent-feeling
//   toggleCourtInCollection(collectionId, courtId): Promise<void>
// but the API has EXPLICIT add (POST) / remove (DELETE) — it has no "toggle" route,
// and the interface gives us no desired-next-state flag. To bridge without changing
// the interface or the UI in this feature, we READ-BEFORE-WRITE:
//   1. read the court's current folder membership (getCollectionIdsForCourt),
//   2. if `collectionId` is already in it → DELETE (remove),
//   3. else → POST (add).
// This costs ONE extra request per toggle (the membership read) — an accepted,
// documented trade-off (intake §12 Q1) that keeps the interface and UI untouched.
// Feature 57 may later pass the desired state from the island (it already tracks the
// checkmark) and drop the extra read. Returns `void` to match the interface; the
// API's returned WithCourts DTO is discarded here.
//
// AUTH TRANSPORT: the constructor takes optional `HttpAuthOptions` (cookie / bearer /
// browser-include), forwarded on every request — same shape as HttpUserRepository.
//
// MASKING: the API masks exact lat/lng server-side (every member-court read uses the
// public `courtSummarySelect`), so no coordinate field is ever present in the court
// data this repo returns; it does not (and must not) add one. SLUG generation is the
// SERVER's job (CollectionsService) — this repo never derives a slug.
//
// Response typing follows the same "type assertion, not zod" choice documented in the
// other HTTP repositories; the DTO TYPES come from `@tennis/contracts`.

import type {
  CourtSummaryDTO,
  UserCollectionDTO,
  UserCollectionWithCourtsDTO,
} from '@tennis/contracts';
import type { SavedRepository } from '../saved/saved.repository';
import {
  deleteJson,
  getJson,
  getJsonOrNull,
  patchJson,
  postJson,
  type HttpAuthOptions,
} from './http-client';

export class HttpSavedRepository implements SavedRepository {
  constructor(private readonly auth: HttpAuthOptions = {}) {}

  // ── Reads ──────────────────────────────────────────────────────────────────

  /** GET /v1/me/saved-courts — the authed user's saved courts (public summaries). */
  async getSavedCourts(): Promise<CourtSummaryDTO[]> {
    return getJson<CourtSummaryDTO[]>('/me/saved-courts', this.auth);
  }

  /** GET /v1/me/collections — the authed user's wishlist folders (count + covers derived). */
  async getSavedCollections(): Promise<UserCollectionDTO[]> {
    return getJson<UserCollectionDTO[]>('/me/collections', this.auth);
  }

  /** GET /v1/me/collections/:slug — one folder + its members; 404 maps to `null`. */
  async getUserCollectionBySlug(
    slug: string,
  ): Promise<UserCollectionWithCourtsDTO | null> {
    return getJsonOrNull<UserCollectionWithCourtsDTO>(
      `/me/collections/${encodeURIComponent(slug)}`,
      this.auth,
    );
  }

  /** GET /v1/me/courts/:courtId/collection-ids — ids of the user's folders holding this court. */
  async getCollectionIdsForCourt(courtId: string): Promise<string[]> {
    return getJson<string[]>(
      `/me/courts/${encodeURIComponent(courtId)}/collection-ids`,
      this.auth,
    );
  }

  /**
   * Whether this court is in the user's individual saved courts. The API has no dedicated
   * "is-saved" endpoint (Feature 54 exposes list/save/unsave only), so we derive it from
   * the saved-courts LIST — a court is saved iff its id appears there. One extra request,
   * used once on the server to seed the button's initial state (never in a hot path).
   */
  async isCourtSaved(courtId: string): Promise<boolean> {
    const saved = await this.getSavedCourts();
    return saved.some((c) => c.id === courtId);
  }

  // ── Mutations ────────────────────────────────────────────────────────────────

  /** POST /v1/me/collections { name } — create an empty folder; server derives the slug. */
  async createUserCollection(name: string): Promise<UserCollectionDTO> {
    return postJson<UserCollectionDTO>('/me/collections', { name }, this.auth);
  }

  /** PATCH /v1/me/collections/:id { name } — rename a folder; server re-derives the slug. */
  async renameUserCollection(
    collectionId: string,
    name: string,
  ): Promise<UserCollectionDTO> {
    return patchJson<UserCollectionDTO>(
      `/me/collections/${encodeURIComponent(collectionId)}`,
      { name },
      this.auth,
    );
  }

  /**
   * Toggle a court's membership in a folder — the read-before-write bridge over the
   * API's explicit add/remove (see the TOGGLE BRIDGE note in the file header). Reads
   * the court's current membership, then DELETEs if present or POSTs if absent. The
   * API's returned WithCourts DTO is discarded — the interface returns `void`.
   */
  async toggleCourtInCollection(
    collectionId: string,
    courtId: string,
  ): Promise<void> {
    const memberOf = await this.getCollectionIdsForCourt(courtId);
    if (memberOf.includes(collectionId)) {
      await deleteJson<UserCollectionWithCourtsDTO>(
        `/me/collections/${encodeURIComponent(collectionId)}/courts/${encodeURIComponent(courtId)}`,
        this.auth,
      );
    } else {
      await postJson<UserCollectionWithCourtsDTO>(
        `/me/collections/${encodeURIComponent(collectionId)}/courts`,
        { courtId },
        this.auth,
      );
    }
  }

  // ── Individual saved courts (standalone heart — Feature 54 endpoints) ─────────

  /**
   * POST /v1/me/saved-courts { courtId } — save a court (idempotent server-side; a
   * re-save is a no-op 201). The API returns the court summary; we discard it (the
   * interface is `void` — the caller already has the court).
   */
  async saveCourt(courtId: string): Promise<void> {
    await postJson<CourtSummaryDTO>('/me/saved-courts', { courtId }, this.auth);
  }

  /**
   * DELETE /v1/me/saved-courts/:courtId — unsave a court (idempotent server-side; a
   * repeat/never-saved unsave still succeeds with `{ ok: true }`, discarded here).
   */
  async unsaveCourt(courtId: string): Promise<void> {
    await deleteJson<{ ok: true }>(
      `/me/saved-courts/${encodeURIComponent(courtId)}`,
      this.auth,
    );
  }
}
