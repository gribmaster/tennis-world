// Journal domain — repository INTERFACE.
//
// The contract every article data source must satisfy (Architecture Plan Decision #7
// / Phase 1 §1.1). UI depends ONLY on this interface; a factory decides which
// implementation is wired in (mock now, HTTP in Phase 2), so the live-data swap is a
// configuration change, not a UI rewrite.
//
// Signatures are typed against `@tennis/contracts` DTOs so the data shape is defined
// exactly once and reused by both the mock and the future HTTP repository.

import type { ArticleDTO } from '@tennis/contracts';
import type { ArticleListOptions } from './article.types';

export interface ArticleRepository {
  /** List articles, optionally filtered/capped. No options ⇒ full published set. */
  list(options?: ArticleListOptions): Promise<ArticleDTO[]>;

  /** A single article by slug, or `null` if no article matches. */
  getBySlug(slug: string): Promise<ArticleDTO | null>;
}
