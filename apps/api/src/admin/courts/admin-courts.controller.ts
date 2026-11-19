import { Body, Controller, Get, HttpException, HttpStatus, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AdminCourtDetailDTO, AdminCourtImportReportDTO, AdminCourtListResponseDTO } from '@tennis/contracts';
import { AdminOnly } from '../auth/admin-roles.guard';
import type { RequestWithAdmin } from '../auth/admin-auth.types';
import { AdminCourtsService } from './admin-courts.service';
import { CreateCourtRequestDTO, UpdateCourtRequestDTO, parseAdminCourtListQuery } from './admin-courts.dto';
import { AdminCourtImportService } from './admin-court-import.service';
import { parseImportRequestBody } from './admin-court-import.dto';
import { AdminCourtImportRateLimitService } from './admin-court-import-rate-limit.service';

// ─────────────────────────────────────────────────────────────────────────────
// AdminCourtsController (TASK_73, "What to build" §3). Every route requires the
// `admin` role via `@AdminOnly('admin')` (auth + CSRF + role, composed).
// ─────────────────────────────────────────────────────────────────────────────

@Controller('admin/courts')
@AdminOnly('admin')
export class AdminCourtsController {
  constructor(
    private readonly courts: AdminCourtsService,
    private readonly importService: AdminCourtImportService,
    private readonly importRateLimit: AdminCourtImportRateLimitService,
  ) {}

  // Declared before the other routes so a reader can see at a glance that
  // "import" is a static segment, never capturable by `:id` (TASK_79 — there
  // is no `@Post(':id')` on this controller, so this was never actually
  // ambiguous, but the literal route is kept first for clarity).
  @Post('import')
  async importCourts(
    // Deliberately NOT a `class-validator` DTO — see `parseImportRequestBody`.
    @Body() rawBody: Record<string, unknown>,
    @Req() req: Request & RequestWithAdmin,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminCourtImportReportDTO> {
    const adminId = req.admin!.adminId;
    const { courts, dryRun } = parseImportRequestBody(rawBody);

    const limit = dryRun ? this.importRateLimit.hitDryRun(adminId) : this.importRateLimit.hitCommit(adminId);
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSeconds));
      throw new HttpException('Too many court import requests. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const report = await this.importService.run(courts, dryRun, adminId);
    res.status(dryRun ? HttpStatus.OK : HttpStatus.CREATED);
    return report;
  }

  @Get()
  list(@Query() query: Record<string, unknown>): Promise<AdminCourtListResponseDTO> {
    return this.courts.list(parseAdminCourtListQuery(query));
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<AdminCourtDetailDTO> {
    return this.courts.getById(id);
  }

  @Post()
  create(
    @Body() body: CreateCourtRequestDTO,
    @Req() req: Request & RequestWithAdmin,
  ): Promise<AdminCourtDetailDTO> {
    return this.courts.create(body, req.admin!.adminId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateCourtRequestDTO,
    @Req() req: Request & RequestWithAdmin,
  ): Promise<AdminCourtDetailDTO> {
    return this.courts.update(id, body, req.admin!.adminId);
  }
}
