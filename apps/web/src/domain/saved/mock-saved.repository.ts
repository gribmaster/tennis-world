// Saved domain — MOCK repository implementation.
//
// Reads the shared dataset from `@tennis/mock-data` (Architecture Plan Decision #5)
// and resolves the user's saved items IN MEMORY. This adapter owns the join logic
// (saved slugs → court summaries); it does NOT own the dataset — that lives in
// `packages/mock-data` so the same data later seeds Postgres in Phase 2 with zero
// drift.
//
// MUTATION SEAM (Feature 34): the user-collection folders are now MUTABLE in-memory —
// create / toggle-court / rename — to back the Create-Collection modal (Feature 35)
// and Add-to-Collection menu (Feature 36). This is a LOCAL MOCK SEAM ONLY: NO backend,
// NO API, NO auth/session, NO localStorage, NO persistence (Decision #11). The HTTP
// implementation arrives in Phase 4 behind the same interface.
//
//   DEMO-ONLY STATE: the folder state is held on this instance, seeded (cloned) from
//   `DEFAULT_USER_COLLECTIONS` at construction. The instance is an ES-module singleton
//   (via `lib/repositories.ts`), so a folder created during a session survives
//   client-side navigation within that session — but because pages are SERVER
//   components, the state lives in the SERVER process and MAY RESET across dev server
//   reloads / between server instances. That is acceptable for a Phase-1 demo and is
//   exactly the swap point the Phase-4 auth-backed repository replaces.
//
// The imported `DEFAULT_USER_COLLECTIONS` objects are NEVER mutated — the seed is
// cloned/normalized into internal mutable folders. `count` and `coverImageUrls` are
// DERIVED from live membership on every projection, so a toggle/rename stays consistent
// without bookkeeping.
//
// Plain TypeScript only — no React, no Next.js — so it is independently unit-testable
// (Phase 1 §1.2). Wiring it into the app is the factory's job, not this file's.

import { COURTS, DEFAULT_SAVED_COURT_SLUGS, DEFAULT_USER_COLLECTIONS } from '@tennis/mock-data';
import type {
  CourtSummaryDTO,
  UserCollectionDTO,
  UserCollectionWithCourtsDTO,
} from '@tennis/contracts';
import type { SavedRepository } from './saved.repository';

// `COURTS` from mock-data is structurally a full CourtDTO (blurb, images, status,
// exact lat/lng). Project down to the lightweight summary — the SAME projection the
// court repository uses — so exact lat/lng never leak into a summary the UI receives.
type MockCourt = (typeof COURTS)[number];

function toSummary(court: MockCourt): CourtSummaryDTO {
  return {
    id: court.id,
    slug: court.slug,
    name: court.name,
    country: court.country,
    region: court.region,
    surface: court.surface,
    setting: court.setting,
    access: court.access,
    indoorOutdoor: court.indoorOutdoor,
    isScenic: court.isScenic,
    isFeatured: court.isFeatured,
    isLocked: court.isLocked,
    heroImageUrl: court.heroImageUrl,
    // mapCoords is the decorative [x%, y%] screen position used by the Wishlist map.
    mapCoords: court.mapCoords,
    // Always-public approximate geo only — exact lat/lng never enter the summary.
    approxLat: court.approxLat,
    approxLng: court.approxLng,
  };
}

// Internal mutable folder shape. Only the durable bits are stored; `count` and
// `coverImageUrls` are DERIVED from `courtIds` at projection time (see toDTO).
interface MutableFolder {
  id: string;
  slug: string;
  name: string;
  courtIds: string[];
}

const COVER_COUNT = 3;

// ── Pure helpers (no instance state) ──────────────────────────────────────────

/**
 * Kebab-case a display name the SAME way the prototype derives a collection id
 * (`name.toLowerCase().replace(/[^a-z0-9]+/g,'-')`), additionally trimming any leading
 * or trailing hyphens so " Summer Trip! " → "summer-trip". Returns '' if the name has
 * no slug-able characters (caller decides the fallback).
 */
