import { randomBytes } from 'node:crypto';
import { Controller, Get, Inject, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import { setSessionCookie } from './auth.cookies';
import { safeEqual } from './crypto.util';
import { GoogleAuthService } from './google-auth.service';
import { GOOGLE_AUTH_CONFIG, assertGoogleAuthConfigured, type GoogleAuthConfig } from './google-auth.config';
import {
  clearGoogleStateCookie,
  readGoogleStateCookie,
  setGoogleStateCookie,
} from './google-oauth.cookies';
import { sanitizeRedirect } from './redirect.util';

// ─────────────────────────────────────────────────────────────────────────────
// GoogleAuthController — the two public Google OAuth routes:
//   GET /v1/auth/google           → start the flow, 302 to Google.
//   GET /v1/auth/google/callback  → Google redirects back here, 302 to the web app.
//
// A SEPARATE controller from AuthController (same `auth` prefix — both mount
// under `@Controller('auth')`, so routes land at the exact paths above): these
// two routes are GET+redirect (302 responses, browser-navigated), fundamentally
// different in shape from AuthController's POST+JSON identity-establishing
// surface. Keeping them separate leaves `auth.controller.ts` untouched and keeps
// all the redirect/error-handling logic in one place purpose-built for it.
//
// ERROR HANDLING (uniform, no oracle): EVERY callback failure mode — Google's own
// `error` param, missing code/state, state mismatch, a failed code exchange, a
// failed ID-token verification, an unverified email — redirects to the SAME
// `${webAppUrl}/signin?error=google_auth_failed`. No failure-type-specific
// messaging is ever exposed to the browser. This mirrors the existing
// `AuthService.verify` idiom ("uniform rejection for not-found/expired/
// already-consumed — don't tell the caller which").
//
// NO TOKEN IN THE URL, EVER: the only way a session reaches the browser is the
// httpOnly cookie `setSessionCookie` sets — no redirect Location in this file ever
// carries an access token or any Google token.
// ─────────────────────────────────────────────────────────────────────────────

@Controller('auth')
export class GoogleAuthController {
  constructor(
    private readonly google: GoogleAuthService,
    @Inject(AUTH_CONFIG) private readonly authConfig: AuthConfig,
    @Inject(GOOGLE_AUTH_CONFIG) private readonly googleConfig: GoogleAuthConfig,
  ) {}

  /**
   * GET /v1/auth/google — start the flow. Validates the optional `redirectTo`
   * (same open-redirect guard the magic-link flow uses), mints a crypto-random
   * nonce, stores `{ nonce, redirectTo }` in the httpOnly state cookie, and
   * 302-redirects to Google's authorize endpoint requesting only
   * `openid email profile` with `access_type=online` (no offline/refresh access).
   */
  @Get('google')
  start(
    @Query('redirectTo') redirectTo: string | undefined,
    @Res() res: Response,
  ): void {
    assertGoogleAuthConfigured(this.googleConfig);

    const safeRedirect = sanitizeRedirect(redirectTo, this.authConfig.webAppUrl);
    const nonce = randomBytes(32).toString('hex');

    setGoogleStateCookie(res, this.authConfig.cookieSecure, {
      nonce,
      ...(safeRedirect ? { redirectTo: safeRedirect } : {}),
    });

    res.redirect(302, this.google.buildAuthorizeUrl(nonce));
  }

  /**
   * GET /v1/auth/google/callback — Google redirects here with `code`+`state` (or
   * `error`). Verifies `state` against the cookie (timing-safe compare), clears
   * the state cookie unconditionally, exchanges the code + verifies the ID token,
   * finds/creates the User, issues the SAME session cookie the magic-link flow
   * uses, and redirects to the validated `redirectTo` or `${webAppUrl}/profile`.
   */
  @Get('google/callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    assertGoogleAuthConfigured(this.googleConfig);

    const stateCookie = readGoogleStateCookie(req);
    // Single-use regardless of outcome — clear it on every path below.
    clearGoogleStateCookie(res, this.authConfig.cookieSecure);

    if (error) {
      res.redirect(302, this.errorRedirect());
      return;
    }

    if (
      !code ||
      !state ||
      !stateCookie ||
      !safeEqual(state, stateCookie.nonce)
    ) {
      res.redirect(302, this.errorRedirect());
      return;
    }

    try {
      const session = await this.google.completeSignIn(code);
      if (session.accessToken) {
        setSessionCookie(res, this.authConfig, session.accessToken);
      }
      const destination = stateCookie.redirectTo
        ? `${this.authConfig.webAppUrl}${stateCookie.redirectTo}`
        : `${this.authConfig.webAppUrl}/profile`;
      res.redirect(302, destination);
    } catch {
      // Any exchange/verification/DB failure — uniform, no internals leaked.
      res.redirect(302, this.errorRedirect());
    }
  }

  /** The single, fixed failure destination for every callback failure mode. */
  private errorRedirect(): string {
    const url = new URL(`${this.authConfig.webAppUrl}/signin`);
    url.searchParams.set('error', 'google_auth_failed');
    return url.toString();
  }
}
