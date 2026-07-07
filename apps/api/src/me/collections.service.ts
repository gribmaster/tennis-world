import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  UserCollectionDTO,
  UserCollectionWithCourtsDTO,
} from '@tennis/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { courtSummarySelect } from '../courts/courts.mapper';
import {
  ensureUniqueSlug,
  slugifyCollectionName,
  toUserCollectionDTO,
  toUserCollectionWithCourtsDTO,
  type UserCollectionRow,
} from './collections.mapper';

// ─────────────────────────────────────────────────────────────────────────────
// CollectionsService — the authenticated user's wishlist folders ("user
// collections", Feature 55). Backs the future web `SavedRepository`'s collection
// methods (getSavedCollections / getUserCollectionBySlug / getCollectionIdsForCourt /
// createUserCollection / renameUserCollection / toggleCourtInCollection) — but NO web
// wiring is done in this feature.
//
// NOT the editorial Collection/CollectionCourt domain (Courts module) — these are the
// USER-OWNED UserCollection / UserCollectionCourt models. Every query is scoped to the
// `userId` the AuthGuard attached, so a user only ever touches their OWN folders, and a
// folder owned by another user is invisible (read → 404, mutate → 404), never a 403
// (we don't reveal that the id/slug exists for someone else).
//
// SLUG (prompt task 4): derived on create/rename with the API-local copy of the mock's
// `slugifyCollectionName` + `ensureUniqueSlug`, uniqueness scoped to THIS user's
// folders (the schema's `@@unique([userId, slug])` allows two users to share a slug).
//
// COORDINATE MASKING (prompt task 13): every member-court read uses the Courts module's
// PUBLIC `courtSummarySelect` (no lat/lng). The folder include filters members to
// PUBLISHED courts and orders them by `sortOrder asc`, so detail/covers reflect only
// live, published membership in stable insertion order (mirrors the mock).
//
// IDEMPOTENCY rides on `UserCollectionCourt`'s composite PK
// `@@id([userCollectionId, courtId])`: add = upsert (re-add is a no-op), remove =
// deleteMany on the PK (removing an absent court affects 0 rows, still succeeds).
// ─────────────────────────────────────────────────────────────────────────────

const PUBLISHED = 'published' as const;

/**
 * The folder include used by every read/return: durable folder fields + member rows
 * (PUBLISHED courts only, ordered by sortOrder) joined to the PUBLIC court summary
 * select. Typed once so the row shape matches `UserCollectionRow` exactly.
 */
const collectionWithCourtsArgs = {
  select: {
    id: true,
    slug: true,
    name: true,
    courts: {
      where: { court: { status: PUBLISHED } },
      orderBy: { sortOrder: 'asc' },
      select: { court: { select: courtSummarySelect } },
    },
  },
} satisfies Prisma.UserCollectionDefaultArgs;

// Compile-time check that the selected row is assignable to the mapper's row shape.
type SelectedCollectionRow = Prisma.UserCollectionGetPayload<typeof collectionWithCourtsArgs>;
type _AssertRowParity = SelectedCollectionRow extends UserCollectionRow ? true : never;
void (true as _AssertRowParity);

