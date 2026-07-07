import { Body, Controller, Post } from '@nestjs/common';
import type { ConsultationRequestDTO } from '@tennis/contracts';
import { ConsultationSubmitRequestDTO } from './consultations.dto';
import { ConsultationsService } from './consultations.service';

// ─────────────────────────────────────────────────────────────────────────────
// Consultations controller — the API's first request-BODY endpoint:
//   POST /v1/consultations
//
// The body is validated by the global `ValidationPipe` (main.ts) against the
// class-validator decorators on `ConsultationSubmitRequestDTO`:
//   - invalid/missing `email`, missing `destinationInterest`, a wrong-typed
//     optional, or a bad enum value → 400.
//   - an UNKNOWN field → 400 (forbidNonWhitelisted).
// A valid body is persisted (anonymous, `userId` null) and the created row is
// returned. Nest's default success status for `@Post()` is 201, which is exactly
// the contract for a created resource — no `@HttpCode` override needed.
//
// Note `ConsultationSubmitRequestDTO` is imported as a VALUE (not type-only): the
// pipe needs the class at runtime to read its validation metadata. This is fine —
// the class is defined locally in apps/api, unlike the @tennis/contracts zod
// objects which can't be runtime-required ([[api-contracts-type-only-import]]).
// ─────────────────────────────────────────────────────────────────────────────

@Controller('consultations')
export class ConsultationsController {
  constructor(private readonly consultations: ConsultationsService) {}

  /** POST /v1/consultations — store an anonymous lead, 201 with the created DTO. */
  @Post()
  create(
    @Body() body: ConsultationSubmitRequestDTO,
  ): Promise<ConsultationRequestDTO> {
    return this.consultations.create(body);
  }
}
