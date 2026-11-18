import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AdminDTO, AdminSessionDTO } from '@tennis/contracts';
import { clearAdminSessionCookie, setAdminSessionCookie } from './admin-auth.cookies';
import { loadAuthConfig } from '../../auth/auth.config';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminCsrfGuard } from './admin-csrf.guard';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginRequestDTO } from './admin-auth.dto';
import { ADMIN_AUTH_CONFIG } from './admin-auth.config';
import type { AdminAuthConfig } from './admin-auth.config';
import { AdminLoginRateLimitService } from './admin-login-rate-limit.service';
import type { RequestWithAdmin } from './admin-auth.types';

// ─────────────────────────────────────────────────────────────────────────────
// AdminAuthController (TASK_73):
//   POST /v1/admin/auth/login  → 200, AdminSessionDTO + Set-Cookie. PUBLIC — the
//                                only unauthenticated admin route (decision).
//   POST /v1/admin/auth/logout → 204, clears the cookie. Requires a valid admin
//                                session (any role) + the CSRF header if cookie-authed.
//   GET  /v1/admin/auth/me     → 200, AdminDTO. Requires a valid admin session,
//                                ANY role (decision 5 — the one role-guard exception).
// ─────────────────────────────────────────────────────────────────────────────

const LOGIN_RATE_LIMIT_MESSAGE = 'Too many login attempts. Please try again later.';

@Controller('admin/auth')
export class AdminAuthController {
  private readonly logger = new Logger(AdminAuthController.name);
  private readonly authConfig = loadAuthConfig();

  constructor(
    private readonly adminAuth: AdminAuthService,
    private readonly rateLimit: AdminLoginRateLimitService,
    @Inject(ADMIN_AUTH_CONFIG) private readonly adminConfig: AdminAuthConfig,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: AdminLoginRequestDTO,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminSessionDTO> {
    const email = body.email.trim().toLowerCase();
    const ipKey = `ip:${req.ip ?? 'unknown'}`;
    const emailKey = `email:${email}`;

    const ipCheck = this.rateLimit.check(ipKey);
    const emailCheck = this.rateLimit.check(emailKey);
    if (!ipCheck.allowed || !emailCheck.allowed) {
      const retryAfterSeconds = Math.max(ipCheck.retryAfterSeconds, emailCheck.retryAfterSeconds);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      this.logger.warn(`admin login rate-limited email=${email} ip=${req.ip ?? 'unknown'}`);
      throw new HttpException(LOGIN_RATE_LIMIT_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
    }

    try {
      const session = await this.adminAuth.login(email, body.password, { ip: req.ip });
      this.rateLimit.reset(emailKey);
      setAdminSessionCookie(res, this.authConfig, this.adminConfig, session.accessToken);
      return session;
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        this.rateLimit.recordFailure(ipKey);
        this.rateLimit.recordFailure(emailKey);
      }
      throw err;
    }
  }

  @Post('logout')
  @UseGuards(AdminAuthGuard, AdminCsrfGuard)
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    clearAdminSessionCookie(res, this.authConfig);
  }

  @Get('me')
  @UseGuards(AdminAuthGuard)
  me(@Req() req: Request & RequestWithAdmin): AdminDTO {
    const admin = req.admin!;
    return { id: admin.adminId, email: admin.email, role: admin.role };
  }
}
