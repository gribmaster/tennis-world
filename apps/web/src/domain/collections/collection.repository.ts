// Collections domain — repository INTERFACE.
//
// The contract every collection data source must satisfy (Architecture Plan
// Decision #7 / Phase 1 §1.1). UI depends ONLY on this interface; a factory decides
// which implementation is wired in (mock now, HTTP in Phase 2), so the live-data
// swap is a configuration change, not a UI rewrite.
//
// Signatures are typed against `@tennis/contracts` DTOs so the data shape is defined
// exactly once and reused by both the mock and the future HTTP repository.

import type { CollectionDTO } from '@tennis/contracts';
import type { CollectionListOptions } from './collection.types';

export interface CollectionRepository {
  /** List collections, optionally filtered/capped. No options ⇒ full published set. */
  list(options?: CollectionListOptions): Promise<CollectionDTO[]>;

  /** A single collection by slug, or `null` if no collection matches. */
  getBySlug(slug: string): Promise<CollectionDTO | null>;
}
