import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { Request } from 'express';
// Side-effect type-only import: pulls in @types/multer's `declare global
// Express.Multer.File` augmentation. Required because this project's
// tsconfig restricts automatic ambient-type inclusion to `types: ["node"]`
// (see tsconfig.json) — without this, `Express.Multer.File` below doesn't
// resolve. NOT a runtime dependency on the `multer` package (TASK_73's "no
// new dependency" rule) — this is a type-only import, erased at build time.
import type {} from 'multer';
import type { AdminCourtImageDTO } from '@tennis/contracts';
import { AdminOnly } from '../auth/admin-roles.guard';
import type { RequestWithAdmin } from '../auth/admin-auth.types';
import { AdminImagesService } from './admin-images.service';
import { AdminImageUploadRateLimitService } from './admin-image-upload-rate-limit.service';
import { PatchImageRequestDTO, ReorderImagesRequestDTO, UploadImageFieldsDTO } from './admin-images.dto';

// ─────────────────────────────────────────────────────────────────────────────
// AdminImagesController (TASK_73, decisions 14–17):
//   POST   /v1/admin/courts/:courtId/images         → 201 (multipart, field `file`)
//   PATCH  /v1/admin/courts/:courtId/images/:imageId → 200 ({ alt?, isHero? })
//   PUT    /v1/admin/courts/:courtId/images/order    → 200 ({ imageIds })
//   DELETE /v1/admin/courts/:courtId/images/:imageId → 204
//
// The 8 MB size cap is enforced by `FileInterceptor`'s multer `limits` option;
// NestJS's own multer-error translation (`@nestjs/platform-express`) already
// converts an exceeded `LIMIT_FILE_SIZE` into `PayloadTooLargeException` (413)
// and an unexpected second file field into `BadRequestException` (400) — no
// custom exception filter needed here.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

@Controller('admin/courts/:courtId/images')
@AdminOnly('admin')
export class AdminImagesController {
  constructor(
    private readonly images: AdminImagesService,
    private readonly rateLimit: AdminImageUploadRateLimitService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async upload(
    @Param('courtId') courtId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() fields: UploadImageFieldsDTO,
    @Req() req: Request & RequestWithAdmin,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminCourtImageDTO> {
    const adminId = req.admin!.adminId;

    const limit = this.rateLimit.hit(adminId);
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSeconds));
      throw new HttpException('Too many image uploads. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }

    if (!file) {
      throw new BadRequestException('A "file" field with exactly one image is required.');
    }

    return this.images.upload(courtId, file, fields.alt, adminId);
  }

  @Patch(':imageId')
  patch(
    @Param('courtId') courtId: string,
    @Param('imageId') imageId: string,
    @Body() body: PatchImageRequestDTO,
    @Req() req: Request & RequestWithAdmin,
  ): Promise<AdminCourtImageDTO> {
    return this.images.patch(courtId, imageId, body, req.admin!.adminId);
  }

  @Put('order')
  @HttpCode(200)
  async reorder(
    @Param('courtId') courtId: string,
    @Body() body: ReorderImagesRequestDTO,
    @Req() req: Request & RequestWithAdmin,
  ): Promise<{ ok: true }> {
    await this.images.reorder(courtId, body.imageIds, req.admin!.adminId);
    return { ok: true };
  }

  @Delete(':imageId')
  @HttpCode(204)
  async delete(
    @Param('courtId') courtId: string,
    @Param('imageId') imageId: string,
    @Req() req: Request & RequestWithAdmin,
  ): Promise<void> {
    await this.images.delete(courtId, imageId, req.admin!.adminId);
  }
}
