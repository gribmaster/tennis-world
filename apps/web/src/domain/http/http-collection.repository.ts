// Collections domain — HTTP repository implementation (Phase 2, `api` data source).
//
// Implements the SAME `CollectionRepository` interface as
// `MockCollectionRepository`, backed by the public API. Wired in by the factory
// when `NEXT_PUBLIC_DATA_SOURCE=api`; the UI is unchanged.
//
// IMPORTANT (prompt task 3): `getBySlug` returns a `CollectionDTO` ONLY — there is
// intentionally no embedded `courts` array and no `/with-courts` route. The
// collection detail page fetches member courts SEPARATELY via
// `courts.list({ collection: slug })`, exactly as it does against the mock.
//
// Response typing follows the same "type assertion, not zod" choice documented in
// http-court.repository.ts: the API is the source of truth and validates
// server-side; the DTO TYPES still come from `@tennis/contracts`.

import type { CollectionDTO } from '@tennis/contracts';
import type { CollectionRepository } from '../collections/collection.repository';
import type { CollectionListOptions } from '../collections/collection.types';
import { buildQuery, getJson, getJsonOrNull } from './http-client';

export class HttpCollectionRepository implements CollectionRepository {
  /** GET /v1/collections?featured=&limit= */
  async list(options: CollectionListOptions = {}): Promise<CollectionDTO[]> {
    const query = buildQuery({
      featured: options.featured,
      limit: options.limit,
    });
    return getJson<CollectionDTO[]>(`/collections${query}`);
  }

  /** GET /v1/collections/:slug — CollectionDTO only; 404 maps to `null`. */
  async getBySlug(slug: string): Promise<CollectionDTO | null> {
    return getJsonOrNull<CollectionDTO>(
      `/collections/${encodeURIComponent(slug)}`,
    );
  }
}
