import { Injectable, NotFoundException } from '@nestjs/common';
import type { ArticleDTO } from '@tennis/contracts';
import { PrismaService } from '../prisma/prisma.service';
import type { ArticleListQuery } from './articles.dto';
import { articleSelect, toArticleDTO } from './articles.mapper';

// ─────────────────────────────────────────────────────────────────────────────
// ArticlesService — public article reads.
//
// Behavior is a faithful server-side port of `MockArticleRepository` so the seeded
// API output matches the Phase-1 mock:
//   - list ordered by `publishedAt desc` — newest-first. The mock sorts
//     `b.publishedAt.localeCompare(a.publishedAt)` over `'YYYY-MM-DD'` strings;
//     since the seed stores those dates as DateTime, a `publishedAt: 'desc'` DB sort
//     reproduces the same order. (`{ nulls: 'last' }` is set so a null-dated article
//     would sort to the end rather than ahead of dated ones — every seeded article
//     has a date, so this is defensive only.)
//   - `featured` is accepted but does NOT narrow the set (the mock ignores it too —
//     no per-article featured flag exists in Phase-1 data).
//   - `limit` trims AFTER ordering (mock's `slice(0, limit)`).
//   - list returns the FULL ArticleDTO (incl. bodyRichText), NOT a summary — the web
//     `list()` returns `ArticleDTO[]` and we mirror it (prompt task 10).
//
// `getBySlug` returns a single ArticleDTO or 404 — there is no related-articles
// endpoint; the web detail page derives "More from the Journal" by calling
// `list()` and filtering out the current slug page-side, and we keep that pattern.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ArticlesService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /v1/articles — full ArticleDTOs, newest-first. */
  async list(query: ArticleListQuery): Promise<ArticleDTO[]> {
    const rows = await this.prisma.article.findMany({
      select: articleSelect,
      // Newest-first, matching the mock's descending sort by publishedAt. Nulls
      // sort last so a (hypothetical) undated article never leads the feed.
      orderBy: { publishedAt: { sort: 'desc', nulls: 'last' } },
      // `limit` applied after ordering (Prisma `take`), matching the mock's
      // `result.slice(0, limit)`. `featured` is intentionally NOT a filter here
      // (see header) — it is parsed only to reject malformed values.
      ...(query.limit !== undefined ? { take: query.limit } : {}),
    });

    return rows.map(toArticleDTO);
  }

  /** GET /v1/articles/:slug — single article, or 404 if none matches. */
  async getBySlug(slug: string): Promise<ArticleDTO> {
    const row = await this.prisma.article.findUnique({
      where: { slug },
      select: articleSelect,
    });
    if (!row) {
      throw new NotFoundException(`Article "${slug}" not found.`);
    }
    return toArticleDTO(row);
  }
}
