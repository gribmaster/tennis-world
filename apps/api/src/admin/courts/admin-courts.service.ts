import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AdminCourtDetailDTO, AdminCourtListResponseDTO } from '@tennis/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { approxFromExact, mapCoordsFromSeed, URL_SAFE_SLUG_PATTERN } from '../../courts/court-derived-fields';
import { assertCourtLatLngNotZeroZero, resolveCourtSlug, SLUG_RULE_MESSAGE } from './admin-court-pure';
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
    assertCourtLatLngNotZeroZero(dto.lat, dto.lng);

    const tags = validateAdminTags(dto.tags ?? []);
    const mapLinkUrl = validateMapLinkUrl(dto.mapLinkUrl ?? null);
    const slug = resolveCourtSlug(dto.slug, dto.name);
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
    // Cheap pre-lock existence check for the early 404 ONLY — its result is
    // never used for any decision below (TASK_78 fix 1). Everything the write
    // depends on is re-read fresh, inside the lock, in the transaction.
    const exists = await this.prisma.court.findUnique({ where: { id }, select: { id: true } });
    if (!exists) {
      throw new NotFoundException(`Court "${id}" not found.`);
    }

    let resolvedSlug = dto.slug ?? id;

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        await lockCourtRow(tx, id);

        // Re-read the whole court (incl. images) fresh, INSIDE the lock — a
        // concurrent write (another field patch, an image delete/hero change,
        // a publish) could have changed any of this between the pre-lock
        // check above and here. Everything that depends on stored state is
        // computed from `fresh`, never from a pre-lock snapshot (TASK_78 fix 1
        // — lost-update + slug-race).
        const fresh = await tx.court.findUnique({ where: { id }, select: adminCourtDetailSelect });
        if (!fresh) {
          throw new NotFoundException(`Court "${id}" not found.`);
        }

        const countryId = dto.countryId ?? fresh.countryId;
        const regionId = dto.regionId ?? fresh.regionId;
        if (dto.countryId !== undefined || dto.regionId !== undefined) {
          await this.assertCountryRegion(countryId, regionId, tx);
        }

        let slug = fresh.slug;
        if (dto.slug !== undefined && dto.slug !== fresh.slug) {
          if (fresh.status === 'published') {
            throw new ConflictException('Cannot change the slug of a published court.');
          }
          if (!URL_SAFE_SLUG_PATTERN.test(dto.slug) || dto.slug.length > 80) {
            throw new BadRequestException(SLUG_RULE_MESSAGE);
          }
          slug = dto.slug;
        }
        resolvedSlug = slug;

        const lat = dto.lat ?? fresh.lat;
        const lng = dto.lng ?? fresh.lng;
        assertCourtLatLngNotZeroZero(lat, lng);

        const latLngChanged = dto.lat !== undefined || dto.lng !== undefined;
        const { approxLat, approxLng } = latLngChanged
          ? approxFromExact(lat, lng, slug)
          : { approxLat: fresh.approxLat, approxLng: fresh.approxLng };

        const tags = dto.tags !== undefined ? validateAdminTags(dto.tags) : fresh.tags;
        const mapLinkUrl = dto.mapLinkUrl !== undefined ? validateMapLinkUrl(dto.mapLinkUrl) : fresh.mapLinkUrl;
        const blurb = dto.blurb ?? fresh.blurb;
        const status = dto.status ?? fresh.status;

        if (status === 'published') {
          const missing = publishGateMissing({ blurb, lat, lng, images: fresh.images });
          if (missing.length > 0) {
            throw new UnprocessableEntityException({ message: 'Cannot publish: missing required fields.', missing });
          }
        }

        return tx.court.update({
          where: { id },
          data: {
            slug,
            name: dto.name ?? fresh.name,
            countryId,
            regionId,
            lat,
            lng,
            approxLat,
            approxLng,
            mapLinkUrl,
            surface: dto.surface ?? fresh.surface,
            setting: dto.setting ?? fresh.setting,
            access: dto.access ?? fresh.access,
            indoorOutdoor: dto.indoorOutdoor ?? fresh.indoorOutdoor,
            isScenic: dto.isScenic ?? fresh.isScenic,
            isFeatured: dto.isFeatured ?? fresh.isFeatured,
            isLocked: dto.isLocked ?? fresh.isLocked,
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
      throw this.mapSlugConflict(err, resolvedSlug);
    }
  }

  /** `regionId` must exist and belong to `countryId` (decision 11) — 400, not 404
   *  (this is request-body validation, not a resource lookup). `client` defaults
   *  to the plain connection (used by `create()`); `update()` passes the `tx`
   *  it's already holding the row lock on, so this check runs against the same
   *  merged country/region ids it evaluates everything else from, inside the
   *  transaction (TASK_78 fix 1). */
  private async assertCountryRegion(
    countryId: string,
    regionId: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const region = await client.region.findUnique({
      where: { id: regionId },
      select: { countryId: true },
    });
    if (!region) {
      throw new BadRequestException(`Unknown regionId "${regionId}".`);
    }
    if (region.countryId !== countryId) {
      throw new BadRequestException(`regionId "${regionId}" does not belong to countryId "${countryId}".`);
    }
    const country = await client.country.findUnique({ where: { id: countryId }, select: { id: true } });
    if (!country) {
      throw new BadRequestException(`Unknown countryId "${countryId}".`);
    }
  }

  private mapSlugConflict(err: unknown, slug: string): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ConflictException(`Slug "${slug}" is already in use.`);
    }
    return err;
  }
}
