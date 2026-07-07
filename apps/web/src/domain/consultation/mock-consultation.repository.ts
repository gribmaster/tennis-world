// Consultation domain — MOCK repository implementation.
//
// Preserves the Phase-1 consultation UX with NO network, NO backend, NO email, NO
// CRM, NO persistence: `submit()` simply echoes the payload back as a fully-shaped
// `ConsultationRequestDTO` (a fabricated id, `status: "new"`, a real `createdAt`),
// so the modal can flip to its success state exactly as before. The data is not
// stored anywhere — it is discarded once the returned promise is consumed.
//
// Used in `mock` data-source mode (and never in `api` mode, where the HTTP
// implementation hits `POST /v1/consultations`). Plain TypeScript — no React, no
// Next.js — so it stays independently testable like the other mock repositories.

import type {
  ConsultationRequestDTO,
  ConsultationSubmitDTO,
} from '@tennis/contracts';
import type { ConsultationRepository } from './consultation.repository';

export class MockConsultationRepository implements ConsultationRepository {
  async submit(
    payload: ConsultationSubmitDTO,
  ): Promise<ConsultationRequestDTO> {
    // Echo the submitted fields back wrapped in the created-resource shape. A
    // freshly-created lead is always `status: "new"` (matches the API contract).
    // `isFlexible` is defaulted to `false` to mirror the contract's
    // `z.boolean().default(false)` when the caller omits it.
    return {
      ...payload,
      isFlexible: payload.isFlexible ?? false,
      id: `mock-consultation-${Date.now()}`,
      status: 'new',
      createdAt: new Date().toISOString(),
    };
  }
}
