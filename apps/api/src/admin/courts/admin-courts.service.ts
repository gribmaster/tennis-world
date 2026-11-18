import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AdminCourtDetailDTO, AdminCourtListResponseDTO } from '@tennis/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { approxFromExact, mapCoordsFromSeed, slugify, URL_SAFE_SLUG_PATTERN } from '../../courts/court-derived-fields';
import { lockCourtRow } from './court-lock';
import { logAdminMutation } from '../admin-mutation-logger';
import type { AdminCourtListQuery, CreateCourtRequestDTO, UpdateCourtRequestDTO } from './admin-courts.dto';
import { validateAdminTags } from './admin-courts.dto';
import { validateMapLinkUrl } from './admin-map-link.util';
import {
  adminCourtDetailSelect,
  adminCourtListSelect,
  publishGateMissing,
  toAdminCourtDetailDTO,
  toAdminCourtListItemDTO,
} from './admin-courts.mapper';

// ─────────────────────────────────────────────────────────────────────────────
// AdminCourtsService (TASK_73) — the only place a court row is created/edited
// outside the content importer / SQL. See decisions 7–13 in
// docs/TASK_73_ADMIN_COURTS_API.md for the exact rules this implements:
// no hard delete, server-computed derived fields, slug immutability once
// published, the publish gate, and strict field validation.
// ─────────────────────────────────────────────────────────────────────────────

const SLUG_RULE_MESSAGE =
  'slug must match ^[a-z0-9]+(?:-[a-z0-9]+)*$ and be at most 80 characters.';

