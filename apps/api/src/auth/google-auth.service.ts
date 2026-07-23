import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import type { Prisma } from '@prisma/client';
import type { AuthSessionDTO } from '@tennis/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { GOOGLE_AUTH_CONFIG, type GoogleAuthConfig } from './google-auth.config';

// ─────────────────────────────────────────────────────────────────────────────
// GoogleAuthService — the Google OAuth authorization-code flow's server-side
// logic: build the authorize URL, exchange the code + verify the ID token
// (signature/issuer/audience/expiry/email — all via the OFFICIAL
// `google-auth-library`, never hand-decoded), find-or-create the local User, and
// hand off to the EXISTING `AuthService` to mint the SAME session/cookie the
// magic-link flow issues. No second session system.
//
// SCOPE: `openid email profile` + `access_type=online` only (Decision, per the
// feature spec) — no Drive/Calendar/Contacts, no offline access, no refresh
// token. This service never stores a Google access or refresh token — only the
// verified identity claims (sub/email/name/picture) are persisted, and only onto
// the User row (googleId/avatarUrl). The app only needs AUTHENTICATION, not
// continued API access to the user's Google account.
//
// ACCOUNT LINKING (email-primary, sub-secondary — see findOrCreateUser): lookup
// is always by normalized+verified email first. `googleId` is stored/backfilled
// but is never the primary lookup key and never overwrites a differing existing
// value.
// ─────────────────────────────────────────────────────────────────────────────

/** The verified claims this service extracts from a validated Google ID token. */
export interface VerifiedGoogleClaims {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
}

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    @Inject(GOOGLE_AUTH_CONFIG) private readonly config: GoogleAuthConfig,
  ) {}

  /**
   * Build Google's authorization endpoint URL for the given nonce. Pure — no
   * cookie/request access, so it's trivially unit-testable. All params are
   * encoded via `URLSearchParams` (never string concatenation). Requests only
   * `openid email profile` with `access_type=online` (no refresh token, no
   * extra-scope consent) per the feature's minimal-scope requirement.
   */
  buildAuthorizeUrl(nonce: string): string {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online',
      state: nonce,
    });
    url.search = params.toString();
    return url.toString();
  }

  /**
   * Exchange the authorization `code` server-to-server, then verify the returned
   * ID token via `OAuth2Client.verifyIdToken` — this checks signature (against
   * Google's live JWKS), issuer, audience (=== GOOGLE_CLIENT_ID), and expiry
   * INTERNALLY, throwing on any failure. We additionally require `email` present
   * and `email_verified === true` (Google issues ID tokens for unverified emails
   * in some flows; we refuse to sign in on an unverified one). Throws
   * `UnauthorizedException` on any failure — the controller maps every throw here
   * to the SAME generic redirect (no internals leaked to the browser).
   */
  private async exchangeAndVerify(code: string): Promise<VerifiedGoogleClaims> {
    const client = new OAuth2Client(
      this.config.clientId,
      this.config.clientSecret,
      this.config.redirectUri,
    );

    let idToken: string | null | undefined;
    try {
      const { tokens } = await client.getToken(code);
      idToken = tokens.id_token;
    } catch (err) {
      this.logger.warn(
        `Google code exchange failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
      throw new UnauthorizedException('Google sign-in failed.');
    }
    if (!idToken) {
      throw new UnauthorizedException('Google sign-in failed.');
    }

    let payload;
    try {
      // `verifyIdToken` internally verifies signature (against Google's live JWKS),
      // issuer (hardcoded by the library to Google's own accounts.google.com /
      // https://accounts.google.com — not caller-configurable, which is exactly what
      // we want: no risk of a caller accidentally widening accepted issuers), audience
      // (checked against `audience` below), and expiry — throwing on any failure.
      const ticket = await client.verifyIdToken({
        idToken,
        audience: this.config.clientId,
      });
      payload = ticket.getPayload();
    } catch (err) {
      this.logger.warn(
        `Google ID token verification failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
      throw new UnauthorizedException('Google sign-in failed.');
    }

    if (!payload || !payload.email || payload.email_verified !== true) {
      throw new UnauthorizedException('Google account email not verified.');
    }

    return {
      sub: payload.sub,
      email: payload.email.trim().toLowerCase(),
      name: payload.name?.trim() || null,
      picture: payload.picture?.trim() || null,
    };
  }

  /**
   * Find-or-create + link the local User for verified Google claims.
   *
   * LINKING RULE (email-primary): lookup is ALWAYS by normalized `email` first.
   *   - Match found: reuse that row. `googleId` is backfilled ONLY if currently
   *     null (a differing existing `googleId` is left untouched — reassigning it
   *     would silently move the account to a different Google identity; this is
   *     treated as a benign edge case, not an error, since email is
   *     Google-verified and remains the trusted key). `name`/`avatarUrl` are
   *     filled ONLY if currently null/empty — never overwrite existing profile
   *     data the user may have set themselves.
   *   - No match: create a new User with `authProvider: 'google'`.
   * Repeated Google sign-ins for the same email always resolve to the same row.
   */
  private async findOrCreateUser(
    claims: VerifiedGoogleClaims,
  ): Promise<{ id: string; email: string; name: string | null }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: claims.email },
    });

    if (existing) {
      const data: Prisma.UserUpdateInput = {};
      if (!existing.googleId) data.googleId = claims.sub;
      if (!existing.name && claims.name) data.name = claims.name;
      if (!existing.avatarUrl && claims.picture) data.avatarUrl = claims.picture;

      if (Object.keys(data).length > 0) {
        const updated = await this.prisma.user.update({
          where: { id: existing.id },
          data,
          select: { id: true, email: true, name: true },
        });
        return updated;
      }
      return { id: existing.id, email: existing.email, name: existing.name };
    }

    return this.prisma.user.create({
      data: {
        email: claims.email,
        name: claims.name,
        googleId: claims.sub,
        avatarUrl: claims.picture,
        authProvider: 'google',
      },
      select: { id: true, email: true, name: true },
    });
  }

  /**
   * Orchestrates the full callback flow for the controller: verify the code,
   * find/create the user, and mint the SAME session shape the magic-link `verify`
   * path issues (via `AuthService.issueSessionForUser`).
   */
  async completeSignIn(code: string): Promise<AuthSessionDTO> {
    const claims = await this.exchangeAndVerify(code);
    const user = await this.findOrCreateUser(claims);
    return this.authService.issueSessionForUser(user.id, user.email, user.name);
  }
}
