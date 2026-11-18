import type { Prisma } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// Shared row lock (TASK_75 decision 1, TASK_76 decision 2) used by every
// transaction that reads-then-writes a court's images or publish-affecting
// fields: `SELECT id FROM "Court" WHERE id = $1 FOR UPDATE`, MUST be the first
// statement, before any read that decides what gets written. Used by both
// `AdminImagesService` (upload/patch/reorder/delete) and `AdminCourtsService`
// (update, for the publish gate).
// ─────────────────────────────────────────────────────────────────────────────
export async function lockCourtRow(tx: Prisma.TransactionClient, courtId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Court" WHERE id = ${courtId} FOR UPDATE`;
}