export function slugifyCollectionName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Ensure a slug is unique against `existingSlugs`, appending `-2`, `-3`, … on collision
 * (so a second "Summer Trip" becomes `summer-trip-2`). `currentSlug`, when supplied, is
 * the folder's own slug being renamed — it is excluded from the collision set so a
 * no-op rename keeps the same slug.
 */
export function ensureUniqueSlug(
  base: string,
  existingSlugs: Iterable<string>,
  currentSlug?: string,
): string {
  const taken = new Set(existingSlugs);
  if (currentSlug) taken.delete(currentSlug);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

// Cover thumbnails for a folder: the hero images of its first few member courts —
// derived from live membership, mirroring mock-data's `coversFor`.
function coversFor(courtIds: string[]): string[] {
  return courtIds
    .map((id) => COURTS.find((c) => c.id === id))
    .filter((c): c is MockCourt => c !== undefined)
    .slice(0, COVER_COUNT)
    .map((c) => c.heroImageUrl);
}

export class MockSavedRepository implements SavedRepository {
  // Resolve saved slugs → summaries once, seeding the in-memory saved list. Preserve the
  // order of the saved-slug list (the user's save order), and skip any slug with no
  // matching published court. MUTABLE (not `readonly`): the standalone save/unsave methods
  // add/remove entries here, mirroring the API's individual saved-courts store. As with the
  // folder seam this is DEMO-ONLY in-memory state (may reset across server reloads).
  private savedCourts: CourtSummaryDTO[] = DEFAULT_SAVED_COURT_SLUGS.map((slug) =>
    COURTS.find((c) => c.slug === slug && c.status === 'published'),
  )
    .filter((c): c is MockCourt => c !== undefined)
    .map(toSummary);

  // In-memory wishlist folders, seeded by CLONING the mock-data seed (the imported
  // objects are never mutated). Only durable fields are kept; count/covers are derived.
  private readonly folders: MutableFolder[] = DEFAULT_USER_COLLECTIONS.map((seed) => ({
    id: seed.id,
    slug: seed.slug,
    name: seed.name,
    courtIds: [...seed.courtIds],
  }));

  // Monotonic counter for generated folder ids (`user-col-1`, `user-col-2`, …). Kept
  // deterministic (no Date.now()/random) so construction is server-safe and stable.
  private nextId = 1;

  // ── Reads ──────────────────────────────────────────────────────────────────

  async getSavedCourts(): Promise<CourtSummaryDTO[]> {
    // Copy so callers can't mutate the cached summaries.
    return this.savedCourts.map((c) => ({ ...c }));
  }

  async getSavedCollections(): Promise<UserCollectionDTO[]> {
    // Project current in-memory folders to the minimal wire DTO (count + covers derived).
    return this.folders.map((f) => this.toDTO(f));
  }

  async getUserCollectionBySlug(slug: string): Promise<UserCollectionWithCourtsDTO | null> {
    const folder = this.folders.find((f) => f.slug === slug);
    if (!folder) return null;

    // Resolve membership ids → published court summaries, preserving the folder's
    // order and skipping any id with no matching published court. `toSummary` is the
    // SAME projection used everywhere else, so exact lat/lng never enter the result.
    const courts: CourtSummaryDTO[] = folder.courtIds
      .map((id) => COURTS.find((c) => c.id === id && c.status === 'published'))
      .filter((c): c is MockCourt => c !== undefined)
      .map(toSummary);

    return { ...this.toDTO(folder), courts };
  }

  async getCollectionIdsForCourt(courtId: string): Promise<string[]> {
    // Only the ids of the folders that contain this court — not each folder's full
    // membership. Mirrors the live (possibly mutated) folder state.
    return this.folders.filter((f) => f.courtIds.includes(courtId)).map((f) => f.id);
  }

  async isCourtSaved(courtId: string): Promise<boolean> {
    // Derived from the same in-memory saved list `getSavedCourts` projects — a court is
    // saved iff it's present there. Matches the HTTP repo's list-derived membership check.
    return this.savedCourts.some((c) => c.id === courtId);
  }

  // ── Mutations (mock-only in-memory seam) ─────────────────────────────────────

  async createUserCollection(name: string): Promise<UserCollectionDTO> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Collection name is required.');
    }

    // Derive a stable, unique slug; fall back to the generated id if the name has no
    // slug-able characters (e.g. all punctuation).
    const base = slugifyCollectionName(trimmed) || `user-col-${this.nextId}`;
    const slug = ensureUniqueSlug(
      base,
      this.folders.map((f) => f.slug),
    );

    const folder: MutableFolder = {
      id: `user-col-${this.nextId}`,
      slug,
      name: trimmed,
      courtIds: [],
    };
    this.nextId += 1;
    this.folders.push(folder);

    return this.toDTO(folder);
  }

  async toggleCourtInCollection(collectionId: string, courtId: string): Promise<void> {
    const folder = this.folders.find((f) => f.id === collectionId);
    if (!folder) return; // no-op on unknown folder

    const idx = folder.courtIds.indexOf(courtId);
    if (idx >= 0) {
      folder.courtIds.splice(idx, 1); // remove, preserving the order of the rest
    } else {
      folder.courtIds.push(courtId); // add to the end (preserve insertion order)
    }
    // count + coverImageUrls are derived from courtIds at projection time — nothing
    // else to update here.
  }

  async renameUserCollection(collectionId: string, name: string): Promise<UserCollectionDTO> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Collection name is required.');
    }

    const folder = this.folders.find((f) => f.id === collectionId);
    if (!folder) {
      throw new Error(`Unknown collection: ${collectionId}`);
    }

    folder.name = trimmed;
    // Re-derive the slug from the new name, kept unique against the OTHER folders (the
    // folder's own current slug is excluded so a no-op rename is stable). Member courts
    // are untouched.
    const base = slugifyCollectionName(trimmed) || folder.slug;
    folder.slug = ensureUniqueSlug(
      base,
      this.folders.map((f) => f.slug),
      folder.slug,
    );

    return this.toDTO(folder);
  }

  // ── Individual saved courts (standalone heart — mock-only in-memory seam) ─────

  async saveCourt(courtId: string): Promise<void> {
    // Idempotent (mirrors the API's PK upsert): a re-save is a no-op. Resolve the court
    // to a summary the SAME way the seed does — only a real, published court can be saved
    // (matches the API's 404-on-unpublished/unknown), and exact lat/lng never enter the
    // summary. Appended to the end of the in-memory list (the mock preserves seed/insert
    // order on read; the API orders `savedAt desc` — the difference is invisible to the
    // save/unsave audit, which only checks presence, and the mock read order is unchanged).
    if (this.savedCourts.some((c) => c.id === courtId)) return;
    const court = COURTS.find((c) => c.id === courtId && c.status === 'published');
    if (!court) return; // unknown/unpublished court — no-op, no dangling save
    this.savedCourts.push(toSummary(court));
  }

  async unsaveCourt(courtId: string): Promise<void> {
    // Idempotent: unsaving a court that isn't saved is a no-op (no error).
    this.savedCourts = this.savedCourts.filter((c) => c.id !== courtId);
  }

  // Project an internal folder down to the minimal `UserCollectionDTO` wire shape,
  // deriving `count` and `coverImageUrls` from live membership and copying arrays
  // defensively (the seed-only `courtIds` membership is not part of the wire DTO).
  private toDTO(folder: MutableFolder): UserCollectionDTO {
    const coverImageUrls = coversFor(folder.courtIds);
    return {
      id: folder.id,
      slug: folder.slug,
      name: folder.name,
      count: folder.courtIds.length,
      coverImageUrls: coverImageUrls.length > 0 ? coverImageUrls : undefined,
    };
  }
}
