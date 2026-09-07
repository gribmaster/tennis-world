-- Feature 72 — Court.tags (closed "Experience" vocabulary; see
-- packages/contracts/src/enums.ts `CourtTag` for the ten allowed values).
--
-- Back-safe additive sequence (CLAUDE.md §8): the column is added WITH a default
-- so every pre-existing row is valid the instant it appears, then explicitly
-- backfilled (defensive — covers any row that could have been written NULL by a
-- concurrent connection between the ADD and the SET NOT NULL), and only then
-- given the NOT NULL constraint. No data is read or rewritten beyond the empty
-- default, so this is safe to run against a populated table.

-- 1) Add the column with an empty-array default (existing rows become '{}').
ALTER TABLE "Court" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- 2) Backfill any NULL (no-op on a fresh add; guards the concurrent-write case).
UPDATE "Court" SET "tags" = ARRAY[]::TEXT[] WHERE "tags" IS NULL;

-- 3) Only now enforce NOT NULL — matches Prisma's `String[] @default([])`, which
--    models a scalar list as a non-nullable array column.
ALTER TABLE "Court" ALTER COLUMN "tags" SET NOT NULL;
