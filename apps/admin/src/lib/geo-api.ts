import type { AdminCountryCreatedDTO, AdminCountryDTO, AdminRegionCreatedDTO, Continent } from '@tennis/contracts';
import { apiFetch } from './api-client';

// ─────────────────────────────────────────────────────────────────────────────
// Countries/regions — plain helper calls (TASK_74 decision 4), not a Refine
// resource. `GET /v1/admin/countries` returns ALL countries with their
// regions; callers refresh this list after adding either.
// ─────────────────────────────────────────────────────────────────────────────

export function listCountries(): Promise<AdminCountryDTO[]> {
  return apiFetch<AdminCountryDTO[]>('/admin/countries');
}

export interface CreateCountryInput {
  name: string;
  isoCode: string;
  continent: Continent;
}

export function createCountry(input: CreateCountryInput): Promise<AdminCountryCreatedDTO> {
  return apiFetch<AdminCountryCreatedDTO>('/admin/countries', { method: 'POST', body: input });
}

export interface CreateRegionInput {
  countryId: string;
  name: string;
  lat: number;
  lng: number;
}

export function createRegion(input: CreateRegionInput): Promise<AdminRegionCreatedDTO> {
  return apiFetch<AdminRegionCreatedDTO>('/admin/regions', { method: 'POST', body: input });
}
