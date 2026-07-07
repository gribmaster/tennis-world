import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { MailerService } from './mailer.service';
import { AUTH_CONFIG, loadAuthConfig } from './auth.config';
import { EntitlementsModule } from '../entitlements/entitlements.module';

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
// ─────────────────────────────────────────────────────────────────────────────

@Module({
  imports: [JwtModule.register({}), EntitlementsModule],
  controllers: [AuthController],
  providers: [
    { provide: AUTH_CONFIG, useFactory: () => loadAuthConfig() },
    AuthService,
    MailerService,
    AuthGuard,
  ],
  exports: [AuthService, AuthGuard, AUTH_CONFIG],
})
export class AuthModule {}
