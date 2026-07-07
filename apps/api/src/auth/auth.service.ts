import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthSessionDTO } from '@tennis/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import { MailerService } from './mailer.service';
import type { AccessTokenPayload } from './auth.types';
import { toUserProfileDTO } from './user-profile.mapper';
import { EntitlementsService } from '../entitlements/entitlements.service';

// ─────────────────────────────────────────────────────────────────────────────
// AuthService — the magic-link engine (prompt tasks 6/7/9/11).
//
// requestLink:  mint a single-use token, store ONLY its hash + a short expiry, and
//               (dev) log the link. Same generic response regardless of whether the
//               email has a User (no enumeration, Feature 50 §9). No User is created
//               here — the user is upserted on verify.
// verify:       hash the presented token, look it up, reject if missing/expired/used,
//               consume it atomically, upsert the User by the TOKEN ROW's email
//               (not the caller's — the email was bound at request time), and mint a
//               session (signed access JWT + the public profile DTO).
//
// SECURITY (Feature 50 §9):
//   - token = 32 random bytes (256 bits) hex — well past the ≥128-bit bar.
//   - stored as SHA-256(token); the raw token exists only in the link. A DB leak
//     can't be replayed (you'd need a preimage of the hash).
//   - single-use: `consumedAt` is set inside the same `updateMany` that gates on it
//     being still null, so two concurrent verifies can't both win (the second's
//     `count` is 0).
//   - short TTL via `expiresAt`.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mailer: MailerService,
    private readonly entitlements: EntitlementsService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {
    if (this.config.usingDefaultSecret) {
      // Boot-time nudge — never ship the dev sentinel secret.
      this.logger.warn(
        'JWT_SECRET is the default "change-me" sentinel — override it outside local dev.',
      );
    }
  }

  /** Normalize an email for storage/lookup: trim + lower-case (the service's job,
   *  not the schema's — see the MagicLinkToken model comment). */
  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /** SHA-256 hex digest — used for both the token hash (at rest) and the best-effort
   *  IP hash (never store a raw IP). */
  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  /**
   * Validate an optional `redirectTo` (open-redirect guard, Feature 50 §3.1 / §9).
   * ACCEPTED: a relative path beginning with a single '/', OR an absolute URL whose
   * origin exactly equals WEB_APP_URL. Anything else (external host,
   * protocol-relative `//evil`, malformed) is dropped → undefined (we ignore, not
   * 400, so a stray client value can't break sign-in). Returns the SAFE value or
   * undefined.
   */
  private sanitizeRedirect(redirectTo: string | undefined): string | undefined {
    if (!redirectTo) return undefined;
    const value = redirectTo.trim();
    if (value.length === 0) return undefined;

    // Relative path: must start with exactly one '/' (reject '//host' which a browser
    // treats as protocol-relative → external).
    if (value.startsWith('/') && !value.startsWith('//')) {
      return value;
    }

    // Absolute URL: only honor it if its origin matches the trusted web origin.
    try {
      const candidate = new URL(value);
      const allowed = new URL(this.config.webAppUrl);
      if (candidate.origin === allowed.origin) {
        // Return just the path+query+hash (we re-base onto WEB_APP_URL ourselves).
        return `${candidate.pathname}${candidate.search}${candidate.hash}`;
      }
    } catch {
      // not a parseable URL → ignore
    }
    return undefined;
  }

  /** Build the emailed verify URL from a raw token + an already-sanitized redirect. */
  private buildMagicLinkUrl(rawToken: string, safeRedirect?: string): string {
    const url = new URL('/verify', this.config.webAppUrl);
    url.searchParams.set('token', rawToken);
    if (safeRedirect) url.searchParams.set('redirectTo', safeRedirect);
    return url.toString();
  }

  /**
   * POST /v1/auth/request-link — start the magic-link flow. Always resolves to a
   * generic success (the controller returns `{ ok: true }`); never reveals whether
   * the email has an account. Stores only the token hash.
   */
  async requestLink(
    email: string,
    redirectTo: string | undefined,
    context: { userAgent?: string; ip?: string },
  ): Promise<void> {
    const normalizedEmail = this.normalizeEmail(email);
    const safeRedirect = this.sanitizeRedirect(redirectTo);

    // 256-bit random raw token; only its hash is persisted.
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.sha256(rawToken);
    const expiresAt = new Date(
      Date.now() + this.config.magicLinkTtlMinutes * 60_000,
    );

    await this.prisma.magicLinkToken.create({
      data: {
        email: normalizedEmail,
        tokenHash,
        expiresAt,
        // Best-effort abuse-triage context (Feature 50 §9). userAgent is stored raw
        // (low-sensitivity); the IP is hashed, never stored raw.
        ...(context.userAgent ? { userAgent: context.userAgent } : {}),
        ...(context.ip ? { ipHash: this.sha256(context.ip) } : {}),
      },
    });

    // Hand the raw link to the mailer (dev: logs it; no provider yet). The raw token
    // never touches the DB — this is the only place it leaves the process.
    const url = this.buildMagicLinkUrl(rawToken, safeRedirect);
    await this.mailer.sendMagicLink(normalizedEmail, url);
  }

  /**
   * POST /v1/auth/verify — exchange a single-use token for a session. Returns the
   * `AuthSessionDTO` (public profile + bearer token + expiry); the controller also
   * sets the httpOnly cookie. Rejects bad/expired/used tokens with a uniform 400
   * (no detail leak about which condition failed).
   */
  async verify(rawToken: string): Promise<AuthSessionDTO> {
    const tokenHash = this.sha256(rawToken.trim());
    const now = new Date();

    const token = await this.prisma.magicLinkToken.findUnique({
      where: { tokenHash },
    });

    // Uniform rejection for not-found / expired / already-consumed — don't tell the
    // caller which (no oracle).
    if (!token || token.consumedAt !== null || token.expiresAt <= now) {
      throw new BadRequestException('Invalid or expired token.');
    }

    // Consume atomically: gate on still-unconsumed so a concurrent verify can't also
    // succeed. If another request beat us, count is 0 → reject.
    const consumed = await this.prisma.magicLinkToken.updateMany({
      where: { id: token.id, consumedAt: null },
      data: { consumedAt: now },
    });
    if (consumed.count === 0) {
      throw new BadRequestException('Invalid or expired token.');
    }

    // Upsert the User by the TOKEN's email (bound at request time). First sign-in
    // creates the row (authProvider tags how — 'magic'); returning users update
    // nothing meaningful here (updatedAt is bumped by @updatedAt on any write, so we
    // keep the update minimal).
    const user = await this.prisma.user.upsert({
      where: { email: token.email },
      create: { email: token.email, authProvider: 'magic' },
      update: {},
      select: { id: true, name: true, email: true },
    });

    return this.issueSession(user.id, user.email, user.name);
  }

  /**
   * Mint a session for an identified user: derive the user's real membership, sign the
   * access JWT and assemble the `AuthSessionDTO`. Shared by `verify` (and any future
   * session-returning path). The returned `accessToken` serves the mobile/bearer client;
   * the web path also gets the same token in an httpOnly cookie (set by the controller).
   *
   * `membership` is entitlement-derived (Feature 62): the EntitlementsService collapses
   * the user's `Entitlement` rows into one effective answer. A user with no rows (every
   * user today) resolves to 'free' — so verify is unchanged for them; an entitled user
   * (seeded/future-paid) gets 'lifetime' in the same `AuthSessionDTO.user.membership`.
   */
  private async issueSession(
    userId: string,
    email: string,
    name: string | null,
  ): Promise<AuthSessionDTO> {
    const { membership } = await this.entitlements.getEffectiveEntitlement(userId);
    const payload: AccessTokenPayload = { sub: userId, email };
    const accessToken = this.jwt.sign(payload, {
      secret: this.config.jwtSecret,
      expiresIn: this.config.tokenTtlSeconds,
    });
    const expiresAt = new Date(
      Date.now() + this.config.tokenTtlSeconds * 1000,
    ).toISOString();

    return {
      user: toUserProfileDTO({ id: userId, name, email }, membership),
      accessToken,
      expiresAt,
    };
  }

  /** Verify a raw access token (used by the guard). Throws on invalid/expired. */
  verifyAccessToken(token: string): AccessTokenPayload {
    return this.jwt.verify<AccessTokenPayload>(token, {
      secret: this.config.jwtSecret,
    });
  }

  /**
   * STAGING-ONLY (Feature 76): resolve the fixed demo user, creating the row on first
   * use. Returns `{ userId, email }` — the SAME shape the guard's JWT path attaches to
   * `req.auth`, so every downstream handler treats the demo user exactly like a normal
   * authenticated user (no special-casing past this point). The user is a plain, FREE
   * user (`authProvider: 'demo'` tags how it was created; it grants no entitlement — the
   * EntitlementsService still derives 'free' from its zero entitlement rows).
   *
   * ⚠️  Only ever called from the guard's demo branch, which is itself gated on the
   * explicit `STAGING_DEMO_AUTH_ENABLED` flag AND a matching secret header. See
   * {@link AuthConfig.stagingDemoAuth} and docs/STAGING_DEMO_AUTH.md.
   */
  async resolveDemoUser(email: string): Promise<AccessTokenPayload> {
    const normalizedEmail = this.normalizeEmail(email);
    const user = await this.prisma.user.upsert({
      where: { email: normalizedEmail },
      create: { email: normalizedEmail, name: 'Demo User', authProvider: 'demo' },
      update: {},
      select: { id: true, email: true },
    });
    return { sub: user.id, email: user.email };
  }
}
