import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { MailerService } from './mailer.service';
import { AUTH_CONFIG, loadAuthConfig } from './auth.config';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { GoogleAuthController } from './google-auth.controller';
import { GoogleAuthService } from './google-auth.service';
import { GOOGLE_AUTH_CONFIG, loadGoogleAuthConfig } from './google-auth.config';

// ─────────────────────────────────────────────────────────────────────────────
// AuthModule (prompt task 5) — the magic-link auth foundation.
//
// PROVIDERS:
//   - AUTH_CONFIG : a single, env-derived AuthConfig value (factory reads
//                   process.env once at wiring; dotenv has already populated it in
//                   main.ts). Injected by service/guard/controller/mailer so none of
//                   them re-parse env.
//   - AuthService : magic-link mint/verify + JWT issuance.
//   - MailerService : the dev/no-op mailer abstraction (sendMagicLink).
//   - AuthGuard   : the reusable cookie-OR-bearer guard. EXPORTED (with AuthService)
//                   so Features 53/54/55 can guard /v1/me/* — not attached to any
//                   route here.
//
// JwtModule.register({}) registers a bare JwtService; the secret + expiry are passed
// PER-CALL from AuthConfig (so a future key rotation/algorithm change is one config
// edit, not a module re-registration). PrismaService is global (PrismaModule), so it
// needs no import here — same pattern as the other feature modules.
//
// EntitlementsModule is imported so AuthService.verify can embed the user's REAL
// membership in `AuthSessionDTO.user` (Feature 62) — the EntitlementsService is the one
// place that rule lives. One-directional dependency (Auth → Entitlements → Prisma), no
// cycle.
//
// GOOGLE OAUTH (additive): GoogleAuthController/GoogleAuthService are a separate
// pair layered on top of this SAME module — GoogleAuthService depends on
// AuthService (to mint the identical session shape via `issueSessionForUser`) and
// GOOGLE_AUTH_CONFIG (its own optional-provider config, mirroring
// BILLING_CONFIG's pattern: never blocks boot, gates at request time). Kept
// internal — not exported — since nothing outside this module needs them.
// ─────────────────────────────────────────────────────────────────────────────

@Module({
  imports: [JwtModule.register({}), EntitlementsModule],
  controllers: [AuthController, GoogleAuthController],
  providers: [
    { provide: AUTH_CONFIG, useFactory: () => loadAuthConfig() },
    { provide: GOOGLE_AUTH_CONFIG, useFactory: () => loadGoogleAuthConfig() },
    AuthService,
    MailerService,
    AuthGuard,
    GoogleAuthService,
  ],
  exports: [AuthService, AuthGuard, AUTH_CONFIG],
})
export class AuthModule {}
