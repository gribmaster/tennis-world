// Countries domain — HTTP repository implementation (`api` data source).
//
// Implements the SAME `CountryRepository` interface as `MockCountryRepository`,
// backed by the public API. Wired in by the factory when
// `NEXT_PUBLIC_DATA_SOURCE=api`; the UI is unchanged.
//
// The endpoint takes no query params — the aggregate is the whole (small) set — so
// there is no `buildQuery` here.
//
// Response typing follows the same "type assertion, not zod" choice documented in
// http-court.repository.ts: the API is the source of truth and validates
// server-side; the DTO TYPES still come from `@tennis/contracts`.

import type { CountryDTO } from '@tennis/contracts';
import type { CountryRepository } from '../countries/country.repository';
import { getJson } from './http-client';

export class HttpCountryRepository implements CountryRepository {
  /** GET /v1/countries */
  async list(): Promise<CountryDTO[]> {
    return getJson<CountryDTO[]>('/countries');
  }
}
