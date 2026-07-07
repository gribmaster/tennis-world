import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ExactLocationDTO } from '@tennis/contracts';
import { PrismaService } from '../prisma/prisma.service';
import {
  courtExactLocationSelect,
  toExactLocationDTO,
} from '../courts/courts.mapper';
import { EntitlementsService } from '../entitlements/entitlements.service';

// ─────────────────────────────────────────────────────────────────────────────
// ExactLocationService — the FIRST exact-coordinate unlock surface (Feature 63,
// intake §4). Backs the protected `GET /v1/me/courts/:slug/exact-location`. It is
// the ONE place exact `Court.lat`/`lng` ever leave the database, and only for an
// authenticated, currently-entitled viewer.
//
// ORDER (intake §4.5): resolve the PUBLISHED court FIRST (404 if missing/unpublished),
// THEN gate on entitlement (403). Court existence is ALREADY fully public via
// `/v1/courts/:slug`, so a 404-vs-403 distinction here leaks nothing new — and a clean
// 404 for an unknown slug (even for an entitled user) is friendlier than a misleading
// 403. The 401 case never reaches this service: the controller's `AuthGuard` rejects
// missing/invalid/expired credentials before the handler runs.
//
// ENTITLEMENT is read through the single `EntitlementsService.isEntitled(userId)` gate
// (Feature 62) — never a re-implemented `status === 'active'` check (intake §3, §3.4).
//
// MASKING: the exact read uses the PRIVATE `courtExactLocationSelect` (courts.mapper.ts),
// which is wholly separate from the public summary/detail/map selects — those stay
// structurally incapable of carrying coords. No public select or mapper is widened.
// ─────────────────────────────────────────────────────────────────────────────

const PUBLISHED = 'published' as const;

@Injectable()
export class ExactLocationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /**
   * GET /v1/me/courts/:slug/exact-location — exact coords + directions deep link.
   *
   *   - court missing/unpublished → 404 (existence checked FIRST, intake §4.5)
   *   - authed but not entitled    → 403
   *   - entitled + published court → 200 ExactLocationDTO (the only coord-bearing DTO)
   *
   * `directionsUrl` is built server-side in `toExactLocationDTO` (no external call).
   */
  async getExactLocation(
    userId: string,
    slug: string,
  ): Promise<ExactLocationDTO> {
    // 1. Court existence (public knowledge) — private exact select, published only.
    const court = await this.prisma.court.findFirst({
      where: { slug, status: PUBLISHED },
      select: courtExactLocationSelect,
    });
    if (!court) {
      throw new NotFoundException(`Court "${slug}" not found.`);
    }

    // 2. Entitlement gate — the single source of truth (Feature 62). A real court
    //    for a non-entitled user is a 403 (NOT 404 — existence is already public).
    if (!(await this.entitlements.isEntitled(userId))) {
      throw new ForbiddenException(
        'An active membership is required to view exact court coordinates.',
      );
    }

    // 3. Entitled + real court → the only payload that carries exact lat/lng.
    return toExactLocationDTO(court);
  }
}