@Injectable()
export class AdminCourtsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminCourtListQuery): Promise<AdminCourtListResponseDTO> {
    const where: Prisma.CourtWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.q) {
      const contains = query.q;
      const mode = Prisma.QueryMode.insensitive;
      where.OR = [{ name: { contains, mode } }, { slug: { contains, mode } }];
    }

    const [rows, total] = await Promise.all([
      this.prisma.court.findMany({
        where,
        select: adminCourtListSelect,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.court.count({ where }),
    ]);

    return {
      items: rows.map(toAdminCourtListItemDTO),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getById(id: string): Promise<AdminCourtDetailDTO> {
    const row = await this.prisma.court.findUnique({ where: { id }, select: adminCourtDetailSelect });
    if (!row) {
      throw new NotFoundException(`Court "${id}" not found.`);
    }
    return toAdminCourtDetailDTO(row);
  }

  async create(dto: CreateCourtRequestDTO, adminId: string): Promise<AdminCourtDetailDTO> {
    await this.assertCountryRegion(dto.countryId, dto.regionId);
    this.assertNotZeroZero(dto.lat, dto.lng);

    const tags = validateAdminTags(dto.tags ?? []);
    const mapLinkUrl = validateMapLinkUrl(dto.mapLinkUrl ?? null);
    const slug = this.resolveSlug(dto.slug, dto.name);
    const status = dto.status ?? 'draft';
    const blurb = dto.blurb ?? '';

    const { approxLat, approxLng } = approxFromExact(dto.lat, dto.lng, slug);
    const { mapX, mapY } = mapCoordsFromSeed(slug);

    if (status === 'published') {
      const missing = publishGateMissing({ blurb, lat: dto.lat, lng: dto.lng, images: [] });
      if (missing.length > 0) {
        throw new UnprocessableEntityException({ message: 'Cannot publish: missing required fields.', missing });
      }
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const maxRow = await tx.court.aggregate({ _max: { seedOrder: true } });
        const seedOrder = (maxRow._max.seedOrder ?? -1) + 1;

        return tx.court.create({
          data: {
            slug,
            name: dto.name,
            countryId: dto.countryId,
            regionId: dto.regionId,
            lat: dto.lat,
            lng: dto.lng,
            approxLat,
            approxLng,
            mapLinkUrl,
            mapX,
            mapY,
            surface: dto.surface,
            setting: dto.setting,
            access: dto.access,
            indoorOutdoor: dto.indoorOutdoor,
            isScenic: dto.isScenic ?? false,
            isFeatured: dto.isFeatured ?? false,
            isLocked: dto.isLocked ?? false,
            status,
            blurb,
            tags,
            seedOrder,
          },
          select: adminCourtDetailSelect,
        });
      });

      logAdminMutation({
        adminId,
        action: 'court.create',
        targetType: 'Court',
        targetId: created.id,
        changedFields: Object.keys(dto),
      });
      return toAdminCourtDetailDTO(created);
    } catch (err) {
      throw this.mapSlugConflict(err, slug);
    }
  }

  async update(id: string, dto: UpdateCourtRequestDTO, adminId: string): Promise<AdminCourtDetailDTO> {
    const existing = await this.prisma.court.findUnique({ where: { id }, select: adminCourtDetailSelect });
    if (!existing) {
      throw new NotFoundException(`Court "${id}" not found.`);
    }

    const countryId = dto.countryId ?? existing.countryId;
    const regionId = dto.regionId ?? existing.regionId;
    if (dto.countryId !== undefined || dto.regionId !== undefined) {
      await this.assertCountryRegion(countryId, regionId);
    }

    let slug = existing.slug;
    if (dto.slug !== undefined && dto.slug !== existing.slug) {
      if (existing.status === 'published') {
        throw new ConflictException('Cannot change the slug of a published court.');
      }
      if (!URL_SAFE_SLUG_PATTERN.test(dto.slug) || dto.slug.length > 80) {
        throw new BadRequestException(SLUG_RULE_MESSAGE);
      }
      slug = dto.slug;
    }

    const lat = dto.lat ?? existing.lat;
    const lng = dto.lng ?? existing.lng;
    this.assertNotZeroZero(lat, lng);

    const latLngChanged = dto.lat !== undefined || dto.lng !== undefined;
    const { approxLat, approxLng } = latLngChanged
      ? approxFromExact(lat, lng, slug)
      : { approxLat: existing.approxLat, approxLng: existing.approxLng };

    const tags = dto.tags !== undefined ? validateAdminTags(dto.tags) : existing.tags;
    const mapLinkUrl = dto.mapLinkUrl !== undefined ? validateMapLinkUrl(dto.mapLinkUrl) : existing.mapLinkUrl;
    const blurb = dto.blurb ?? existing.blurb;
    const status = dto.status ?? existing.status;

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        await lockCourtRow(tx, id);

        if (status === 'published') {
          // Re-read the court's images (and status) fresh, INSIDE the lock —
          // `existing.images` above was read before the lock and a concurrent
          // image delete/hero change could have invalidated it in between
          // (TASK_76 decision 2: publish must never race a delete of the
          // court's last/hero image).
          const fresh = await tx.court.findUnique({
            where: { id },
            select: { status: true, images: { select: { isHero: true } } },
          });
          if (!fresh) {
            throw new NotFoundException(`Court "${id}" not found.`);
          }
          const missing = publishGateMissing({ blurb, lat, lng, images: fresh.images });
          if (missing.length > 0) {
            throw new UnprocessableEntityException({ message: 'Cannot publish: missing required fields.', missing });
          }
        }

        return tx.court.update({
          where: { id },
          data: {
            slug,
            name: dto.name ?? existing.name,
            countryId,
            regionId,
            lat,
            lng,
            approxLat,
            approxLng,
            mapLinkUrl,
            surface: dto.surface ?? existing.surface,
            setting: dto.setting ?? existing.setting,
            access: dto.access ?? existing.access,
            indoorOutdoor: dto.indoorOutdoor ?? existing.indoorOutdoor,
            isScenic: dto.isScenic ?? existing.isScenic,
            isFeatured: dto.isFeatured ?? existing.isFeatured,
            isLocked: dto.isLocked ?? existing.isLocked,
            status,
            blurb,
            tags,
            // mapX/mapY/seedOrder are NEVER included here (decision 8).
          },
          select: adminCourtDetailSelect,
        });
      });

      logAdminMutation({
        adminId,
        action: 'court.update',
        targetType: 'Court',
        targetId: updated.id,
        changedFields: Object.keys(dto),
      });
      return toAdminCourtDetailDTO(updated);
    } catch (err) {
      throw this.mapSlugConflict(err, slug);
    }
  }

  /** `regionId` must exist and belong to `countryId` (decision 11) — 400, not 404
   *  (this is request-body validation, not a resource lookup). */
  private async assertCountryRegion(countryId: string, regionId: string): Promise<void> {
    const region = await this.prisma.region.findUnique({
      where: { id: regionId },
      select: { countryId: true },
    });
    if (!region) {
      throw new BadRequestException(`Unknown regionId "${regionId}".`);
    }
    if (region.countryId !== countryId) {
      throw new BadRequestException(`regionId "${regionId}" does not belong to countryId "${countryId}".`);
    }
    const country = await this.prisma.country.findUnique({ where: { id: countryId }, select: { id: true } });
    if (!country) {
      throw new BadRequestException(`Unknown countryId "${countryId}".`);
    }
  }

  /** lat/lng === 0/0 is never a real location (decision 11). */
  private assertNotZeroZero(lat: number, lng: number): void {
    if (lat === 0 && lng === 0) {
      throw new BadRequestException('lat/lng of exactly 0,0 is not a valid location.');
    }
  }

  private resolveSlug(provided: string | undefined, name: string): string {
    const candidate = provided?.trim() || slugify(name);
    if (!candidate || !URL_SAFE_SLUG_PATTERN.test(candidate) || candidate.length > 80) {
      throw new BadRequestException(SLUG_RULE_MESSAGE);
    }
    return candidate;
  }

  private mapSlugConflict(err: unknown, slug: string): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ConflictException(`Slug "${slug}" is already in use.`);
    }
    return err;
  }
}
