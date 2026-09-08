// Countries domain — public surface of the feature.
//
// Re-exports the interface and the mock implementation. The DTO itself stays owned
// by `@tennis/contracts` and is re-exported here only as a convenience so consumers
// have a single import site.
//
// NOTE: this barrel does NOT wire a default repository into the app. Selecting the
// active implementation (mock vs. HTTP) is the job of the central domain factory
// (`src/domain/index.ts`) and `lib/repositories.ts`. Pages/components must import the
// repository through that sanctioned boundary, never construct the mock directly.

export type { CountryRepository } from './country.repository';
export { MockCountryRepository } from './mock-country.repository';

// Convenience re-export of the DTO this feature's method speaks in.
export type { CountryDTO } from '@tennis/contracts';
