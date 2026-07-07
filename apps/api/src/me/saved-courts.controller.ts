import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { CourtSummaryDTO } from '@tennis/contracts';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import type { AuthContext } from '../auth/auth.types';
import { SaveCourtRequestDTO } from './saved-courts.dto';
import { SavedCourtsService } from './saved-courts.service';

// ─────────────────────────────────────────────────────────────────────────────
// SavedCourtsController — the authed user's individual saved courts (Feature 54):
//
//   GET    /v1/me/saved-courts           → 200 CourtSummaryDTO[] (the user's saves)
//   POST   /v1/me/saved-courts           → 201 CourtSummaryDTO   (save a court)
//   DELETE /v1/me/saved-courts/:courtId  → 200 { ok: true }      (unsave a court)
//
// `@UseGuards(AuthGuard)` at the class level guards ALL three routes — every request
// must carry a valid session cookie OR `Authorization: Bearer <jwt>` (the guard's two
// extractors). Missing/invalid/expired → 401 before the handler runs. `@CurrentUser()`
// supplies the `{ userId, email }` the guard attached; the service scopes every query
// to that `userId` (a user only touches their OWN saved courts — Feature 50 §9).
//
// STATUS CODES (prompt tasks 5/6 — documented choices):
//   - POST returns 201 on BOTH a new save and an idempotent re-save. The result is
//     "this court is now in your saved list" either way; distinguishing 200-vs-201 on
//     re-save would leak whether the row already existed and complicates the simple
//     "ensure saved → here's the summary" contract. So: always 201 + the summary.
//   - DELETE returns 200 + `{ ok: true }` (not 204) so the body matches the web
//     `SavedRepository` ergonomics and stays consistent on a repeat/never-saved unsave
//     (idempotent — see the service). No 404 on an unknown/non-saved courtId.
// ─────────────────────────────────────────────────────────────────────────────

@Controller('me/saved-courts')
@UseGuards(AuthGuard)
export class SavedCourtsController {
  constructor(private readonly saved: SavedCourtsService) {}

  /** GET /v1/me/saved-courts — the authed user's saved courts (public summaries). */
  @Get()
  list(@CurrentUser() user: AuthContext): Promise<CourtSummaryDTO[]> {
    return this.saved.listSavedCourts(user.userId);
  }

  /** POST /v1/me/saved-courts — save a court (idempotent). 201 + the court summary. */
  @Post()
  @HttpCode(201)
  save(
    @CurrentUser() user: AuthContext,
    @Body() body: SaveCourtRequestDTO,
  ): Promise<CourtSummaryDTO> {
    return this.saved.saveCourt(user.userId, body.courtId);
  }

  /**
   * DELETE /v1/me/saved-courts/:courtId — unsave a court (idempotent). 200 + `{ ok }`.
   */
  @Delete(':courtId')
  @HttpCode(200)
  unsave(
    @CurrentUser() user: AuthContext,
    @Param('courtId') courtId: string,
  ): Promise<{ ok: true }> {
    return this.saved.unsaveCourt(user.userId, courtId);
  }
}
