// Reviews domain — HTTP repository implementation (`api` data source).
//
// Implements the SAME `ReviewRepository` interface as the mock, backed by
// `POST /v1/reviews`. Wired in by the factory when `NEXT_PUBLIC_DATA_SOURCE=api`.
// The body is a `ReviewSubmitDTO` (the contract's submit shape, re-validated
// server-side by the global ValidationPipe); the API returns the stored `ReviewDTO`
// with 201.
//
// AUTH TRANSPORT — the one structural difference from HttpConsultationRepository, and
// the reason this file has a constructor at all. `POST /v1/consultations` is public, so
// that repository sends no credentials. `POST /v1/reviews` is AuthGuard-protected, so
// this one takes `HttpAuthOptions` and forwards them on the request, exactly as
// `HttpBillingRepository` and `HttpSavedRepository` do. The review modal is a CLIENT
// island, so in practice the factory hands it `auth: 'include'` (via
// `getClientRepositories()`), which tells `fetch` to attach the httpOnly session cookie
// the browser cannot read itself. A server caller would pass `cookie`; a script, a
// `bearerToken`.
//
// With NO auth context — the bare `repositories` singleton — a submit reaches the
// endpoint unauthenticated and comes back 401, which the http-client raises as
// `AuthRequiredError`. That is the correct, loud failure: it is never silently
// downgraded to an anonymous review (the API would refuse one anyway). The UI is
// expected not to reach this state — ReviewTrigger routes a logged-out visitor to
// /signin instead of opening the form.
//
// Response typing follows the same "type assertion, not zod" choice the other HTTP
// repositories document; the DTO TYPES come from `@tennis/contracts`.

import type { ReviewDTO, ReviewSubmitDTO } from '@tennis/contracts';
import type { ReviewRepository } from './review.repository';
import { postJson, type HttpAuthOptions } from '../http/http-client';

export class HttpReviewRepository implements ReviewRepository {
  constructor(private readonly auth: HttpAuthOptions = {}) {}

  /** POST /v1/reviews — store the signed-in author's review, return the stored DTO. */
  async submit(payload: ReviewSubmitDTO): Promise<ReviewDTO> {
    return postJson<ReviewDTO>('/reviews', payload, this.auth);
  }
}
