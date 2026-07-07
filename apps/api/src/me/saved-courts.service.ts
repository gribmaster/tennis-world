import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CourtSummaryDTO } from '@tennis/contracts';
import { PrismaService } from '../prisma/prisma.service';
import {
  courtSummarySelect,
  toCourtSummaryDTO,
} from '../courts/courts.mapper';

// ─────────────────────────────────────────────────────────────────────────────
// SavedCourtsService — the authenticated user's individual saved courts (Feature
// 54). Backs the future web `SavedRepository.getSavedCourts()` (the heart UI is a
// later feature; no web wiring here).
//
// COORDINATE MASKING (prompt tasks 4/8 — hard requirement): every court-returning
// read REUSES the Courts module's PUBLIC `courtSummarySelect` + `toCourtSummaryDTO`
// (courts.mapper.ts). That select DELIBERATELY OMITS `Court.lat`/`lng`, and Prisma
// types the row to exactly the selected fields, so the saved-courts payload is
// STRUCTURALLY INCAPABLE of carrying exact geo — the same guarantee the public
// /v1/courts reads have. We never define a local select that includes lat/lng.
//
// AUTH SCOPING (Feature 50 §9): every query is scoped to the `userId` the AuthGuard
// attached (`@CurrentUser()`), so a user only ever reads/mutates their OWN saved
// courts — user A's saves never appear for user B.
//
// IDEMPOTENCY rides on `SavedCourt`'s composite PK `@@id([userId, courtId])`:
//   - save  = upsert → re-saving is a no-op (no duplicate row, no error).
//   - unsave = deleteMany on the PK → deleting a non-saved court affects 0 rows
//     and still succeeds (safe/idempotent).
// ─────────────────────────────────────────────────────────────────────────────

const PUBLISHED = 'published' as const;

@Injectable()
export class SavedCourtsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /v1/me/saved-courts — the authed user's saved courts as public summaries.
   *
   * Ordered `savedAt desc` (most-recently-saved first) — a deterministic order the
   * mock doesn't define (the mock preserves a static seed list; once saves are real
   * and timestamped, recency is the natural order). Returns `[]` when nothing is
   * saved. Only PUBLISHED member courts are returned: a court that was saved then
   * unpublished drops out of the list, matching the public-read invariant (the mock
   * `getSavedCourts` likewise filters to `status === 'published'`).
   *
   * The `court` join uses the PUBLIC summary select — no lat/lng can leak.
   */
  async listSavedCourts(userId: string): Promise<CourtSummaryDTO[]> {
    const rows = await this.prisma.savedCourt.findMany({
      where: { userId, court: { status: PUBLISHED } },
      orderBy: { savedAt: 'desc' },
      select: { court: { select: courtSummarySelect } },
    });
    return rows.map((row) => toCourtSummaryDTO(row.court));
  }

  /**
   * POST /v1/me/saved-courts — save a court for the authed user.
   *
   * Verifies the court exists AND is published (404 otherwise — you can't save a
   * draft/unknown court). Idempotent on the composite PK: re-saving an already-saved
   * court is a no-op upsert (no duplicate, no error) and returns the same summary.
   * Returns the saved court's PUBLIC `CourtSummaryDTO` (controller sends 201). No
   * lat/lng — the verify read selects only `id`/`status`, the response uses the
   * public summary select.
   */
  async saveCourt(userId: string, courtId: string): Promise<CourtSummaryDTO> {
    // Verify the court is real + published before creating a dangling save. (The FK
    // would also reject an unknown id, but we want a clean 404, not a 500, and we
    // must forbid saving an unpublished court — the public product never surfaces
    // one.) Fetch the public summary in the same read so we can return it.
    const court = await this.prisma.court.findFirst({
      where: { id: courtId, status: PUBLISHED },
      select: courtSummarySelect,
    });
    if (!court) {
      throw new NotFoundException(`Court "${courtId}" not found.`);
    }

    // Idempotent create: the composite PK means a second save is a no-op. `upsert`
    // with an empty `update` is the cleanest "insert if absent" — no read-modify-write
    // race, no duplicate, no error on re-save.
    try {
      await this.prisma.savedCourt.upsert({
        where: { userId_courtId: { userId, courtId } },
        create: { userId, courtId },
        update: {},
      });
    } catch (err) {
      // P2003 = FK violation: the authed user row was deleted since the token was
      // minted → stale auth context (same staleness rule MeService uses), surfaced
      // as 401 rather than a 500. (The court FK can't fire — we just verified it.)
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2003'
      ) {
        throw new UnauthorizedException('Session is no longer valid.');
      }
      throw err;
    }

    return toCourtSummaryDTO(court);
  }

  /**
   * DELETE /v1/me/saved-courts/:courtId — unsave a court for the authed user.
   *
   * Idempotent: `deleteMany` on the composite PK removes the row if present and
   * affects 0 rows (still succeeds) if the court was never saved — so a repeated
   * DELETE, or a DELETE of a never-saved court, returns `{ ok: true }` without error.
   * We intentionally DO NOT 404 on a non-saved court id: the operation is "ensure
   * this court is not in my saved list", which is already satisfied (prompt task 6 —
   * documented choice: unsave is purely idempotent, the court itself is not checked).
   * Never deletes the Court, never touches collections.
   */
  async unsaveCourt(userId: string, courtId: string): Promise<{ ok: true }> {
    await this.prisma.savedCourt.deleteMany({ where: { userId, courtId } });
    return { ok: true };
  }
}
