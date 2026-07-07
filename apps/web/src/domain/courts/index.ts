// Courts domain — public surface of the feature.
//
// Re-exports the interface, the feature-local query types, and the mock
// implementation. The DTOs themselves stay owned by `@tennis/contracts` and are
// re-exported here only as a convenience so consumers of the courts feature have a
// single import site for "everything courts."
//
// NOTE: this barrel does NOT wire a default repository into the app. Selecting the
// active implementation (mock vs. HTTP) is the job of the central domain factory
// (`src/domain/index.ts`) and `lib/repositories.ts`, which are built in a later
// Phase-1 feature. Page/components must import the repository through that
// sanctioned boundary, never construct MockCourtRepository directly.

export type { CourtRepository } from './court.repository';
export type { BBox, CourtFilter } from './court.types';
export { MockCourtRepository } from './mock-court.repository';

// Convenience re-export of the court DTOs that this feature's methods speak in.
export type {
  CourtDTO,
  CourtSummaryDTO,
  CourtImageDTO,
  MapPinDTO,
  MapCoords,
} from '@tennis/contracts';
