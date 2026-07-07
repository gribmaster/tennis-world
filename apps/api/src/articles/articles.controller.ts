import { Controller, Get, Param, Query } from '@nestjs/common';
import type { ArticleDTO } from '@tennis/contracts';
import { parseArticleListQuery } from './articles.dto';
import { ArticlesService } from './articles.service';

// ─────────────────────────────────────────────────────────────────────────────
// Articles / Journal controller — public discovery endpoints under the `v1`
// prefix:
//   GET /v1/articles
//   GET /v1/articles/:slug
//
// Both return the FULL ArticleDTO (incl. bodyRichText) — the web
// `ArticleRepository.list()` returns `ArticleDTO[]`, not summaries, and we mirror
// it for repository parity (prompt task 10). There is intentionally no
// related-articles route: the web detail page derives "More from the Journal" by
// calling `list()` and filtering page-side, so no extra endpoint is needed.
//
// No route-order hazard: there is no static sibling route under `/articles`, so the
// single dynamic `:slug` never collides (same shape as collections).
// ─────────────────────────────────────────────────────────────────────────────

@Controller('articles')
export class ArticlesController {
  constructor(private readonly articles: ArticlesService) {}

  /** GET /v1/articles?featured=&limit= — full ArticleDTOs, newest-first. */
  @Get()
  list(@Query() query: Record<string, unknown>): Promise<ArticleDTO[]> {
    return this.articles.list(parseArticleListQuery(query));
  }

  /** GET /v1/articles/:slug — 404 if no article matches. */
  @Get(':slug')
  getBySlug(@Param('slug') slug: string): Promise<ArticleDTO> {
    return this.articles.getBySlug(slug);
  }
}
