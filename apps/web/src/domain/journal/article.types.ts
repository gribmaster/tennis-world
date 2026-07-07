// Journal domain — feature-local supporting types.
//
// As with courts/collections, the data SHAPES (ArticleDTO, ArticleSummaryDTO) are
// owned by `@tennis/contracts` and are NOT redefined here — they are re-exported
// from this feature's index.ts for convenience. This file holds only the *query*
// options that describe how the repository is called.
//
// `ArticleListOptions` is deliberately aligned with the eventual discovery endpoint
// (Architecture Plan §4: `GET /v1/articles`) so the Phase-2 HTTP repository
// implements the same interface with no signature changes.

/**
 * Options accepted by `ArticleRepository.list()`. Both fields are optional; no
 * options (or an empty object) returns the full published set.
 */
export interface ArticleListOptions {
  /**
   * Restrict to "featured" articles. Phase-1 mock data has no per-article featured
   * flag, so the mock treats every published article as featurable and simply
   * honors `limit`; the field exists for interface stability with the eventual API
   * and for the Home teaser's intent ("a few of the latest").
   */
  featured?: boolean;
  /** Cap on the number of results (e.g. Home's teaser, limit 3). */
  limit?: number;
}
