import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthSessionDTO } from '@tennis/contracts';
import { Inject } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import { clearSessionCookie, setSessionCookie } from './auth.cookies';
import {
  RequestMagicLinkRequestDTO,
  VerifyMagicLinkRequestDTO,
} from './auth.dto';

// ─────────────────────────────────────────────────────────────────────────────
// AuthController — the public auth surface (prompt tasks 6/7/8). All three routes
// are PUBLIC (no AuthGuard): they ESTABLISH or END identity, so guarding them would
// be circular. Bodies are validated by the global ValidationPipe against the
// class-validator DTOs.
//
//   POST /v1/auth/request-link → 202, generic `{ ok: true }` (no enumeration).
//   POST /v1/auth/verify       → 200, AuthSessionDTO + Set-Cookie (web) / token (body).
//   POST /v1/auth/logout       → 200, `{ ok: true }` + cookie cleared (safe if not
//                                logged in — no guard, idempotent).
//
// COOKIE PLUMBING: the routes that touch the session cookie use `@Res({ passthrough:
// true })` so we can call `res.cookie`/`res.clearCookie` while STILL returning a DTO
// the way Nest normally serializes it (passthrough = don't take over the response).
// `verify` reads the request only to capture best-effort context for the token row.
// ─────────────────────────────────────────────────────────────────────────────

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  /**
   * POST /v1/auth/request-link — issue a magic link for an email. Always 202 +
   * `{ ok: true }`, regardless of whether the email has an account (no enumeration).
   */
  @Post('request-link')
  @HttpCode(202)
  async requestLink(
    @Body() body: RequestMagicLinkRequestDTO,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    const userAgent = req.headers['user-agent'];
    await this.auth.requestLink(body.email, body.redirectTo, {
      ...(typeof userAgent === 'string' ? { userAgent } : {}),
      ...(req.ip ? { ip: req.ip } : {}),
    });
    return { ok: true };
  }

  /**
   * POST /v1/auth/verify — consume the token, mint a session. Returns the
   * AuthSessionDTO (with bearer `accessToken` for mobile) AND sets the httpOnly
   * session cookie for the web client.
   */
  @Post('verify')
  @HttpCode(200)
  async verify(
    @Body() body: VerifyMagicLinkRequestDTO,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionDTO> {
    const session = await this.auth.verify(body.token);
    // `accessToken` is guaranteed present from issueSession; cookie carries it for web.
    if (session.accessToken) {
      setSessionCookie(res, this.config, session.accessToken);
    }
    return session;
  }

  /**
   * POST /v1/auth/logout — clear the session cookie. No guard (idempotent + safe when
   * already logged out). Stateless access JWTs aren't individually revocable before
   * expiry (acceptable given the short TTL; a refresh-revocation list is a documented
   * follow-on — Feature 50 §7.7).
   */
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response): { ok: true } {
    clearSessionCookie(res, this.config);
    return { ok: true };
  }
}
