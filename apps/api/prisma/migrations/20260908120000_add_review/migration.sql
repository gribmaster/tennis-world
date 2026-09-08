-- Feature 80 — Review (court reviews, collection only, no display).
--
-- BACK-SAFE by construction: this migration only CREATES a new table, its unique
-- index and its two foreign keys. It adds no column to an existing table, changes
-- no existing column's type or nullability, backfills nothing, and rewrites no
-- existing row — so there is no NOT-NULL-on-populated-table problem to sequence
-- around (CLAUDE.md §8) and nothing here can fail on a populated database.
--
-- Authored with `prisma migrate diff --from-migrations prisma/migrations
-- --to-schema-datamodel prisma/schema.prisma --shadow-database-url <shadow>
-- --script` and applied with `prisma migrate deploy`. `migrate dev` is NOT used —
-- it hangs in this non-interactive shell (CLAUDE.md §8). Diffing FROM THE
-- MIGRATIONS DIRECTORY (not from the live datasource) is deliberate: the local dev
-- database carries unrelated pre-existing drift (two Court foreign keys sit at
-- NO ACTION where `init` declared RESTRICT), and a datasource diff would have
-- swept that drift into this migration. It is not this feature's to fix.
--
-- ORDER: table → unique index → foreign keys. Each statement depends only on the
-- ones before it; Court and User already exist.

-- 1) The table. `userId` is NULLABLE by design (see `Review` in schema.prisma):
--    it keeps a future anonymous-submission path migration-free. The endpoint
--    shipping with this migration is AuthGuard-protected and always writes a real
--    userId, so nothing today can insert a NULL here.
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "userId" TEXT,
    "rating" INTEGER NOT NULL,
    "body" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- 2) One review per user per court. Postgres treats NULLs as DISTINCT in a unique
--    index, so this binds only rows with a real userId — many anonymous rows for
--    one court stay legal, which is what the nullable column is for. This is also
--    the only index on the table: nothing reads reviews yet, so no read-shaped
--    index is speculated (see schema.prisma).
CREATE UNIQUE INDEX "Review_userId_courtId_key" ON "Review"("userId", "courtId");

-- 3) Foreign keys. ON DELETE RESTRICT for the required court relation and
--    ON DELETE SET NULL for the optional user relation — Prisma's defaults for a
--    required vs. optional relation, matching every other FK in this schema.
ALTER TABLE "Review" ADD CONSTRAINT "Review_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
