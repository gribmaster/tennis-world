// Consultation domain — repository INTERFACE.
//
// The contract every consultation data source must satisfy (Architecture Plan
// Decision #7). The ConsultationModal depends ONLY on this interface (through
// `repositories.consultation`); the factory decides which implementation is wired
// in — mock (in `mock` mode AND as the Phase-1-style mock UX) or HTTP (in `api`
// mode, hitting `POST /v1/consultations`). The modal UI never changes between them.
//
// Signatures are typed against `@tennis/contracts` DTOs so the request/response
// shapes are defined exactly once and reused by both implementations.

import type {
  ConsultationRequestDTO,
  ConsultationSubmitDTO,
} from '@tennis/contracts';

export interface ConsultationRepository {
  /**
   * Submit a consultation/concierge lead. Resolves to the created
   * `ConsultationRequestDTO` (the full stored shape: id, status, createdAt, plus
   * the submitted fields). Rejects on failure — the modal catches the rejection
   * and shows a non-blocking error while staying open.
   */
  submit(payload: ConsultationSubmitDTO): Promise<ConsultationRequestDTO>;
}
