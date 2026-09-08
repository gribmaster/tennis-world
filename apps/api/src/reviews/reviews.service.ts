import { Injectable, NotFoundException } from '@nestjs/common';
import type { ReviewDTO } from '@tennis/contracts';
import { PrismaService } from '../prisma/prisma.service';
import type { ReviewSubmitRequestDTO } from './reviews.dto';
import { reviewSelect, toReviewDTO } from './reviews.mapper';

// ─────────────────────────────────────────────────────────────────────────────
// ReviewsService — persists a court review from a SIGNED-IN visitor (Feature 80).
//
// THE ONLY WRITER of the Review table, and the only code anywhere that touches it.
// Nothing reads it: there is no GET, no list, no aggregate, no average and no count,
// here or in any other module.
//
// Mirrors ConsultationsService's shape (validated body in, created DTO out, Prisma
// column defaults for `status`/`createdAt`) with two deliberate differences, both
// forced by the feature:
//
//   1. IT VALIDATES THE TARGET. A consultation names a free-text destination; a review
//      names a real court, so the court must exist AND be published before a row is
//      written. Unpublished courts are not part of the public product — a draft court
//      is not visible on any surface, so a review of one could only come from a
//      guessed slug. Both cases are ONE 404 (`Court "<slug>" not found.`), which is
//      also what the public `GET /v1/courts/:slug` returns for a draft: a review
//      endpoint must not become an oracle that distinguishes "no such court" from
//      "unpublished court" when the read endpoint refuses to.
//
//   2. IT UPSERTS. `userId` is never null here — the controller's AuthGuard has already
//      resolved a real user — and the schema carries `@@unique([userId, courtId])`, so
//      a second submission for the same court by the same person UPDATES their existing
//      review instead of erroring or stacking a duplicate. That is the product reading
//      of "one opinion per person per place": re-reviewing is editing. The upsert also
//      makes the endpoint naturally idempotent under a double-tapped submit button.
//
// The unauthenticated case never reaches this service: AuthGuard rejects it in the
// controller. Nothing here ever writes `userId: null` — the nullable column is future
// headroom for an anonymous path that does not exist yet (see schema.prisma).
//
// OUT OF SCOPE, as with consultations: no email, no CRM webhook, no notification, no
// moderation side effect. The row is persisted and that is all.
// ─────────────────────────────────────────────────────────────────────────────

/** Only published courts are part of the public product — see the note above. */
const PUBLISHED = 'published' as const;

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * POST /v1/reviews — store `userId`'s review of the court named by `dto.courtSlug`,
   * returning the created (or updated) row as a `ReviewDTO`.
   *
   * @param userId The AUTHENTICATED author, from `@CurrentUser()`. Never client-supplied.
   * @throws NotFoundException when no published court matches the slug.
   */
  async create(userId: string, dto: ReviewSubmitRequestDTO): Promise<ReviewDTO> {
    // 1. Resolve the target court. Existence + published in one indexed read on the
    //    unique slug; a draft or missing court is the same 404 the public read gives.
    const court = await this.prisma.court.findFirst({
      where: { slug: dto.courtSlug, status: PUBLISHED },
      select: { id: true },
    });
    if (!court) {
      throw new NotFoundException(`Court "${dto.courtSlug}" not found.`);
    }

    // 2. Write. Keyed on the @@unique([userId, courtId]) constraint, so this creates
    //    the author's first review of the court and edits it on every submission after.
    //    `status`/`createdAt` are left to the Prisma column defaults ("new" / now()) on
    //    create; the update deliberately touches only the two authored fields, so an
    //    edit never resets a moderation status a future admin surface has moved, and
    //    never rewrites `createdAt` (which records when the author first spoke).
    //
    //    `body` is written as an explicit `null` when the client omits it, so clearing
    //    a previously-written body on an edit actually clears it — `undefined` would
    //    mean "leave the column alone" to Prisma and silently keep the old text.
    const body = dto.body ?? null;
    const row = await this.prisma.review.upsert({
      where: { userId_courtId: { userId, courtId: court.id } },
      create: { userId, courtId: court.id, rating: dto.rating, body },
      update: { rating: dto.rating, body },
      select: reviewSelect,
    });

    return toReviewDTO(row);
  }
}
