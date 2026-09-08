// Reviews domain — repository INTERFACE.
//
// The contract every review data source must satisfy (Architecture Plan Decision #7).
// The review modal depends ONLY on this interface (reached through the sanctioned
// factory helper, never by constructing a repository); the factory decides which
// implementation is wired in — mock in `mock` mode, HTTP in `api` mode. The UI is
// identical either way.
//
// WRITE-ONLY, ON PURPOSE. There is exactly one method, and it is a submit. No
// `getReviews`, no `getRating`, no `getReviewCount` — nothing in this product reads a
// review, and the API exposes no endpoint that would answer such a call (Feature 80,
// task 8). If a later feature displays reviews it adds the read here alongside its own
// moderation decisions; do not add one speculatively.
//
// Signatures are typed against `@tennis/contracts` DTOs so the request/response shapes
// are defined once and reused by both implementations.

import type { ReviewDTO, ReviewSubmitDTO } from '@tennis/contracts';

export interface ReviewRepository {
  /**
   * Submit a review for a court. Resolves to the stored `ReviewDTO` (id, status,
   * createdAt plus the submitted fields). Rejects on failure — the modal catches the
   * rejection and shows an inline error while staying open.
   *
   * REQUIRES A SIGNED-IN USER in `api` mode: the endpoint is AuthGuard-protected, and
   * the author is the session, never part of the payload. A logged-out caller gets an
   * `AuthRequiredError`; the UI is expected to route to sign-in BEFORE opening the
   * form rather than let a submit fail (see ReviewTrigger).
   */
  submit(payload: ReviewSubmitDTO): Promise<ReviewDTO>;
}
