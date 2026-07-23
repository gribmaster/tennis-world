-- Google OAuth account linking (additive, backward-safe).
--
-- Adds User.googleId (nullable, unique — same pattern as stripeCustomerId) and
-- User.avatarUrl (nullable). Both are NULLABLE with no NOT NULL constraint, so this
-- applies cleanly to a populated table with no backfill needed (every existing row
-- simply gets NULL in both new columns). No behavior is wired by this migration alone.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "googleId" TEXT,
ADD COLUMN     "avatarUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
