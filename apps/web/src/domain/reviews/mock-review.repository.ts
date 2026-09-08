// Reviews domain — MOCK repository implementation.
//
// A LOCAL MOCK SEAM ONLY: NO backend, NO network, NO auth, NO localStorage, NO
// persistence beyond the life of the process (Architecture Plan Decision #11), exactly
// like `MockSavedRepository`'s mutation seam. `submit()` accepts the payload, stores it
// in memory, and returns it in the full `ReviewDTO` shape so the modal can flip to its
// confirmation state identically to `api` mode.
//
// WHY IT STORES rather than only echoing (as MockConsultationRepository does): a
// consultation is fire-and-forget — nothing in the app can observe one afterwards, so
// echoing loses nothing. A review has a real per-user-per-court identity the API
// enforces with `@@unique([userId, courtId])`, and the mock is the seam a developer
// exercises the form against. Keeping the rows lets that identity behave the same way
// in both modes: submitting twice for one court REPLACES the earlier row (the mock's
// stand-in for the service's upsert) rather than silently accumulating duplicates the
// mock would never reveal. Without it, "mock mode" and "api mode" would disagree about
// what a second submission means.
//
// STORE SCOPE: module-level, so every `new MockReviewRepository()` shares it — the same
// property `getClientRepositories()` relies on elsewhere (a fresh repository instance
// per call must still see the same in-memory state). There is exactly ONE mock user, so
// the key is the court slug alone; the mock has no session to key on.
//
// NOTHING READS THIS STORE. It is deliberately not exported and there is no getter: the
// product displays no review, no average and no count in either mode (Feature 80,
// task 8), and the store exists only so a repeat submission behaves correctly. Adding a
// read here would be building the display seam this feature is explicitly not building.
//
// Plain TypeScript — no React, no Next.js — so it stays independently testable like the
// other mock repositories.

import type { ReviewDTO, ReviewSubmitDTO } from '@tennis/contracts';
import type { ReviewRepository } from './review.repository';

/** courtSlug → the single mock user's stored review of that court. */
const store = new Map<string, ReviewDTO>();

export class MockReviewRepository implements ReviewRepository {
  async submit(payload: ReviewSubmitDTO): Promise<ReviewDTO> {
    const existing = store.get(payload.courtSlug);

    // Re-submitting replaces the stored review, mirroring the API's upsert: the id,
    // `status` and `createdAt` of the first submission are KEPT (the API's update
    // touches only the authored fields), and only the rating/body change.
    const stored: ReviewDTO = {
      id: existing?.id ?? `mock-review-${Date.now()}`,
      courtSlug: payload.courtSlug,
      rating: payload.rating,
      // A freshly created review is always "new" (matches the API contract).
      status: existing?.status ?? 'new',
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      // Omit `body` entirely when absent, matching the contract's optional field and
      // the API mapper's null → omitted behavior. An omitted body on a re-submit
      // CLEARS the previous one, as it does server-side.
      ...(payload.body !== undefined ? { body: payload.body } : {}),
    };

    store.set(payload.courtSlug, stored);
    return stored;
  }
}
