import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import type { SupabaseStorageSettings } from './admin-image-storage.config';

// ─────────────────────────────────────────────────────────────────────────────
// Two-driver court image storage abstraction (TASK_73, decision 14). Both
// drivers implement the SAME tiny interface so `AdminImagesService` never
// branches on which one is active.
// ─────────────────────────────────────────────────────────────────────────────

export interface UploadImageInput {
  courtId: string;
  /** `<random uuid>.<sniffed ext>` — NEVER the client's filename (decision 15). */
  objectName: string;
  bytes: Buffer;
  contentType: string;
}

export interface ImageStorageDriver {
  upload(input: UploadImageInput): Promise<{ url: string }>;
  /**
   * Delete by the STORED url. MUST be a no-op (resolve normally, touch
   * nothing) for a url that does not carry this driver's own prefix — legacy
   * `/courts/<slug>/…` and `/placeholders/…` urls are never touched by any
   * driver (decision 14's "legacy images are never touched by delete").
   */
  delete(url: string): Promise<void>;
}

// ── local (dev/CI) driver ────────────────────────────────────────────────────

/**
 * Writes to `apps/web/public/uploads/courts/<courtId>/<file>`, stores the
 * root-relative url `/uploads/courts/<courtId>/<file>`. From this file's
 * compiled location (`apps/api/dist/admin/images/`, mirroring
 * `apps/api/src/admin/images/` — `rootDir`/`outDir` are both one level under
 * `apps/api`), four `..` reaches the `apps/` directory.
 */
const WEB_PUBLIC_UPLOADS_COURTS_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'web',
  'public',
  'uploads',
  'courts',
);

const LOCAL_URL_PREFIX = '/uploads/courts/';

export class LocalImageStorageDriver implements ImageStorageDriver {
  async upload(input: UploadImageInput): Promise<{ url: string }> {
    const dir = path.join(WEB_PUBLIC_UPLOADS_COURTS_DIR, input.courtId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, input.objectName), input.bytes);
    return { url: `${LOCAL_URL_PREFIX}${input.courtId}/${input.objectName}` };
  }

  async delete(url: string): Promise<void> {
    if (!url.startsWith(LOCAL_URL_PREFIX)) return; // not ours — leave the file alone
    const relative = url.slice(LOCAL_URL_PREFIX.length);
    const filePath = path.join(WEB_PUBLIC_UPLOADS_COURTS_DIR, relative);
    try {
      unlinkSync(filePath);
    } catch {
      // Already gone (or never existed) — deleting the DB row must still succeed.
    }
  }
}

// ── supabase (production) driver — plain fetch, no SDK dependency ───────────

export class SupabaseImageStorageDriver implements ImageStorageDriver {
  constructor(
    private readonly settings: SupabaseStorageSettings,
    /** Injected for the stubbed-HTTP-server test (Testing §10); defaults to the global fetch. */
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!settings.url || !settings.serviceRoleKey) {
      // Constructed only when storage is actually needed (AdminImagesService)
      // — this guard is belt-and-braces; the service checks completeness first
      // and returns a clean 503 before ever constructing this driver.
      throw new ServiceUnavailableException('Image storage is not configured.');
    }
  }

  async upload(input: UploadImageInput): Promise<{ url: string }> {
    const objectPath = `${input.courtId}/${input.objectName}`;
    let res: Response;
    try {
      res = await this.fetchImpl(
        `${this.settings.url}/storage/v1/object/${this.settings.bucket}/${objectPath}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.settings.serviceRoleKey}`,
            apikey: this.settings.serviceRoleKey,
            'Content-Type': input.contentType,
            'x-upsert': 'false',
          },
          body: input.bytes,
        },
      );
    } catch {
      throw new BadGatewayException('Image storage upload failed.');
    }
    if (!res.ok) {
      throw new BadGatewayException('Image storage upload failed.');
    }
    return {
      url: `${this.settings.url}/storage/v1/object/public/${this.settings.bucket}/${objectPath}`,
    };
  }

  async delete(url: string): Promise<void> {
    const publicPrefix = `${this.settings.url}/storage/v1/object/public/${this.settings.bucket}/`;
    if (!url.startsWith(publicPrefix)) return; // not ours — leave it alone
    const objectPath = url.slice(publicPrefix.length);
    const res = await this.fetchImpl(
      `${this.settings.url}/storage/v1/object/${this.settings.bucket}/${objectPath}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${this.settings.serviceRoleKey}`,
          apikey: this.settings.serviceRoleKey,
        },
      },
    ).catch(() => undefined);
    if (res && !res.ok && res.status !== 404) {
      throw new BadGatewayException('Image storage delete failed.');
    }
  }
}
