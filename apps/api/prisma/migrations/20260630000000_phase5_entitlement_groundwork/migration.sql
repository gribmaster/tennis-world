-- Feature 61 — Phase 5 entitlement groundwork (additive, backward-safe).
--
-- Adds the provider-correlation + lifecycle columns to Entitlement, the
-- User.stripeCustomerId link, and the ProcessedWebhookEvent idempotency ledger.
-- NO behavior is wired by this migration — these are the schema targets the Phase-5
-- EffectiveEntitlementService + Stripe checkout/webhook features (62/65/66) will
-- read/write. The Entitlement table is empty today (never seeded), but this is
-- authored to apply cleanly to a POPULATED table (CI/prod) too.
--
-- BACK-SAFETY:
--   • Every new Entitlement column is NULLABLE except `startsAt`, which is added
--     NOT NULL WITH a DEFAULT CURRENT_TIMESTAMP — so any pre-existing rows backfill
--     to now() and the add never aborts. Unlike the Feature-51 `updatedAt` case, the
--     default is KEPT (not dropped): `startsAt` maps to `@default(now())` in the
--     datamodel, so its final column state legitimately carries the SQL default and
--     `migrate diff` schema-vs-history stays empty (dropping it would create drift).
--   • `User.stripeCustomerId` is nullable → no backfill needed.
--   • The UNIQUE index on `Entitlement.providerPurchaseId` (and on
--     `User.stripeCustomerId`) is safe to add to existing data: Postgres permits many
--     NULLs under a UNIQUE index, so unpopulated rows never collide. Today every
--     value is NULL, so the index is trivially satisfiable.
--   • No column drop, no enum change, no type narrowing, no data loss.
--
-- This migration's SQL is exactly what `prisma migrate diff` emits for the datamodel
-- delta (the dev shell is non-interactive, so `migrate dev` can't run — same offline-
-- authoring discipline as the Feature-51 migration; see the feature report).

-- AlterTable: User — Stripe customer link (nullable, no backfill)
ALTER TABLE "User" ADD COLUMN     "stripeCustomerId" TEXT;

-- AlterTable: Entitlement — provider correlation + lifecycle/audit columns.
--   `startsAt` is NOT NULL with a server default so existing rows backfill to now();
--   all others are nullable.
ALTER TABLE "Entitlement" ADD COLUMN     "grantedByAdminId" TEXT,
ADD COLUMN     "providerCustomerId" TEXT,
ADD COLUMN     "providerPurchaseId" TEXT,
ADD COLUMN     "providerSubscriptionId" TEXT,
ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "revokedReason" TEXT,
ADD COLUMN     "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable: ProcessedWebhookEvent (webhook idempotency ledger; `id` = provider event id)
CREATE TABLE "ProcessedWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: one Stripe customer per User (NULLs allowed → safe on existing rows)
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- CreateIndex: idempotency anchor — unique purchase id (NULLs allowed → safe)
CREATE UNIQUE INDEX "Entitlement_providerPurchaseId_key" ON "Entitlement"("providerPurchaseId");

-- CreateIndex: webhook reconciliation lookups
CREATE INDEX "Entitlement_providerCustomerId_idx" ON "Entitlement"("providerCustomerId");

-- CreateIndex
CREATE INDEX "Entitlement_providerSubscriptionId_idx" ON "Entitlement"("providerSubscriptionId");