@Injectable()
export class CollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Reads ────────────────────────────────────────────────────────────────

  /**
   * GET /v1/me/collections — the authed user's folders as `UserCollectionDTO[]`
   * (count + covers derived). Ordered `createdAt asc` (oldest first) — a deterministic
   * order the static mock seed leaves to array order; createdAt-asc keeps a newly
   * created folder appended at the end, matching the mock's `this.folders.push`
   * (create appends). Returns `[]` when the user has no folders.
   */
  async listCollections(userId: string): Promise<UserCollectionDTO[]> {
    const rows = await this.prisma.userCollection.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      ...collectionWithCourtsArgs,
    });
    return rows.map((row) => toUserCollectionDTO(row));
  }

  /**
   * GET /v1/me/collections/:slug — one of the authed user's folders by slug, as
   * `UserCollectionWithCourtsDTO` (folder + member `CourtSummaryDTO[]`). 404 when no
   * folder with that slug belongs to this user (including when it belongs to another
   * user — the `@@unique([userId, slug])` lookup is naturally user-scoped). No lat/lng.
   */
  async getCollectionBySlug(
    userId: string,
    slug: string,
  ): Promise<UserCollectionWithCourtsDTO> {
    const row = await this.prisma.userCollection.findUnique({
      where: { userId_slug: { userId, slug } },
      ...collectionWithCourtsArgs,
    });
    if (!row) {
      throw new NotFoundException(`Collection "${slug}" not found.`);
    }
    return toUserCollectionWithCourtsDTO(row);
  }

  /**
   * GET /v1/me/courts/:courtId/collection-ids — the ids of the authed user's folders
   * that currently contain `courtId` (the narrow membership read backing
   * `getCollectionIdsForCourt`). Returns `[]` when the court is in none of the user's
   * folders. We do NOT 404 on an unknown court id: the question is "which of MY folders
   * contain this court", whose answer is simply `[]` for a court the user has filed
   * nowhere — matching the mock (`folders.filter(...).map(id)`, no court existence
   * check). No lat/lng involved (only folder ids are returned).
   */
  async getCollectionIdsForCourt(
    userId: string,
    courtId: string,
  ): Promise<string[]> {
    const rows = await this.prisma.userCollection.findMany({
      where: { userId, courts: { some: { courtId } } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  /**
   * POST /v1/me/collections — create an empty folder from a display name (already
   * trimmed + length-checked by the DTO). Derives a unique-per-user slug (same algorithm
   * as the mock), falling back to a slug-from-id-shaped base when the name has no
   * slug-able chars. Returns the created `UserCollectionDTO` (count 0, no covers).
   * Controller sends 201.
   */
  async createCollection(
    userId: string,
    name: string,
  ): Promise<UserCollectionDTO> {
    const slug = await this.deriveUniqueSlug(userId, name);
    try {
      const row = await this.prisma.userCollection.create({
        data: { userId, name, slug },
        ...collectionWithCourtsArgs,
      });
      return toUserCollectionDTO(row);
    } catch (err) {
      // P2003 = FK violation: the authed user row was deleted since the token was
      // minted → stale auth context (same staleness rule MeService/SavedCourtsService
      // use), surfaced as 401 rather than a 500.
      throw this.mapStaleUser(err);
    }
  }

  /**
   * PATCH /v1/me/collections/:id — rename one of the authed user's folders (by id, the
   * stable mutation key). 404 when the id isn't one of THIS user's folders (incl.
   * another user's id — never a 403). Re-derives the slug from the new name, kept unique
   * against the user's OTHER folders (the folder's own current slug is excluded, so a
   * same-name rename keeps its slug rather than gaining a `-2` suffix). Member courts are
   * untouched. Returns the updated `UserCollectionDTO`.
   *
   * No-name-change behavior (prompt task 9, documented): we ALWAYS re-derive the slug
   * deterministically (excluding self) — a rename to the same name yields the same slug
   * (no accidental `-2`), and a rename to a different name whose slug collides with
   * another of the user's folders gets the next suffix. We don't short-circuit on
   * "name unchanged"; the update is harmless and keeps slug derivation in one path.
   */
  async renameCollection(
    userId: string,
    id: string,
    name: string,
  ): Promise<UserCollectionDTO> {
    // Ownership check + current slug, in one read scoped to the user.
    const existing = await this.prisma.userCollection.findFirst({
      where: { id, userId },
      select: { slug: true },
    });
    if (!existing) {
      throw new NotFoundException(`Collection "${id}" not found.`);
    }

    const slug = await this.deriveUniqueSlug(userId, name, existing.slug);
    const row = await this.prisma.userCollection.update({
      where: { id },
      data: { name, slug },
      ...collectionWithCourtsArgs,
    });
    return toUserCollectionDTO(row);
  }

  /**
   * POST /v1/me/collections/:id/courts — add a court to one of the authed user's
   * folders. 404 when the folder isn't this user's, or when the court doesn't exist /
   * isn't published (you can't file a draft/unknown court). Idempotent: re-adding an
   * already-present court is a no-op upsert (no duplicate, no error). New members are
   * appended (sortOrder = current max + 1) so insertion order is preserved (mirrors the
   * mock's `courtIds.push`). Returns the updated `UserCollectionWithCourtsDTO` (prompt
   * task 10 — preferred: the caller can refresh local state from the fresh detail).
   */
  async addCourt(
    userId: string,
    collectionId: string,
    courtId: string,
  ): Promise<UserCollectionWithCourtsDTO> {
    await this.assertOwnedCollection(userId, collectionId);

    // The court must exist AND be published (a public-product invariant). The FK would
    // reject an unknown id with a 500-shaped error; we want a clean 404, and we must
    // forbid filing an unpublished court.
    const court = await this.prisma.court.findFirst({
      where: { id: courtId, status: PUBLISHED },
      select: { id: true },
    });
    if (!court) {
      throw new NotFoundException(`Court "${courtId}" not found.`);
    }

    // Append at the end: next sortOrder = current max + 1 (0 for the first member).
    const max = await this.prisma.userCollectionCourt.aggregate({
      where: { userCollectionId: collectionId },
      _max: { sortOrder: true },
    });
    const nextSortOrder = (max._max.sortOrder ?? -1) + 1;

    // Idempotent add: composite PK means a second add is a no-op. `upsert` with an empty
    // `update` keeps the existing row (and its original sortOrder) on re-add — no dup.
    await this.prisma.userCollectionCourt.upsert({
      where: {
        userCollectionId_courtId: { userCollectionId: collectionId, courtId },
      },
      create: { userCollectionId: collectionId, courtId, sortOrder: nextSortOrder },
      update: {},
    });

    return this.requireCollectionWithCourts(collectionId);
  }

  /**
   * DELETE /v1/me/collections/:id/courts/:courtId — remove a court from one of the
   * authed user's folders. 404 when the folder isn't this user's. Idempotent: removing
   * a court that isn't a member (or a never-added/unknown court id) affects 0 rows and
   * still succeeds — the operation is "ensure this court is not in this folder", already
   * satisfied (prompt task 11 — documented choice: no 404 on a non-member/unknown court,
   * symmetric with the saved-courts unsave). The Court itself is never deleted. Returns
   * the updated `UserCollectionWithCourtsDTO` (symmetry with add — prompt task 11).
   */
  async removeCourt(
    userId: string,
    collectionId: string,
    courtId: string,
  ): Promise<UserCollectionWithCourtsDTO> {
    await this.assertOwnedCollection(userId, collectionId);
    await this.prisma.userCollectionCourt.deleteMany({
      where: { userCollectionId: collectionId, courtId },
    });
    return this.requireCollectionWithCourts(collectionId);
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /**
   * Derive a unique-per-user slug from a display name. Base = the kebab slug, or — when
   * the name has no slug-able chars (all punctuation) — a stable `collection` fallback
   * (the mock falls back to its generated `user-col-N` id, but the server's id is a cuid
   * minted by Postgres on insert, not available pre-create; `collection` keeps a
   * readable, dedupable base, and the `-2`/`-3` suffixing still guarantees uniqueness).
   * `currentSlug` (rename) is excluded from the collision set so a no-op rename is stable.
   */
  private async deriveUniqueSlug(
    userId: string,
    name: string,
    currentSlug?: string,
  ): Promise<string> {
    const base = slugifyCollectionName(name) || 'collection';
    const existing = await this.prisma.userCollection.findMany({
      where: { userId },
      select: { slug: true },
    });
    return ensureUniqueSlug(
      base,
      existing.map((c) => c.slug),
      currentSlug,
    );
  }

  /** Throw 404 unless `collectionId` is one of `userId`'s folders. */
  private async assertOwnedCollection(
    userId: string,
    collectionId: string,
  ): Promise<void> {
    const owned = await this.prisma.userCollection.findFirst({
      where: { id: collectionId, userId },
      select: { id: true },
    });
    if (!owned) {
      throw new NotFoundException(`Collection "${collectionId}" not found.`);
    }
  }

  /** Re-read a folder (by id) as the with-courts DTO after a membership mutation. */
  private async requireCollectionWithCourts(
    collectionId: string,
  ): Promise<UserCollectionWithCourtsDTO> {
    const row = await this.prisma.userCollection.findUnique({
      where: { id: collectionId },
      ...collectionWithCourtsArgs,
    });
    if (!row) {
      // Practically unreachable — we just verified ownership — but keeps the return
      // type honest if the row vanished between calls.
      throw new NotFoundException(`Collection "${collectionId}" not found.`);
    }
    return toUserCollectionWithCourtsDTO(row);
  }

  /** Map a create-time FK violation (deleted user) to 401; rethrow anything else. */
  private mapStaleUser(err: unknown): never {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2003'
    ) {
      throw new UnauthorizedException('Session is no longer valid.');
    }
    throw err;
  }
}
