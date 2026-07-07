// Journal domain — MOCK repository implementation.
//
// Reads the shared dataset from `@tennis/mock-data` (Architecture Plan Decision #5)
// and applies list/lookup logic IN MEMORY. This adapter owns the query logic; it
// does NOT own the dataset — that lives in `packages/mock-data` so the same data
// later seeds Postgres in Phase 2 with zero drift.
//
// Plain TypeScript only — no React, no Next.js — so it is independently unit-testable
// (Phase 1 §1.2). Wiring it into the app is the factory's job, not this file's.

import { ARTICLES } from '@tennis/mock-data';
import type { ArticleDTO } from '@tennis/contracts';
import type { ArticleRepository } from './article.repository';
import type { ArticleListOptions } from './article.types';

export class MockArticleRepository implements ArticleRepository {
  // Newest first (the teaser/list want the latest). Copy the array so callers can't
  // mutate the shared mock data.
  private readonly articles: ArticleDTO[] = [...ARTICLES].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  );

  async list(options: ArticleListOptions = {}): Promise<ArticleDTO[]> {
    // Phase-1 mock data has no per-article "featured" flag — every published article
    // is eligible — so `featured` is accepted for interface stability but does not
    // narrow the set here. Only `limit` actually trims the result.
    let result = this.articles;
    if (options.limit !== undefined) {
      result = result.slice(0, options.limit);
    }
    return result.map((a) => ({ ...a }));
  }

  async getBySlug(slug: string): Promise<ArticleDTO | null> {
    const article = this.articles.find((a) => a.slug === slug);
    return article ? { ...article } : null;
  }
}
