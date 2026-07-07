import { Controller, Get, Param, Query } from '@nestjs/common';
import type { CollectionDTO } from '@tennis/contracts';
import { parseCollectionListQuery } from './collections.dto';
import { CollectionsService } from './collections.service';

// ─────────────────────────────────────────────────────────────────────────────
// Collections controller — public discovery endpoints under the `v1` prefix:
//   GET /v1/collections
//   GET /v1/collections/:slug
//
// `:slug` returns CollectionDTO ONLY — courts are fetched separately via
// GET /v1/courts?collection=slug. There is intentionally no /with-courts route
// and no embedded courts (prompt task 3).
//
// No route-order hazard here: there is no static sibling route under
// `/collections`, so the single dynamic `:slug` never collides.
// ─────────────────────────────────────────────────────────────────────────────

@Controller('collections')
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  /** GET /v1/collections?featured=&limit= */
  @Get()
  list(@Query() query: Record<string, unknown>): Promise<CollectionDTO[]> {
    return this.collections.list(parseCollectionListQuery(query));
  }

  /** GET /v1/collections/:slug — 404 if no collection matches. */
  @Get(':slug')
  getBySlug(@Param('slug') slug: string): Promise<CollectionDTO> {
    return this.collections.getBySlug(slug);
  }
}
