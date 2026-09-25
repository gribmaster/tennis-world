import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CollectionDTO } from '@tennis/contracts';
import { PrismaService } from '../prisma/prisma.service';
import {
  collectionSelect,
  toCollectionDTO,
} from '../collections/collections.mapper';

// ─────────────────────────────────────────────────────────────────────────────
// SavedCollectionsService — the authenticated user's individual saved editorial
// collections (Task 42). Mirrors `SavedCourtsService` exactly, `Court` →
// `Collection`. Backs the web `SavedRepository.getSavedEditorialCollections()` /
// `isCollectionSaved()` / `saveCollection()` / `unsaveCollection()`.
//
// PUBLISHED-ONLY REUSE: every collection-returning read REUSES the Collections
// module's PUBLIC `collectionSelect` + `toCollectionDTO` (collections.mapper.ts) —
// a pure function import, no CollectionsModule provider dependency needed.
//
// AUTH SCOPING (Feature 50 §9): every query is scoped to the `userId` the
// AuthGuard attached (`@CurrentUser()`), so a user only ever reads/mutates their
// OWN saved collections.
//
// IDEMPOTENCY rides on `SavedCollection`'s composite PK
// `@@id([userId, collectionId])`:
//   - save   = upsert → re-saving is a no-op (no duplicate row, no error).
//   - unsave = deleteMany on the PK → deleting a non-saved collection affects 0
//     rows and still succeeds (safe/idempotent).
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class SavedCollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /v1/me/saved-collections — the authed user's saved editorial collections
   * as public DTOs.
   *
   * Ordered `savedAt desc` (most-recently-saved first), matching
   * `SavedCourtsService.listSavedCourts`. Returns `[]` when nothing is saved.
   * Only PUBLISHED collections are returned: a collection that was saved then
   * unpublished drops out of the list (Collection's equivalent of Court's
   * `status: published` is the boolean `isPublished`).
   */
  async listSavedCollections(userId: string): Promise<CollectionDTO[]> {
    const rows = await this.prisma.savedCollection.findMany({
      where: { userId, collection: { isPublished: true } },
      orderBy: { savedAt: 'desc' },
      select: { collection: { select: collectionSelect } },
    });
    return rows.map((row) => toCollectionDTO(row.collection));
  }

  /**
   * POST /v1/me/saved-collections — save an editorial collection for the authed
   * user.
   *
   * Verifies the collection exists AND is published (404 otherwise). Idempotent
   * on the composite PK: re-saving an already-saved collection is a no-op upsert
   * (no duplicate, no error) and returns the same DTO. Returns the saved
   * collection's PUBLIC `CollectionDTO` (controller sends 201).
   */
  async saveCollection(userId: string, collectionId: string): Promise<CollectionDTO> {
    // Verify the collection is real + published before creating a dangling save
    // (mirrors SavedCourtsService.saveCourt).
    const collection = await this.prisma.collection.findFirst({
      where: { id: collectionId, isPublished: true },
      select: collectionSelect,
    });
    if (!collection) {
      throw new NotFoundException(`Collection "${collectionId}" not found.`);
    }

    // Idempotent create: the composite PK means a second save is a no-op.
    try {
      await this.prisma.savedCollection.upsert({
        where: { userId_collectionId: { userId, collectionId } },
        create: { userId, collectionId },
        update: {},
      });
    } catch (err) {
      // P2003 = FK violation: the authed user row was deleted since the token was
      // minted → stale auth context, surfaced as 401 rather than a 500 (the
      // collection FK can't fire — we just verified it).
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2003'
      ) {
        throw new UnauthorizedException('Session is no longer valid.');
      }
      throw err;
    }

    return toCollectionDTO(collection);
  }

  /**
   * DELETE /v1/me/saved-collections/:collectionId — unsave a collection for the
   * authed user.
   *
   * Idempotent: `deleteMany` on the composite PK removes the row if present and
   * affects 0 rows (still succeeds) if the collection was never saved — no 404 on
   * a non-saved collection id (mirrors `SavedCourtsService.unsaveCourt`).
   */
  async unsaveCollection(userId: string, collectionId: string): Promise<{ ok: true }> {
    await this.prisma.savedCollection.deleteMany({ where: { userId, collectionId } });
    return { ok: true };
  }
}
