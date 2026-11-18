import type { BaseRecord, DataProvider } from '@refinedev/core';
import type { AdminCourtDetailDTO, AdminCourtListResponseDTO } from '@tennis/contracts';
import { apiFetch, API_BASE_URL } from './api-client';

// ─────────────────────────────────────────────────────────────────────────────
// dataProvider (TASK_74 decision 4) — a small CUSTOM provider, not
// `@refinedev/simple-rest`: the API returns `{ items, page, pageSize, total }`
// (not `{ data, total }`-shaped the generic adapter expects), writes use
// `PATCH`, and sub-resources (images) use their own endpoints entirely.
//
// Only the `courts` resource goes through this. Countries/regions/images are
// plain helper calls (`geo-api.ts` / `images-api.ts`) that bypass Refine's
// resource system entirely — there is nothing generic about "add a region".
// ─────────────────────────────────────────────────────────────────────────────

function courtsOnly(resource: string): void {
  if (resource !== 'courts') {
    throw new Error(`dataProvider only supports the "courts" resource (got "${resource}").`);
  }
}

// Each method below is written generic-over-`TData` (matching `DataProvider`'s
// own per-call-generic method signatures) even though every real call site in
// this app pins `TData` to one of the admin court DTOs — a non-generic
// implementation tied to a single concrete shape isn't assignable to a
// generic method slot, so the cast at the `return` is the one place that
// bridges "we know this is actually an AdminCourt*DTO" to "the interface
// says it could be any `BaseRecord`".
export const dataProvider: DataProvider = {
  getApiUrl: () => API_BASE_URL,

  getList: async <TData extends BaseRecord = BaseRecord>({ resource, pagination, filters }: Parameters<DataProvider['getList']>[0]) => {
    courtsOnly(resource);

    const page = pagination?.currentPage ?? 1;
    const pageSize = pagination?.pageSize ?? 25;

    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));

    const q = findFilterValue(filters, 'q');
    if (q) params.set('q', q);
    const status = findFilterValue(filters, 'status');
    if (status) params.set('status', status);

    const res = await apiFetch<AdminCourtListResponseDTO>(`/admin/courts?${params.toString()}`);
    return { data: res.items as unknown as TData[], total: res.total };
  },

  getOne: async <TData extends BaseRecord = BaseRecord>({ resource, id }: Parameters<DataProvider['getOne']>[0]) => {
    courtsOnly(resource);
    const data = await apiFetch<AdminCourtDetailDTO>(`/admin/courts/${id}`);
    return { data: data as unknown as TData };
  },

  create: async <TData extends BaseRecord = BaseRecord>({ resource, variables }: Parameters<DataProvider['create']>[0]) => {
    courtsOnly(resource);
    const data = await apiFetch<AdminCourtDetailDTO>('/admin/courts', {
      method: 'POST',
      body: variables,
    });
    return { data: data as unknown as TData };
  },

  update: async <TData extends BaseRecord = BaseRecord>({ resource, id, variables }: Parameters<DataProvider['update']>[0]) => {
    courtsOnly(resource);
    const data = await apiFetch<AdminCourtDetailDTO>(`/admin/courts/${id}`, {
      method: 'PATCH',
      body: variables,
    });
    return { data: data as unknown as TData };
  },

  deleteOne: async ({ resource }) => {
    courtsOnly(resource);
    // Decision 7 (TASK_73): no hard delete of a court. Unpublish via a PATCH
    // (`status: 'draft'`) instead — this method only exists to satisfy the
    // `DataProvider` interface and must never be called.
    throw new Error('Courts cannot be deleted. Unpublish instead.');
  },
};

type FilterLike = { field?: string; value?: unknown };

function findFilterValue(filters: unknown, field: string): string | undefined {
  if (!Array.isArray(filters)) return undefined;
  const match = (filters as FilterLike[]).find((f) => f.field === field);
  return typeof match?.value === 'string' && match.value.trim().length > 0 ? match.value.trim() : undefined;
}
