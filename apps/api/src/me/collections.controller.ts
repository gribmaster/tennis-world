import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type {
  UserCollectionDTO,
  UserCollectionWithCourtsDTO,
} from '@tennis/contracts';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import type { AuthContext } from '../auth/auth.types';
import {
  AddCourtRequestDTO,
  CreateUserCollectionRequestDTO,
  RenameUserCollectionRequestDTO,
} from './collections.dto';
import { CollectionsService } from './collections.service';

// ─────────────────────────────────────────────────────────────────────────────
// CollectionsController — the authed user's wishlist folders (Feature 55):
//
//   GET    /v1/me/collections                       → 200 UserCollectionDTO[]
//   POST   /v1/me/collections                       → 201 UserCollectionDTO
//   GET    /v1/me/collections/:slug                 → 200 UserCollectionWithCourtsDTO
//   PATCH  /v1/me/collections/:id                   → 200 UserCollectionDTO (rename)
//   POST   /v1/me/collections/:id/courts            → 200 UserCollectionWithCourtsDTO (add)
//   DELETE /v1/me/collections/:id/courts/:courtId   → 200 UserCollectionWithCourtsDTO (remove)
//   GET    /v1/me/courts/:courtId/collection-ids    → 200 string[]
//
// ROUTE-KEY CHOICE (prompt task 2): detail reads use the SLUG (the web routes a folder
// at `/saved/collections/[slug]`, and `getUserCollectionBySlug` is slug-keyed); all
// MUTATIONS use the ID (`UserCollectionDTO.id` is the stable mutation key — a rename
// changes the slug, so the slug can't key a mutation). The `:slug` GET and the `:id`
// PATCH never collide: GET …/collections/:slug and PATCH …/collections/:id are
// different methods on the same path template. The narrow per-court membership read
// lives under `me/courts/:courtId/collection-ids` (a distinct base from
// `me/collections`) so it reads as "this court's collection ids" — it backs
// `getCollectionIdsForCourt`.
//
// `@UseGuards(AuthGuard)` at the class level guards EVERY route — each request needs a
// valid session cookie OR `Authorization: Bearer <jwt>`. `@CurrentUser()` supplies the
// `{ userId }` the service scopes all queries to (a user only ever touches their OWN
// folders; another user's id/slug → 404, never 403).
//
// ADD/REMOVE return the updated `UserCollectionWithCourtsDTO` (prompt tasks 10/11 —
// preferred over `{ ok: true }`: the caller gets the fresh count/covers/members to
// refresh local state without a second round-trip). Both are idempotent (composite PK).
// ─────────────────────────────────────────────────────────────────────────────

@Controller('me')
@UseGuards(AuthGuard)
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  /** GET /v1/me/collections — the authed user's folders (count + covers derived). */
  @Get('collections')
  list(@CurrentUser() user: AuthContext): Promise<UserCollectionDTO[]> {
    return this.collections.listCollections(user.userId);
  }

  /** POST /v1/me/collections — create an empty folder. 201 + the created folder. */
  @Post('collections')
  @HttpCode(201)
  create(
    @CurrentUser() user: AuthContext,
    @Body() body: CreateUserCollectionRequestDTO,
  ): Promise<UserCollectionDTO> {
    return this.collections.createCollection(user.userId, body.name);
  }

  /** GET /v1/me/collections/:slug — one folder + its members. 404 if not the user's. */
  @Get('collections/:slug')
  getBySlug(
    @CurrentUser() user: AuthContext,
    @Param('slug') slug: string,
  ): Promise<UserCollectionWithCourtsDTO> {
    return this.collections.getCollectionBySlug(user.userId, slug);
  }

  /** PATCH /v1/me/collections/:id — rename a folder (re-derives slug). 404 if not the user's. */
  @Patch('collections/:id')
  rename(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() body: RenameUserCollectionRequestDTO,
  ): Promise<UserCollectionDTO> {
    return this.collections.renameCollection(user.userId, id, body.name);
  }

  /** POST /v1/me/collections/:id/courts — add a court (idempotent). 200 + updated folder. */
  @Post('collections/:id/courts')
  @HttpCode(200)
  addCourt(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Body() body: AddCourtRequestDTO,
  ): Promise<UserCollectionWithCourtsDTO> {
    return this.collections.addCourt(user.userId, id, body.courtId);
  }

  /** DELETE /v1/me/collections/:id/courts/:courtId — remove a court (idempotent). 200 + updated folder. */
  @Delete('collections/:id/courts/:courtId')
  @HttpCode(200)
  removeCourt(
    @CurrentUser() user: AuthContext,
    @Param('id') id: string,
    @Param('courtId') courtId: string,
  ): Promise<UserCollectionWithCourtsDTO> {
    return this.collections.removeCourt(user.userId, id, courtId);
  }

  /** GET /v1/me/courts/:courtId/collection-ids — ids of the user's folders holding this court. */
  @Get('courts/:courtId/collection-ids')
  collectionIdsForCourt(
    @CurrentUser() user: AuthContext,
    @Param('courtId') courtId: string,
  ): Promise<string[]> {
    return this.collections.getCollectionIdsForCourt(user.userId, courtId);
  }
}
