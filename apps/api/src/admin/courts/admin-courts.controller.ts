import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { AdminCourtDetailDTO, AdminCourtListResponseDTO } from '@tennis/contracts';
import { AdminOnly } from '../auth/admin-roles.guard';
import type { RequestWithAdmin } from '../auth/admin-auth.types';
import { AdminCourtsService } from './admin-courts.service';
import { CreateCourtRequestDTO, UpdateCourtRequestDTO, parseAdminCourtListQuery } from './admin-courts.dto';

// ─────────────────────────────────────────────────────────────────────────────
// AdminCourtsController (TASK_73, "What to build" §3). Every route requires the
// `admin` role via `@AdminOnly('admin')` (auth + CSRF + role, composed).
// ─────────────────────────────────────────────────────────────────────────────

@Controller('admin/courts')
@AdminOnly('admin')
export class AdminCourtsController {
  constructor(private readonly courts: AdminCourtsService) {}

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
