import { Prisma } from '@prisma/client';
import type { ArticleDTO } from '@tennis/contracts';

// ─────────────────────────────────────────────────────────────────────────────
// Article mapper + Prisma select (prompt task 4).
//
// `list()` and `getBySlug()` both return the FULL ArticleDTO (including
// `bodyRichText`) — the web `ArticleRepository.list()` returns `ArticleDTO[]`,
// NOT `ArticleSummaryDTO[]`, and the journal list page + "More from the Journal"
// both consume the full shape. We mirror that for repository parity (prompt task
// 10): one select, one mapper, no summary variant.
//
// Type-only @tennis/contracts import (ArticleDTO): the API runs as plain Node and
// @tennis/contracts' `main` points at TS source, so its runtime (zod) objects
// can't be `require`d — but the *types* are erased at build time and give us the
// single-source-of-truth shape. Same pattern as courts/collections mappers.
//
// NULLABLE-COLUMN NOTES (schema vs. DTO):
//   - `heroImageUrl` is `String?` in the schema but the DTO requires a string —
//     coalesce a missing value to `''` (same defensive idiom as the collection
//     cover-url mapper) rather than widen the DTO. Every seeded article authors one.
//   - `subtitle` is optional on the wire — omit the key entirely when null
//     (mirrors the court `alt` / collection `description` handling).
//   - `publishedAt` is `DateTime?` in the schema but the DTO requires an ISO
//     string. Every seeded article authors a date, so the column is populated; a
//     null is coalesced to `''` so the mapper stays total and the DTO shape holds.
//
// AUTHOR PARITY (closed in Feature 44): the mock `ARTICLES` author a byline
// (`author: 'Janet See'`) and `ArticleDTO.author` is optional. The Feature-40 schema
// originally had NO `Article.author` column (Feature 43's documented parity gap);
// Feature 44 added it via the `add_article_author` forward migration, the seed now
// writes it, and the mapper emits it below (omitted when null). The seeded API now
// reproduces the mock's byline.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Public article read. Selects exactly the ArticleDTO scalar fields, including the
 * optional `author` byline (Feature 44). No relations are pulled, so no Prisma
 * internals can leak.
 */
export const articleSelect = {
  id: true,
  slug: true,
  title: true,
  subtitle: true,
  category: true,
  bodyRichText: true,
  heroImageUrl: true,
  readTimeMinutes: true,
  publishedAt: true,
  author: true,
} satisfies Prisma.ArticleSelect;

/** Row payload derived from the select above. */
export type ArticleRow = Prisma.ArticleGetPayload<{ select: typeof articleSelect }>;

/**
 * Serialize the `Article.publishedAt` DateTime to the date-only `YYYY-MM-DD` string
 * the contract declares as the wire format. A null column (no published date) maps
 * to `''` so the mapper stays total; every seeded article authors a date so this
 * branch is not hit in practice.
 *
 * BYTE-PARITY (Feature 47): the mock `ARTICLES` store `publishedAt` as `'YYYY-MM-DD'`
 * date-only strings, and the dual-mode parity harness deep-equals the mock DTO
 * against this API DTO. The seed parses each mock date via `new Date('YYYY-MM-DD')`
 * → UTC midnight, so `Date.prototype.toISOString()` would yield
 * `YYYY-MM-DDT00:00:00.000Z` — a valid ISO-8601 string but NOT byte-identical to the
 * mock. We therefore take the date portion (`.slice(0, 10)` of the UTC ISO string)
 * to reproduce the mock's exact value. This is the documented fix the harness
 * demanded (the previous comment flagged it). `slice(0, 10)` of `toISOString()` is
 * timezone-safe: `toISOString()` is always UTC, so the date never shifts. The UI
 * (`new Date(iso).toLocaleDateString(...)`) parses the date-only form to the same
 * instant it parsed the full timestamp, so there is NO rendering change.
 */
function toIsoString(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : '';
}

/**
 * Flatten a Prisma article row into an ArticleDTO (full shape, incl. bodyRichText).
 *
 *  - `subtitle`     ← optional on the wire — omitted when null.
 *  - `heroImageUrl` ← coalesced to `''` when null (DTO requires a string).
 *  - `publishedAt`  ← DateTime serialized to a deterministic ISO-8601 string.
 *  - `author`       ← optional on the wire — omitted when null (Feature 44 added
 *                     the `Article.author` column; seeded as 'Janet See').
 */
export function toArticleDTO(row: ArticleRow): ArticleDTO {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    ...(row.subtitle !== null ? { subtitle: row.subtitle } : {}),
    category: row.category,
    bodyRichText: row.bodyRichText,
    heroImageUrl: row.heroImageUrl ?? '',
    readTimeMinutes: row.readTimeMinutes,
    publishedAt: toIsoString(row.publishedAt),
    // Optional byline — omit the key entirely when null (mirrors `subtitle`).
    ...(row.author !== null ? { author: row.author } : {}),
  };
}
