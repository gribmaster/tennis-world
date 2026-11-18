import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { AdminCourtImageDTO } from '@tennis/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { lockCourtRow } from '../courts/court-lock';
import { logAdminMutation } from '../admin-mutation-logger';
import { sniffImageType } from './admin-image-sniff.util';
import {
  ADMIN_IMAGE_STORAGE_CONFIG,
  type AdminImageStorageConfig,
} from './admin-image-storage.config';
import {
  LocalImageStorageDriver,
  SupabaseImageStorageDriver,
  type ImageStorageDriver,
} from './admin-image-storage';
import type { PatchImageRequestDTO } from './admin-images.dto';

// ─────────────────────────────────────────────────────────────────────────────
// AdminImagesService (TASK_73, decisions 14–17). The hero invariant — a court
// with >= 1 image has EXACTLY ONE `isHero` image — is restored inside the same
// transaction as every mutation that could break it (upload/patch/delete).
//
// CONCURRENCY (TASK_75, decision 1): every transaction that reads-then-writes a
// court's images first takes a row lock on the Court via `lockCourtRow` —
// `SELECT id FROM "Court" WHERE id = $1 FOR UPDATE` — and every read that
// decides what to write (max sortOrder, image count, current hero, remaining
// count) happens AFTER that lock, inside the SAME transaction. Two concurrent
// `upload`s on the same court (the UI fires several in quick succession) would
// otherwise both observe `count === 0` and both set `isHero: true` with
// `sortOrder: 0` — a real race proven to occur without the lock (see the
// "concurrent uploads" section of `verify-admin-courts.ts`). Default (READ
// COMMITTED) isolation is kept — a second transaction's `FOR UPDATE` simply
// blocks until the first commits, then re-reads the now-current row; no
// Serializable retry handling is needed.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class AdminImagesService {
  private readonly logger = new Logger(AdminImagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ADMIN_IMAGE_STORAGE_CONFIG) private readonly storageConfig: AdminImageStorageConfig,
  ) {}

  /** Built fresh per call (never cached at construction) so an incomplete
   *  Supabase config fails at REQUEST time (503), never at boot. */
  private getDriver(): ImageStorageDriver {
    if (this.storageConfig.kind === 'local') {
      return new LocalImageStorageDriver();
    }
    const supabase = this.storageConfig.supabase;
    // SupabaseImageStorageDriver's constructor itself throws ServiceUnavailableException
    // when the settings are incomplete — this guard just avoids constructing with `undefined`.
    return new SupabaseImageStorageDriver(
      supabase ?? { url: '', serviceRoleKey: '', bucket: 'court-images' },
    );
  }

  async upload(
    courtId: string,
    file: { buffer: Buffer },
    alt: string | undefined,
    adminId: string,
  ): Promise<AdminCourtImageDTO> {
    const court = await this.prisma.court.findUnique({ where: { id: courtId }, select: { id: true } });
    if (!court) {
      throw new NotFoundException(`Court "${courtId}" not found.`);
    }

    const sniffed = sniffImageType(file.buffer);
    if (!sniffed) {
      throw new UnsupportedMediaTypeException(
        'Unrecognized image type — only JPEG, PNG, and WebP are accepted.',
      );
    }

    // Resolve + validate the driver BEFORE touching storage or the DB, so an
    // incomplete Supabase config fails with a clean 503 and nothing is written.
    const driver = this.getDriver();
    const objectName = `${randomUUID()}.${sniffed.ext}`;
    const { url } = await driver.upload({
      courtId,
      objectName,
      bytes: file.buffer,
      contentType: sniffed.type,
    });

    let created;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        await lockCourtRow(tx, courtId);
        const [maxRow, count] = await Promise.all([
          tx.courtImage.aggregate({ where: { courtId }, _max: { sortOrder: true } }),
          tx.courtImage.count({ where: { courtId } }),
        ]);
        const sortOrder = (maxRow._max.sortOrder ?? -1) + 1;
        return tx.courtImage.create({
          data: { courtId, url, alt: alt ?? null, sortOrder, isHero: count === 0 },
          select: { id: true, url: true, alt: true, sortOrder: true, isHero: true },
        });
      });
    } catch (err) {
      // A DB failure after a successful storage upload would otherwise orphan
      // the file — best-effort clean it up, then rethrow the real error.
      await driver.delete(url).catch(() => undefined);
      throw err;
    }

    logAdminMutation({
      adminId,
      action: 'image.upload',
      targetType: 'CourtImage',
      targetId: created.id,
      changedFields: ['url', 'isHero'],
    });
    return created;
  }

  async patch(
    courtId: string,
    imageId: string,
    dto: PatchImageRequestDTO,
    adminId: string,
  ): Promise<AdminCourtImageDTO> {
    const image = await this.prisma.courtImage.findUnique({
      where: { id: imageId },
      select: { id: true, courtId: true },
    });
    if (!image || image.courtId !== courtId) {
      throw new NotFoundException(`Image "${imageId}" not found on court "${courtId}".`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await lockCourtRow(tx, courtId);
      if (dto.isHero === true) {
        // Setting a hero clears every other image's hero flag first (decision 16).
        await tx.courtImage.updateMany({ where: { courtId, isHero: true }, data: { isHero: false } });
      }
      return tx.courtImage.update({
        where: { id: imageId },
        data: {
          ...(dto.alt !== undefined ? { alt: dto.alt } : {}),
          ...(dto.isHero === true ? { isHero: true } : {}),
        },
        select: { id: true, url: true, alt: true, sortOrder: true, isHero: true },
      });
    });

    logAdminMutation({
      adminId,
      action: 'image.patch',
      targetType: 'CourtImage',
      targetId: imageId,
      changedFields: Object.keys(dto),
    });
    return updated;
  }

  async reorder(courtId: string, imageIds: string[], adminId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockCourtRow(tx, courtId);

      const existing = await tx.courtImage.findMany({
        where: { courtId },
        select: { id: true },
      });
      const existingIds = new Set(existing.map((i) => i.id));
      const providedIds = new Set(imageIds);

      const exactMatch =
        imageIds.length === existing.length &&
        providedIds.size === imageIds.length && // no duplicates
        imageIds.every((id) => existingIds.has(id));
      if (!exactMatch) {
        throw new BadRequestException(
          "imageIds must be exactly this court's current image id set — no missing, extra, or duplicate ids.",
        );
      }

      for (const [index, id] of imageIds.entries()) {
        await tx.courtImage.update({ where: { id }, data: { sortOrder: index } });
      }
    });

    logAdminMutation({
      adminId,
      action: 'image.reorder',
      targetType: 'Court',
      targetId: courtId,
      changedFields: ['imageOrder'],
    });
  }

  async delete(courtId: string, imageId: string, adminId: string): Promise<void> {
    const court = await this.prisma.court.findUnique({
      where: { id: courtId },
      select: { id: true },
    });
    if (!court) {
      throw new NotFoundException(`Court "${courtId}" not found.`);
    }

    // `url` is immutable once an image row exists, so it's safe to capture here
    // (outside the lock) for the storage-cleanup step after commit; everything
    // that decides WHAT gets written (hero/remaining-count/published-status) is
    // re-read fresh INSIDE the transaction, after the lock, below.
    const image = await this.prisma.courtImage.findUnique({
      where: { id: imageId },
      select: { id: true, courtId: true, url: true },
    });
    if (!image || image.courtId !== courtId) {
      throw new NotFoundException(`Image "${imageId}" not found on court "${courtId}".`);
    }

    await this.prisma.$transaction(async (tx) => {
      await lockCourtRow(tx, courtId);

      const [freshCourt, freshImage, remainingCount] = await Promise.all([
        tx.court.findUnique({ where: { id: courtId }, select: { status: true } }),
        tx.courtImage.findUnique({ where: { id: imageId }, select: { isHero: true } }),
        tx.courtImage.count({ where: { courtId, id: { not: imageId } } }),
      ]);
      if (!freshImage) {
        throw new NotFoundException(`Image "${imageId}" not found on court "${courtId}".`);
      }
      if (remainingCount === 0 && freshCourt?.status === 'published') {
        throw new ConflictException(
          'Cannot delete the last image of a published court — unpublish it first.',
        );
      }

      await tx.courtImage.delete({ where: { id: imageId } });
      if (freshImage.isHero) {
        // Promote the lowest-sortOrder remaining image (decision 16).
        const next = await tx.courtImage.findFirst({
          where: { courtId },
          orderBy: { sortOrder: 'asc' },
        });
        if (next) {
          await tx.courtImage.update({ where: { id: next.id }, data: { isHero: true } });
        }
      }
    });

    // Best-effort storage cleanup AFTER the DB commit — the DB is the product's
    // source of truth for "this image is gone"; a storage-side failure (incl. a
    // misconfigured driver) must not re-surface as an error for an already-
    // committed delete. Never touches a legacy (non-driver-prefixed) url —
    // enforced inside each driver's own `delete()`.
    try {
      await this.getDriver().delete(image.url);
    } catch (err) {
      this.logger.warn(`Failed to remove stored file for deleted CourtImage ${imageId}: ${String(err)}`);
    }

    logAdminMutation({
      adminId,
      action: 'image.delete',
      targetType: 'CourtImage',
      targetId: imageId,
      changedFields: ['deleted'],
    });
  }
}
