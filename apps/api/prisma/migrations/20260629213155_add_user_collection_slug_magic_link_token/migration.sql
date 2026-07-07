-- Feature 51 — Phase 4 schema groundwork (additive, backward-safe).
--
-- Adds: User.updatedAt; UserCollection.slug + per-user unique (userId, slug);
-- the MagicLinkToken table. NO behavior is wired by this migration — these are
-- FK/lookup targets the Phase-4 auth + /v1/me features (52+) will read/write.
--
-- BACKFILL SAFETY: the two new NOT NULL columns are added WITH a server-side
-- DEFAULT so the migration applies cleanly to a POPULATED table (e.g. CI/prod with
-- existing users/folders), not just the empty local dev table. Prisma's own diff
-- would emit bare `NOT NULL` adds (which abort on any existing row); this hand-
-- authored migration is the back-safe variant. See the feature report for the
-- offline-authoring rationale (the dev shell is non-interactive, so `migrate dev`
-- can't run — same constraint Phase 2 hit).

-- AlterTable: User.updatedAt
--   `@updatedAt` is maintained by Prisma on every write and maps to a column with NO
--   SQL default, so a bare NOT NULL add would abort on existing rows. We add it with
--   a temporary DEFAULT CURRENT_TIMESTAMP to backfill any existing rows, then DROP
--   the default so the final column state matches the Prisma datamodel exactly
--   (`migrate diff` schema-vs-history is then empty — no perpetual "drift"). Prisma
--   still sets the value on every write regardless of the (absent) SQL default.
ALTER TABLE "User" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "User" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable: UserCollection.slug
--   The server derives a unique-per-user slug on create/rename, so new rows always
--   supply one. For SAFE backfill of any pre-existing rows we (1) add the column
--   with a temporary default, (2) backfill it from the row's `id` (globally unique,
--   so it can never collide under the new per-user unique index), then (3) DROP the
--   default so the application is forced to provide a real slug going forward
--   (no silent placeholder slugs after this migration). The local dev table is
--   empty, so step 2 is a no-op there, but this keeps CI/prod safe.
ALTER TABLE "UserCollection" ADD COLUMN "slug" TEXT NOT NULL DEFAULT '';
UPDATE "UserCollection" SET "slug" = "id" WHERE "slug" = '';
ALTER TABLE "UserCollection" ALTER COLUMN "slug" DROP DEFAULT;

-- CreateTable: MagicLinkToken (single-use email magic-link tokens — Feature 50 §3.3/§9)
CREATE TABLE "MagicLinkToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ipHash" TEXT,

    CONSTRAINT "MagicLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MagicLinkToken_tokenHash_key" ON "MagicLinkToken"("tokenHash");

-- CreateIndex
CREATE INDEX "MagicLinkToken_email_idx" ON "MagicLinkToken"("email");

-- CreateIndex
CREATE INDEX "MagicLinkToken_expiresAt_idx" ON "MagicLinkToken"("expiresAt");

-- CreateIndex (per-user slug uniqueness — NOT global; two users may share a slug)
CREATE UNIQUE INDEX "UserCollection_userId_slug_key" ON "UserCollection"("userId", "slug");
