import { DynamicModule, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ADMIN_AUTH_CONFIG, loadAdminAuthConfig } from './auth/admin-auth.config';
import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminAuthService } from './auth/admin-auth.service';
import { AdminAuthGuard } from './auth/admin-auth.guard';
import { AdminRolesGuard } from './auth/admin-roles.guard';
import { AdminCsrfGuard } from './auth/admin-csrf.guard';
import { AdminLoginRateLimitService } from './auth/admin-login-rate-limit.service';
import { AdminCourtsController } from './courts/admin-courts.controller';
import { AdminCourtsService } from './courts/admin-courts.service';
import { AdminGeoController } from './geo/admin-geo.controller';
import { AdminGeoService } from './geo/admin-geo.service';
import { AdminImagesController } from './images/admin-images.controller';
import { AdminImagesService } from './images/admin-images.service';
import { AdminImageUploadRateLimitService } from './images/admin-image-upload-rate-limit.service';
import { ADMIN_IMAGE_STORAGE_CONFIG, loadAdminImageStorageConfig } from './images/admin-image-storage.config';

// ─────────────────────────────────────────────────────────────────────────────
// AdminModule (TASK_73) — the minimal admin surface: auth, courts CRUD,
// countries/regions, images. Registered in `app.module.ts` as
// `AdminModule.register()`, NOT the bare class — see the dynamic-module
// rationale below.
//
// WHY A DYNAMIC MODULE: decision 1 requires that in production with no
// `ADMIN_JWT_SECRET` set, `/v1/admin/*` must not exist AT ALL (not merely
// 404-via-guard) while the rest of the API still boots. `register()` computes
// `AdminAuthConfig` synchronously (at `app.module.ts` import time, i.e. before
// `main.ts`'s `bootstrap()` ever runs) and returns a module with literally NO
// controllers/providers when `routesEnabled` is false — so nothing in this
// module (no guard, no service, no Prisma call) is ever constructed, and
// `/v1/admin/*` is a plain unmatched-route 404 from Express, not a thrown one.
//
// A misconfigured-sentinel-in-production throw (see `admin-auth.config.ts`)
// happens inside this same synchronous call, so it crashes the process before
// any route is reachable — the established "refuses to boot" idiom in this API
// (`loadStagingDemoAuthConfig`, `loadDevMembershipOverride`).
//
// INDEPENDENT JwtModule: a second, separate `JwtModule.register({})` — NOT the
// one `AuthModule` registers for the user session — so the admin JwtService
// never shares state with the user one (decision 1: never reuse AuthService).
// ─────────────────────────────────────────────────────────────────────────────

@Module({})
export class AdminModule {
  static register(): DynamicModule {
    const adminAuthConfig = loadAdminAuthConfig();
    if (!adminAuthConfig.routesEnabled) {
      return { module: AdminModule };
    }

    return {
      module: AdminModule,
      imports: [JwtModule.register({})],
      controllers: [
        AdminAuthController,
        AdminCourtsController,
        AdminGeoController,
        AdminImagesController,
      ],
      providers: [
        { provide: ADMIN_AUTH_CONFIG, useValue: adminAuthConfig },
        { provide: ADMIN_IMAGE_STORAGE_CONFIG, useFactory: () => loadAdminImageStorageConfig() },
        AdminAuthService,
        AdminAuthGuard,
        AdminRolesGuard,
        AdminCsrfGuard,
        AdminLoginRateLimitService,
        AdminCourtsService,
        AdminGeoService,
        AdminImagesService,
        AdminImageUploadRateLimitService,
      ],
    };
  }
}
