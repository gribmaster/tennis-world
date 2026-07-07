import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  type EffectiveEntitlement,
  NOT_ENTITLED,
} from './entitlements.types';

// ─────────────────────────────────────────────────────────────────────────────
// EntitlementsService — the ONE place "is this user currently premium?" is decided
// (Feature 62, intake §3). Every consumer (the user-profile mapper today; the future
// exact-location gate) calls this — the backlog's explicit instruction NOT to spread
// `status === 'active' && …` checks across controllers (intake §3, §3.4).
//
// Effective access is TIME-DEPENDENT (`expiresAt > now`, `startsAt <= now`) and
// MULTI-ROW (a user may hold a lapsed subscription row AND a later lifetime row), so
// it is computed on read — never a denormalized `User.isPremium` boolean that would
// drift the moment a subscription lapsed without a write (intake §3.4). One indexed
// query (`@@index([userId, status])`), then a cheap in-code time-window filter.
//
// PRIVACY: the returned `EffectiveEntitlement` carries NO row id and NO provider id —
// only the derived membership/boolean + coarse enum labels (intake §6). Provider
// columns (`providerCustomerId`/…) are never selected here.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Collapse the user's `Entitlement` rows into the single effective answer.
   *
   * Effective rule (intake §3.2 — exactly one definition):
   *   status === 'active'  AND  startsAt <= now  AND  (expiresAt === null OR expiresAt > now)
   *
   * The user is entitled iff ANY row is effective. When several are effective, pick the
   * "strongest" deterministically for `reason`/`source`/`activeUntil`:
   *   1. prefer a NON-expiring row (`expiresAt === null` — lifetime/promo-forever),
   *   2. otherwise the one with the LATEST `expiresAt`,
   *   3. final tie-break on `id` so the result is fully deterministic.
   *
   * `membership` is 'lifetime' when entitled, else 'free' (the contract enum has only
   * those two — a `kind=subscription` still surfaces as 'lifetime' for the badge).
   */
  async getEffectiveEntitlement(userId: string): Promise<EffectiveEntitlement> {
    const now = new Date();

    // One indexed read (covered by @@index([userId, status])). We deliberately filter
    // the time window in code (not SQL) so the rule lives in ONE readable place and so
    // `now` is a single consistent instant across all rows. Provider/audit columns are
    // NOT selected — this result never carries them (privacy, intake §6).
    const rows = await this.prisma.entitlement.findMany({
      where: { userId, status: 'active' },
      select: { id: true, kind: true, source: true, startsAt: true, expiresAt: true },
    });

    // Apply the effective-window filter (startsAt has reached `now`; not yet expired).
    const effective = rows.filter(
      (r) => r.startsAt <= now && (r.expiresAt === null || r.expiresAt > now),
    );
    if (effective.length === 0) {
      return NOT_ENTITLED;
    }

    // Deterministic "strongest" pick: non-expiring beats expiring; among expiring the
    // latest expiry wins; ties broken on id. `reduce` keeps the single winner without
    // mutating/sorting the array.
    const winner = effective.reduce((best, row) =>
      this.isStronger(row, best) ? row : best,
    );

    return {
      isEntitled: true,
      membership: 'lifetime',
      reason: winner.kind,
      source: winner.source,
      activeUntil: winner.expiresAt === null ? null : winner.expiresAt.toISOString(),
    };
  }

  /**
   * Convenience boolean — the one gate the future exact-location endpoint reads. Thin
   * wrapper over `getEffectiveEntitlement` so callers that only need yes/no don't
   * re-derive the rule (intake §3.1).
   */
  async isEntitled(userId: string): Promise<boolean> {
    return (await this.getEffectiveEntitlement(userId)).isEntitled;
  }

  /**
   * Is `candidate` a strictly "stronger" effective row than `incumbent`? Encodes the
   * deterministic tie-break (intake §3.2):
   *   - a non-expiring row outranks any expiring row;
   *   - between two expiring rows, the LATER `expiresAt` wins;
   *   - exact ties (both non-expiring, or equal `expiresAt`) fall back to a stable id
   *     compare so the chosen row never depends on DB row order.
   */
  private isStronger(
    candidate: { id: string; expiresAt: Date | null },
    incumbent: { id: string; expiresAt: Date | null },
  ): boolean {
    const candForever = candidate.expiresAt === null;
    const incForever = incumbent.expiresAt === null;
    if (candForever !== incForever) {
      // Exactly one is non-expiring → that one is stronger.
      return candForever;
    }
    if (candForever && incForever) {
      // Both non-expiring → deterministic id tie-break (smaller id wins).
      return candidate.id < incumbent.id;
    }
    // Both expiring → later expiry wins; equal expiry → id tie-break.
    const candMs = candidate.expiresAt!.getTime();
    const incMs = incumbent.expiresAt!.getTime();
    if (candMs !== incMs) return candMs > incMs;
    return candidate.id < incumbent.id;
  }
}
