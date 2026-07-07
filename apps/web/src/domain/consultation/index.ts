// Consultation domain — public surface of the feature.
//
// Re-exports the interface and both implementations. The DTOs themselves stay
// owned by `@tennis/contracts` and are re-exported here only as a convenience so
// consumers have a single import site.
//
// NOTE: this barrel does NOT wire a default repository into the app. Selecting the
// active implementation (mock vs. HTTP) is the job of the central domain factory
// (`src/domain/index.ts`) and `lib/repositories.ts`. The ConsultationModal imports
// the repository through that sanctioned boundary (`repositories.consultation`),
// never constructs one directly.

export type { ConsultationRepository } from './consultation.repository';
export { MockConsultationRepository } from './mock-consultation.repository';
export { HttpConsultationRepository } from './http-consultation.repository';

// Convenience re-export of the consultation DTOs this feature's methods speak in.
export type {
  ConsultationSubmitDTO,
  ConsultationRequestDTO,
} from '@tennis/contracts';
