import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { AdminCountryCreatedDTO, AdminCountryDTO, AdminRegionCreatedDTO } from '@tennis/contracts';
import { AdminOnly } from '../auth/admin-roles.guard';
import type { RequestWithAdmin } from '../auth/admin-auth.types';
import { AdminGeoService } from './admin-geo.service';
import { CreateCountryRequestDTO, CreateRegionRequestDTO } from './admin-geo.dto';

// ─────────────────────────────────────────────────────────────────────────────
// AdminGeoController (TASK_73, "What to build" §4):
//   GET  /v1/admin/countries → AdminCountryDTO[] (ALL countries + their regions)
//   POST /v1/admin/countries → 201 AdminCountryCreatedDTO
//   POST /v1/admin/regions   → 201 AdminRegionCreatedDTO
// ─────────────────────────────────────────────────────────────────────────────

@Controller('admin')
@AdminOnly('admin')
export class AdminGeoController {
  constructor(private readonly geo: AdminGeoService) {}

  @Get('countries')
  listCountries(): Promise<AdminCountryDTO[]> {
    return this.geo.listCountries();
  }

  @Post('countries')
  createCountry(
    @Body() body: CreateCountryRequestDTO,
    @Req() req: Request & RequestWithAdmin,
  ): Promise<AdminCountryCreatedDTO> {
    return this.geo.createCountry(body, req.admin!.adminId);
  }

  @Post('regions')
  createRegion(
    @Body() body: CreateRegionRequestDTO,
    @Req() req: Request & RequestWithAdmin,
  ): Promise<AdminRegionCreatedDTO> {
    return this.geo.createRegion(body, req.admin!.adminId);
  }
}
