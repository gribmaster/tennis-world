import { Module } from '@nestjs/common';
import { EntitlementsService } from './entitlements.service';

// ─────────────────────────────────────────────────────────────────────────────
// EntitlementsModule — Feature 62 (Phase 5, intake §3).
//
// Provides + EXPORTS the EntitlementsService so any feature module that must derive
// "is this user premium?" imports THIS module rather than re-implementing the rule:
//   - AuthModule    — /v1/auth/verify embeds the user's membership in AuthSessionDTO.
//   - MeModule      — GET/PATCH /v1/me return the user's real membership.
//   - (later) Courts/Me exact-location — calls `isEntitled` to gate exact coords (F63).
//
// No controller: the service is internal-only (no /v1/entitlements/* endpoint — out of
// scope). PrismaService is global (PrismaModule), so it needs no import here — same
// pattern as the other feature modules. No circular dependency: Entitlements depends
// only on Prisma; Auth/Me depend on Entitlements (one direction).
// ─────────────────────────────────────────────────────────────────────────────

@Module({
  providers: [EntitlementsService],
  exports: [EntitlementsService],
})
export class EntitlementsModule {}
