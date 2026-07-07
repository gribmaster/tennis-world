// Saved domain — public surface of the feature.
//
// Re-exports the interface and the mock implementation. The DTOs themselves stay
// owned by `@tennis/contracts` and are re-exported here only as a convenience so
// consumers have a single import site.
//
// NOTE: this barrel does NOT wire a default repository into the app. Selecting the
// active implementation (mock vs. real) is the job of the central domain factory
// (`src/domain/index.ts`) and `lib/repositories.ts`. Page/components must import the
// repository through that sanctioned boundary, never construct the mock directly.

export type { SavedRepository } from './saved.repository';
export { MockSavedRepository } from './mock-saved.repository';

// Convenience re-export of the DTOs this feature's methods speak in.
export type {
  CourtSummaryDTO,
  UserCollectionDTO,
  UserCollectionWithCourtsDTO,
} from '@tennis/contracts';
