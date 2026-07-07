import { z } from 'zod';
import { CollectionType } from './enums';
import { CourtSummarySchema } from './court';

// Collection DTOs (Architecture Plan §2). `count` is DERIVED from the
// CollectionCourt membership mapping, never authored as a standalone number
// (Architecture Plan §9 Risk #19).

export const CollectionSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().optional(),
  coverImageUrl: z.string(),
  type: CollectionType,
  count: z.number().int(),
});
export type CollectionDTO = z.infer<typeof CollectionSchema>;

export const CollectionWithCourtsSchema = CollectionSchema.extend({
  courts: z.array(CourtSummarySchema),
});
export type CollectionWithCourtsDTO = z.infer<typeof CollectionWithCourtsSchema>;
