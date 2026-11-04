import {
  Controller,
  DefaultValuePipe,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { CourtDTO, CourtSummaryDTO, MapPinDTO } from '@tennis/contracts';
import { CurrentUser } from '../auth/auth.guard';
import { OptionalAuthGuard } from '../auth/optional-auth.guard';
import type { AuthContext } from '../auth/auth.types';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { parseCourtListQuery } from './courts.dto';
import { CourtsService } from './courts.service';

// ─────────────────────────────────────────────────────────────────────────────
// Courts controller — public discovery endpoints under the `v1` global prefix:
//   GET /v1/courts
//   GET /v1/courts/map
//   GET /v1/courts/:slug
//   GET /v1/courts/:slug/related
//
// ROUTE ORDER (prompt task 2): the static `map` route is declared BEFORE the
// dynamic `:slug` route so a request to `/v1/courts/map` is not captured by
// `:slug`. `:slug/related` is a distinct two-segment path and never collides with
// the single-segment `:slug`. Keeping the literal route first is the safe Nest
// idiom regardless.
//
// VIEWER-AWARE REDACTION (TASK_72): every route here carries `OptionalAuthGuard`
// (never 401s — see that guard's header) so `@CurrentUser()` resolves to the real
// signed-in viewer when one is present, `undefined` for a guest/invalid/expired
// token. `viewerEntitled` is derived ONCE per request via `EntitlementsService` —
// the SAME single gate every other entitlement check in this codebase uses — and
// forwarded to the service, which forwards it to the mapper's `redactCourtGeo`.
// `Cache-Control`/`Vary` are set because the response now depends on the viewer:
// no shared/CDN cache may serve a member's response to a guest or vice versa.
// ─────────────────────────────────────────────────────────────────────────────

const PRIVATE_NO_STORE = 'private, no-store';
const VARY_BY_VIEWER = 'Cookie, Authorization';

@Controller('courts')
@UseGuards(OptionalAuthGuard)
export class CourtsController {
  constructor(
    private readonly courts: CourtsService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /** Resolves the real per-viewer entitlement for the optional-viewer guard's result. */
  private viewerEntitled(user: AuthContext | undefined): Promise<boolean> {
    return user ? this.entitlements.isEntitled(user.userId) : Promise.resolve(false);
  }

  /** GET /v1/courts?country=&region=&collection=&surface=&access=&indoorOutdoor=&scenic=&featured=&tags=&q=&limit= */
  @Get()
  @Header('Cache-Control', PRIVATE_NO_STORE)
  @Header('Vary', VARY_BY_VIEWER)
  async list(
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: AuthContext | undefined,
  ): Promise<CourtSummaryDTO[]> {
    return this.courts.list(parseCourtListQuery(query), await this.viewerEntitled(user));
  }

  /** GET /v1/courts/map — declared before `:slug` so it is not swallowed by it. */
  @Get('map')
  @Header('Cache-Control', PRIVATE_NO_STORE)
  @Header('Vary', VARY_BY_VIEWER)
  async getMapPins(@CurrentUser() user: AuthContext | undefined): Promise<MapPinDTO[]> {
    return this.courts.getMapPins(await this.viewerEntitled(user));
  }

  /** GET /v1/courts/:slug/related?limit=4 */
  @Get(':slug/related')
  @Header('Cache-Control', PRIVATE_NO_STORE)
  @Header('Vary', VARY_BY_VIEWER)
  async getRelated(
    @Param('slug') slug: string,
    @Query('limit', new DefaultValuePipe(4), ParseIntPipe) limit: number,
    @CurrentUser() user: AuthContext | undefined,
  ): Promise<CourtSummaryDTO[]> {
    return this.courts.getRelated(slug, await this.viewerEntitled(user), limit);
  }

  /** GET /v1/courts/:slug — 404 if no published court matches. */
  @Get(':slug')
  @Header('Cache-Control', PRIVATE_NO_STORE)
  @Header('Vary', VARY_BY_VIEWER)
  async getBySlug(
    @Param('slug') slug: string,
    @CurrentUser() user: AuthContext | undefined,
  ): Promise<CourtDTO> {
    return this.courts.getBySlug(slug, await this.viewerEntitled(user));
  }
}
