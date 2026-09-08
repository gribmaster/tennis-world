import { z } from 'zod';

// Court review DTOs (Feature 80, intake §3 D4).
//
// COLLECTION ONLY, NO DISPLAY. There is no list/read endpoint, no aggregate, no
// average and no count anywhere in the product. These schemas describe exactly two
// things: the body a signed-in visitor POSTs to `/v1/reviews`, and the created row
// that endpoint echoes back. Nothing else consumes them.
//
// This file mirrors `consultation.ts` — the closest existing write-only contract: a
// `…SubmitSchema` for the request, then a record schema that `.extend()`s it with the
// server-assigned fields (`id`, `status`, `createdAt`). Reviews are their own entity
// with a `courtId` FK, not a Court sub-shape, so they get their own file rather than
// living in `court.ts`.
//
// AUTHORSHIP IS NOT ON THE WIRE. The submit body carries no `userId`/`email`: the
// author is the authenticated session, resolved server-side by AuthGuard. A client
// cannot name whose review this is, and the response does not echo an author back.

/** Lowest allowed star rating. */
export const REVIEW_RATING_MIN = 1;
/** Highest allowed star rating. */
export const REVIEW_RATING_MAX = 5;
/**
 * Maximum length of the free-text review body, in characters.
 *
 * 2000 is roughly 300–350 words — comfortably more than anyone writes about a tennis
 * court, and small enough that the column and any future moderation UI stay sane. It
 * is a deliberate cap rather than an unbounded `String`: this is an authenticated
 * write with a rate limit in front of it, and an unbounded text field is the one part
 * of the payload an abuser can make arbitrarily expensive.
 */
export const REVIEW_BODY_MAX_LENGTH = 2000;

/**
 * The request body for `POST /v1/reviews`.
 *
 * `rating` is REQUIRED — a review with no rating carries nothing worth storing, since
 * the rating is the structured half of the data this feature exists to collect.
 * `body` is OPTIONAL — a rating alone is a complete submission (the same call the
 * consultation contract makes with `additionalRequest`). When present it must be
 * non-empty after trimming, so a whitespace-only string is rejected rather than
 * stored as noise; the client should omit the key instead.
 */
export const ReviewSubmitSchema = z.object({
  /** Slug of the court being reviewed (the same key `GET /v1/courts/:slug` uses). */
  courtSlug: z.string().min(1),
  /** 1–5 whole stars. Collected, never displayed. */
  rating: z
    .number()
    .int()
    .min(REVIEW_RATING_MIN)
    .max(REVIEW_RATING_MAX),
  /** Optional free-text review, 1–2000 characters once trimmed. */
  body: z.string().trim().min(1).max(REVIEW_BODY_MAX_LENGTH).optional(),
});
export type ReviewSubmitDTO = z.infer<typeof ReviewSubmitSchema>;

/**
 * A stored review, as echoed back by the create endpoint (201).
 *
 * `status` is the moderation state, narrowed to the same three-value vocabulary
 * `ConsultationRequestSchema.status` uses. A freshly created review is always `"new"`;
 * the other two exist so a future admin surface has somewhere to move it.
 *
 * NOTE this shape is returned ONLY as the create response. No endpoint lists reviews,
 * and no read DTO (court, collection, article, country, user profile) embeds one or
 * derives a rating, average or count from one.
 */
export const ReviewSchema = ReviewSubmitSchema.extend({
  id: z.string(),
  status: z.enum(['new', 'published', 'rejected']),
  createdAt: z.string(), // ISO-8601
});
export type ReviewDTO = z.infer<typeof ReviewSchema>;
