import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';
import { ExactLocationController } from './exact-location.controller';
import { ExactLocationService } from './exact-location.service';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { SavedCourtsController } from './saved-courts.controller';
import { SavedCourtsService } from './saved-courts.service';

// ─────────────────────────────────────────────────────────────────────────────
// MeModule — the authenticated user's own resources (Features 53/54).
//
// Imports AuthModule because the controllers' `@UseGuards(AuthGuard)` need the
// AuthGuard (and, transitively, AuthService + AUTH_CONFIG) which AuthModule provides
// and EXPORTS. PrismaService is global (PrismaModule), so the services get it without
// an explicit import — same pattern as the other feature modules.
//
// Feature 54 adds the saved-courts surface (GET/POST/DELETE /v1/me/saved-courts). Its
// service REUSES the Courts module's public summary select/mapper (a pure function
// import from courts.mapper.ts — no Nest provider dependency, so no CourtsModule
// import is needed), preserving coordinate masking on the saved list.
//
// Feature 55 adds the user-collections surface (GET/POST /v1/me/collections, GET
// /:slug, PATCH /:id, POST/DELETE /:id/courts, GET /v1/me/courts/:courtId/
// collection-ids). Same pattern — the CollectionsService reuses the public court
// summary select/mapper for masked member courts, and is auth-scoped per user.
//
// Feature 62 imports EntitlementsModule so MeService can derive the authed user's REAL
// membership (GET/PATCH /v1/me) via the EntitlementsService — the same service the auth
// verify path uses, so /v1/me and the verify response always agree.
//
// Feature 63 adds the protected exact-coordinate unlock (GET /v1/me/courts/:slug/
// exact-location). Its ExactLocationService reuses EntitlementsService.isEntitled (the
// same gate Feature 62 wired) and a PRIVATE exact select from courts.mapper.ts (a pure
// function import — no CourtsModule provider dependency), so the public court selects
// stay untouched and coords leave the DB only on this guarded, entitled path.
// ─────────────────────────────────────────────────────────────────────────────

@Module({
  imports: [AuthModule, EntitlementsModule],
  controllers: [
    MeController,
    SavedCourtsController,
    CollectionsController,
    ExactLocationController,
  ],
  providers: [
    MeService,
    SavedCourtsService,
    CollectionsService,
    ExactLocationService,
  ],
})
export class MeModule {}
