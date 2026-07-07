// Collections domain — feature-local supporting types.
//
// As with the courts domain, the data SHAPES (CollectionDTO, CollectionWithCourtsDTO)
// are owned by `@tennis/contracts` and are NOT redefined here — they are re-exported
// from this feature's index.ts for convenience. This file holds only the *query*
// options that describe how the repository is called.
//
// `CollectionListOptions` is deliberately aligned with the eventual discovery
// endpoint (Architecture Plan §4: `GET /v1/collections`) so the Phase-2 HTTP
// repository implements the same interface with no signature changes.

/**
 * Options accepted by `CollectionRepository.list()`. Both fields are optional; no
 * options (or an empty object) returns the full published set.
 */
export interface CollectionListOptions {
  /**
   * Restrict to "featured" collections. Phase-1 mock data has no per-collection
   * featured flag, so the mock treats every editorial collection as featurable and
   * simply honors `limit`; the field exists for interface stability with the
   * eventual API and for the Home teaser's intent ("a few collections").
   */
  featured?: boolean;
  /** Cap on the number of results (e.g. Home's teaser, limit 4). */
  limit?: number;
}
