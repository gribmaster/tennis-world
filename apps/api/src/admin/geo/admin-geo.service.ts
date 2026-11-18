import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AdminCountryCreatedDTO, AdminCountryDTO, AdminRegionCreatedDTO } from '@tennis/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { logAdminMutation } from '../admin-mutation-logger';
import type { CreateCountryRequestDTO, CreateRegionRequestDTO } from './admin-geo.dto';

// ─────────────────────────────────────────────────────────────────────────────
// AdminGeoService (TASK_73, "What to build" §4) — countries + regions. ALL
// countries (not only those with a published court — that's the PUBLIC
// `CountriesService`'s rule, unrelated to this admin read). No edit, no delete
// for either model in this task.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class AdminGeoService {
  constructor(private readonly prisma: PrismaService) {}

  async listCountries(): Promise<AdminCountryDTO[]> {
    const rows = await this.prisma.country.findMany({
      select: {
        id: true,
        name: true,
        isoCode: true,
        continent: true,
        regions: { select: { id: true, name: true } },
      },
    });

    return rows
      .map((row) => ({
        id: row.id,
        name: row.name,
        isoCode: row.isoCode,
        continent: row.continent,
        regions: [...row.regions].sort((a, b) => a.name.localeCompare(b.name, 'en')),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  }

  async createCountry(dto: CreateCountryRequestDTO, adminId: string): Promise<AdminCountryCreatedDTO> {
    const isoCode = dto.isoCode.toUpperCase();

    const existingName = await this.prisma.country.findFirst({
      where: { name: { equals: dto.name, mode: Prisma.QueryMode.insensitive } },
      select: { id: true },
    });
    if (existingName) {
      throw new ConflictException(`Country name "${dto.name}" already exists.`);
    }

    try {
      const created = await this.prisma.country.create({
        data: { name: dto.name, isoCode, continent: dto.continent },
      });
      logAdminMutation({
        adminId,
        action: 'country.create',
        targetType: 'Country',
        targetId: created.id,
        changedFields: ['name', 'isoCode', 'continent'],
      });
      return { id: created.id, name: created.name, isoCode: created.isoCode, continent: created.continent };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`isoCode "${isoCode}" already exists.`);
      }
      throw err;
    }
  }

  async createRegion(dto: CreateRegionRequestDTO, adminId: string): Promise<AdminRegionCreatedDTO> {
    const created = await this.prisma.$transaction(async (tx) => {
      const country = await tx.country.findUnique({ where: { id: dto.countryId }, select: { id: true } });
      if (!country) {
        throw new NotFoundException(`Country "${dto.countryId}" not found.`);
      }

      const existing = await tx.region.findFirst({
        where: { countryId: dto.countryId, name: { equals: dto.name, mode: Prisma.QueryMode.insensitive } },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException(`Region name "${dto.name}" already exists in this country.`);
      }

      return tx.region.create({
        data: { countryId: dto.countryId, name: dto.name, lat: dto.lat, lng: dto.lng },
      });
    });

    logAdminMutation({
      adminId,
      action: 'region.create',
      targetType: 'Region',
      targetId: created.id,
      changedFields: ['countryId', 'name', 'lat', 'lng'],
    });
    return { id: created.id, name: created.name, countryId: created.countryId, lat: created.lat, lng: created.lng };
  }
}
