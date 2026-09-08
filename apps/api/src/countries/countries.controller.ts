import { Controller, Get } from '@nestjs/common';
import type { CountryDTO } from '@tennis/contracts';
import { CountriesService } from './countries.service';

// ─────────────────────────────────────────────────────────────────────────────
// Countries controller — one public, read-only discovery endpoint under the `v1`
// prefix:
//   GET /v1/countries
//
// Its own module rather than a route on the courts controller: this is an aggregate
// over the `Country` dimension, not a court read, and folding it into
// `courts.controller.ts` would put a second resource behind `/v1/courts`'s selects.
//
// No query params. The strip renders the whole (small) set; there is nothing to
// filter or page, and adding options "for later" would be speculative surface.
// ─────────────────────────────────────────────────────────────────────────────

@Controller('countries')
export class CountriesController {
  constructor(private readonly countries: CountriesService) {}

  /** GET /v1/countries */
  @Get()
  list(): Promise<CountryDTO[]> {
    return this.countries.list();
  }
}
