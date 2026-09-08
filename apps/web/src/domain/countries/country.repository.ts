// Countries domain — repository INTERFACE.
//
// The contract every country data source must satisfy (Architecture Plan Decision
// #7 / Phase 1 §1.1). UI depends ONLY on this interface; the central factory
// (`src/domain/index.ts`) decides which implementation is wired in, so the
// mock→HTTP swap is a configuration change, not a UI rewrite.
//
// Signatures are typed against `@tennis/contracts` DTOs so the data shape is defined
// exactly once and reused by both the mock and the HTTP repository.
//
// ONE read, no options. `GET /v1/countries` takes no query params: the "By Country"
// strip renders the whole (small) set, so there is nothing to filter or page and a
// `CountryListOptions` type would be speculative surface.

import type { CountryDTO } from '@tennis/contracts';

export interface CountryRepository {
  /**
   * Every country with at least one PUBLISHED court, ordered by name ascending.
   * Countries with no published court are omitted entirely.
   */
  list(): Promise<CountryDTO[]>;
}
