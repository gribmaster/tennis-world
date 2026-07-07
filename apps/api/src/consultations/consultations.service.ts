import { Injectable } from '@nestjs/common';
import type { ConsultationRequestDTO } from '@tennis/contracts';
import { PrismaService } from '../prisma/prisma.service';
import type { ConsultationSubmitRequestDTO } from './consultations.dto';
import {
  consultationSelect,
  toConsultationRequestDTO,
  toCreateInput,
} from './consultations.mapper';

// ─────────────────────────────────────────────────────────────────────────────
// ConsultationsService — persists an anonymous consultation/concierge lead.
//
// This is the FIRST write path in the API (every prior endpoint is a read). It
// does exactly one thing: insert a `ConsultationRequest` row from the validated
// body, with `userId = null` (anonymous — no auth in Phase 2). It returns the
// freshly-stored row as a `ConsultationRequestDTO`.
//
// Explicitly OUT OF SCOPE (intake §8 / prompt task 8): NO CRM webhook
// (HubSpot/Pipedrive is Phase 5), NO email send, NO auth, NO rate limiting. The
// row is persisted and that is all.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ConsultationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * POST /v1/consultations — store the lead and return the created
   * `ConsultationRequestDTO`. `status`/`createdAt` come from Prisma column
   * defaults (`"new"` / `now()`); the select then reads them back for the response.
   */
  async create(
    dto: ConsultationSubmitRequestDTO,
  ): Promise<ConsultationRequestDTO> {
    const row = await this.prisma.consultationRequest.create({
      data: toCreateInput(dto),
      select: consultationSelect,
    });
    return toConsultationRequestDTO(row);
  }
}
