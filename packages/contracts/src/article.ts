import { z } from 'zod';

// Article / Journal DTOs (Architecture Plan §2).

export const ArticleSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  category: z.string(),
  heroImageUrl: z.string(),
  readTimeMinutes: z.number().int(),
});
export type ArticleSummaryDTO = z.infer<typeof ArticleSummarySchema>;

export const ArticleSchema = ArticleSummarySchema.extend({
  bodyRichText: z.string(),
  publishedAt: z.string(), // ISO-8601
  // Optional byline author (Feature 31). Kept optional so the byline block degrades
  // gracefully when absent (like `subtitle`/`heroImageUrl`). The avatar initials are
  // DERIVED in the UI from this name — there is no separate `authorInitials` field.
  author: z.string().optional(),
});
export type ArticleDTO = z.infer<typeof ArticleSchema>;
