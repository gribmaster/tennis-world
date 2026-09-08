// Reviews domain — public surface of the feature (Feature 80).
//
// Re-exports the interface and both implementations. The DTOs stay owned by
// `@tennis/contracts` and are re-exported here only as a convenience so consumers have
// a single import site.
//
// NOTE: this barrel does NOT wire a default repository into the app. Selecting the
// active implementation (mock vs. HTTP) is the job of the central domain factory
// (`src/domain/index.ts`); the review modal reaches it through the sanctioned
// client-side helper (`getClientRepositories().reviews`), never by constructing one.
//
// WRITE-ONLY: there is one method, `submit`. Nothing in the product reads a review, a
// rating average or a review count.

export type { ReviewRepository } from './review.repository';
export { MockReviewRepository } from './mock-review.repository';
export { HttpReviewRepository } from './http-review.repository';

// Convenience re-export of the review DTOs this feature's method speaks in.
export type { ReviewSubmitDTO, ReviewDTO } from '@tennis/contracts';
