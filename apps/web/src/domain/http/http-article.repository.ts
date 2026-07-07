// Journal domain — HTTP repository implementation (Phase 2, `api` data source).
//
// Implements the SAME `ArticleRepository` interface as `MockArticleRepository`,
// backed by the public API. Wired in by the factory when
// `NEXT_PUBLIC_DATA_SOURCE=api`; the UI is unchanged.
//
// IMPORTANT (prompt task 4):
//   - `list()` returns FULL `ArticleDTO[]` (incl. bodyRichText), not summaries —
//     the API mirrors the mock for repository parity.
//   - `author` is present from the API (Feature 44 added the column + byline).
//   - `publishedAt` comes as a date-only `YYYY-MM-DD` string (the API mapper slices
//     the stored UTC timestamp to the date — Feature 47 byte parity with the mock).
//     The UI parses it the same way; no UI/formatting change is needed here.
//   - There is no related-articles endpoint: the article detail page derives "More
//     from the Journal" by calling `list()` and filtering page-side.
//
// Response typing follows the same "type assertion, not zod" choice documented in
// http-court.repository.ts; the DTO TYPES still come from `@tennis/contracts`.

import type { ArticleDTO } from '@tennis/contracts';
import type { ArticleRepository } from '../journal/article.repository';
import type { ArticleListOptions } from '../journal/article.types';
import { buildQuery, getJson, getJsonOrNull } from './http-client';

export class HttpArticleRepository implements ArticleRepository {
  /** GET /v1/articles?featured=&limit= — full ArticleDTOs, newest-first. */
  async list(options: ArticleListOptions = {}): Promise<ArticleDTO[]> {
    const query = buildQuery({
      featured: options.featured,
      limit: options.limit,
    });
    return getJson<ArticleDTO[]>(`/articles${query}`);
  }

  /** GET /v1/articles/:slug — full ArticleDTO; 404 maps to `null`. */
  async getBySlug(slug: string): Promise<ArticleDTO | null> {
    return getJsonOrNull<ArticleDTO>(`/articles/${encodeURIComponent(slug)}`);
  }
}
