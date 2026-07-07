import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import type { CourtDTO, CourtSummaryDTO, MapPinDTO } from '@tennis/contracts';
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
// ─────────────────────────────────────────────────────────────────────────────

@Controller('courts')
export class CourtsController {
  constructor(private readonly courts: CourtsService) {}

  /** GET /v1/courts?country=&region=&collection=&surface=&access=&indoorOutdoor=&scenic=&featured=&q=&limit= */
  @Get()
  list(@Query() query: Record<string, unknown>): Promise<CourtSummaryDTO[]> {
    return this.courts.list(parseCourtListQuery(query));
  }

  /** GET /v1/courts/map — declared before `:slug` so it is not swallowed by it. */
  @Get('map')
  getMapPins(): Promise<MapPinDTO[]> {
    return this.courts.getMapPins();
  }

  /** GET /v1/courts/:slug/related?limit=4 */
  @Get(':slug/related')
  getRelated(
    @Param('slug') slug: string,
    @Query('limit', new DefaultValuePipe(4), ParseIntPipe) limit: number,
  ): Promise<CourtSummaryDTO[]> {
    return this.courts.getRelated(slug, limit);
  }

  /** GET /v1/courts/:slug — 404 if no published court matches. */
  @Get(':slug')
  getBySlug(@Param('slug') slug: string): Promise<CourtDTO> {
    return this.courts.getBySlug(slug);
  }
}
