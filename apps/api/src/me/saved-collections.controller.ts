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
import type { CollectionDTO } from '@tennis/contracts';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import type { AuthContext } from '../auth/auth.types';
import { SaveCollectionRequestDTO } from './saved-collections.dto';
import { SavedCollectionsService } from './saved-collections.service';

// ─────────────────────────────────────────────────────────────────────────────
// SavedCollectionsController — the authed user's individual saved editorial
// collections (Task 42). Mirrors `SavedCourtsController` exactly:
//
//   GET    /v1/me/saved-collections               → 200 CollectionDTO[]
//   POST   /v1/me/saved-collections               → 201 CollectionDTO (save)
//   DELETE /v1/me/saved-collections/:collectionId → 200 { ok: true } (unsave)
//
// `@UseGuards(AuthGuard)` at the class level guards ALL three routes — every
// request must carry a valid session cookie OR `Authorization: Bearer <jwt>`.
// Missing/invalid/expired → 401 before the handler runs. `@CurrentUser()`
// supplies the `{ userId, email }` the guard attached; the service scopes every
// query to that `userId`.
//
// STATUS CODES (same reasoning as SavedCourtsController):
//   - POST returns 201 on BOTH a new save and an idempotent re-save.
//   - DELETE returns 200 + `{ ok: true }` (not 204), including on a repeat/
//     never-saved unsave (idempotent — see the service). No 404 on an
//     unknown/non-saved collectionId.
// ─────────────────────────────────────────────────────────────────────────────

@Controller('me/saved-collections')
@UseGuards(AuthGuard)
export class SavedCollectionsController {
  constructor(private readonly saved: SavedCollectionsService) {}

  /** GET /v1/me/saved-collections — the authed user's saved editorial collections. */
  @Get()
  list(@CurrentUser() user: AuthContext): Promise<CollectionDTO[]> {
    return this.saved.listSavedCollections(user.userId);
  }

  /** POST /v1/me/saved-collections — save a collection (idempotent). 201 + the DTO. */
  @Post()
  @HttpCode(201)
  save(
    @CurrentUser() user: AuthContext,
    @Body() body: SaveCollectionRequestDTO,
  ): Promise<CollectionDTO> {
    return this.saved.saveCollection(user.userId, body.collectionId);
  }

  /**
   * DELETE /v1/me/saved-collections/:collectionId — unsave a collection
   * (idempotent). 200 + `{ ok }`.
   */
  @Delete(':collectionId')
  @HttpCode(200)
  unsave(
    @CurrentUser() user: AuthContext,
    @Param('collectionId') collectionId: string,
  ): Promise<{ ok: true }> {
    return this.saved.unsaveCollection(user.userId, collectionId);
  }
}
