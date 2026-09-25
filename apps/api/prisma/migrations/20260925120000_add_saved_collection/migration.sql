-- Task 42 — SavedCollection (standalone save/unsave "heart" for an editorial
-- Collection, mirroring `SavedCourt`/Feature 54).
--
-- BACK-SAFE by construction: this migration only CREATES a new table and its two
-- foreign keys. It adds no column to an existing table, changes no existing
-- column's type or nullability, and rewrites no existing row.
--
-- Authored with `prisma migrate diff --from-migrations prisma/migrations
-- --to-schema-datamodel prisma/schema.prisma --shadow-database-url <shadow>
-- --script` and applied with `prisma migrate deploy`. `migrate dev` is NOT used —
-- it hangs in this non-interactive shell (CLAUDE.md §8).
--
-- ORDER: table → foreign keys. Composite PK (userId, collectionId) is declared
-- inline with the table, same as `SavedCourt`'s migration. User and Collection
-- already exist.

-- 1) The table + composite PK.
CREATE TABLE "SavedCollection" (
    "userId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedCollection_pkey" PRIMARY KEY ("userId","collectionId")
);

-- 2) Foreign keys. ON DELETE RESTRICT for both required relations, matching
--    `SavedCourt`'s FKs (Prisma's default for a required relation).
ALTER TABLE "SavedCollection" ADD CONSTRAINT "SavedCollection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SavedCollection" ADD CONSTRAINT "SavedCollection_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
