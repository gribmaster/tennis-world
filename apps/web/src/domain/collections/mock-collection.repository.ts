// Collections domain — MOCK repository implementation.
//
// Reads the shared dataset from `@tennis/mock-data` (Architecture Plan Decision #5)
// and applies list/lookup logic IN MEMORY. This adapter owns the query logic; it
// does NOT own the dataset — that lives in `packages/mock-data` so the same data
// later seeds Postgres in Phase 2 with zero drift. (The COLLECTIONS export already
// derives each `count` from the COLLECTION_COURTS membership map, so the repository
// just selects/orders — it never recomputes counts.)
//
// Plain TypeScript only — no React, no Next.js — so it is independently unit-testable
// (Phase 1 §1.2). Wiring it into the app is the factory's job, not this file's.

import { COLLECTIONS } from '@tennis/mock-data';
import type { CollectionDTO } from '@tennis/contracts';
import type { CollectionRepository } from './collection.repository';
import type { CollectionListOptions } from './collection.types';

export class MockCollectionRepository implements CollectionRepository {
  // The dataset is already published, editorial collections; copy the array so
  // callers can't mutate the shared mock data.
  private readonly collections: CollectionDTO[] = [...COLLECTIONS];

  async list(options: CollectionListOptions = {}): Promise<CollectionDTO[]> {
    // Phase-1 mock data has no per-collection "featured" flag — every editorial
    // collection is eligible — so `featured` is accepted for interface stability
    // but does not narrow the set here. Only `limit` actually trims the result.
    let result = this.collections;
    if (options.limit !== undefined) {
      result = result.slice(0, options.limit);
    }
    return result.map((c) => ({ ...c }));
  }

  async getBySlug(slug: string): Promise<CollectionDTO | null> {
    const collection = this.collections.find((c) => c.slug === slug);
    return collection ? { ...collection } : null;
  }
}
