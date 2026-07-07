// Consultation domain — HTTP repository implementation (Phase 2, `api` data source).
//
// Implements the SAME `ConsultationRepository` interface as the mock, backed by
// `POST /v1/consultations`. Wired in by the factory when
// `NEXT_PUBLIC_DATA_SOURCE=api`. The submitted body is a `ConsultationSubmitDTO`
// (the contract's submit shape, validated server-side by the global
// ValidationPipe); the API returns the created `ConsultationRequestDTO` (201).
//
// This repository is called from the ConsultationModal, a CLIENT island — so the
// request runs in the browser. That is exactly why the base URL env var is
// `NEXT_PUBLIC_API_BASE_URL` (readable in the browser bundle).
//
// Response typing follows the same "type assertion, not zod" choice documented in
// the discovery HTTP repositories; the DTO TYPES come from `@tennis/contracts`.

import type {
  ConsultationRequestDTO,
  ConsultationSubmitDTO,
} from '@tennis/contracts';
import type { ConsultationRepository } from './consultation.repository';
import { postJson } from '../http/http-client';

export class HttpConsultationRepository implements ConsultationRepository {
  /** POST /v1/consultations — create the lead, return the stored DTO. */
  async submit(
    payload: ConsultationSubmitDTO,
  ): Promise<ConsultationRequestDTO> {
    return postJson<ConsultationRequestDTO>('/consultations', payload);
  }
}
