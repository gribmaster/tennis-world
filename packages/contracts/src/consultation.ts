import { z } from 'zod';
import { GroupSize, SkillLevel } from './enums';

// Consultation / concierge lead DTOs (Architecture Plan §2, PRD §6.8).
// Anonymous submission is allowed — userId is optional.

export const ConsultationSubmitSchema = z.object({
  name: z.string().optional(),
  email: z.string().email(),
  destinationInterest: z.string(),
  travelStart: z.string().optional(), // ISO-8601 date
  travelEnd: z.string().optional(),
  isFlexible: z.boolean().default(false),
  skillLevel: SkillLevel.optional(),
  groupSize: GroupSize.optional(),
  additionalRequest: z.string().optional(),
  source: z.enum(['court', 'paywall', 'profile']).optional(),
});
export type ConsultationSubmitDTO = z.infer<typeof ConsultationSubmitSchema>;

export const ConsultationRequestSchema = ConsultationSubmitSchema.extend({
  id: z.string(),
  status: z.enum(['new', 'contacted', 'closed']),
  createdAt: z.string(), // ISO-8601
});
export type ConsultationRequestDTO = z.infer<typeof ConsultationRequestSchema>;
