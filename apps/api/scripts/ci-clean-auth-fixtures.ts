/* eslint-disable no-console */
//
// Feature 59 — CI auth fixture cleanup (infra only).
//
// The authed verification harnesses (verify-user-saved-http.ts,
// verify-persisted-saved-flow.ts) and the token bootstrap (ci-issue-token.ts) create
// runtime rows for a dedicated CI identity: a User, its UserCollection(s) +
// UserCollectionCourt links, SavedCourt rows, and MagicLinkToken rows. The harnesses
// toggle court memberships and saves back OUT and unsave at the end, but by design they
// leave behind the empty wishlist FOLDERS they create (there is no delete-folder endpoint
// in Phase-4 scope — Feature 58 doc note). That residue is harmless for a single run but
// would accumulate (slug-deduped) across repeated CI runs.
//
// This script deletes ALL rows for the dedicated CI email so each CI run starts and ends
// clean — making the Postgres service container reusable and the harnesses deterministic.
// It is the executable form of the "SQL-only cleanup" the Feature 56/58 docs describe.
//
// SAFETY: it only ever touches the namespaced CI identity (`ci-verify@tennis.test`, a
// `.test` address that can't be a real user) — never seeded rows (the seed creates no
// users) and never another user's data. FK-safe delete order: children first.
//
// Run:  DATABASE_URL=... tsx apps/api/scripts/ci-clean-auth-fixtures.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Must match ci-issue-token.ts. The harnesses authenticate as whatever user the bootstrap
// token belongs to, so this single email owns ALL the runtime rows CI creates.
const CI_EMAIL = 'ci-verify@tennis.test';

async function main(): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email: CI_EMAIL },
    select: { id: true },
  });

  // Tokens are not FK-linked to the user; clean them regardless of whether a user exists.
  const tokens = await prisma.magicLinkToken.deleteMany({
    where: { email: CI_EMAIL },
  });
  console.error(`[ci-clean] deleted ${tokens.count} magic-link token(s)`);

  if (!user) {
    console.error(`[ci-clean] no user for <${CI_EMAIL}> — nothing further to clean`);
    return;
  }

  const userId = user.id;

  // Children first (FK-safe). UserCollectionCourt → UserCollection; SavedCourt; (no
  // Entitlement/Consultation rows are created by the harnesses, but clear defensively).
  const collections = await prisma.userCollection.findMany({
    where: { userId },
    select: { id: true },
  });
  const collectionIds = collections.map((c) => c.id);

  const links = await prisma.userCollectionCourt.deleteMany({
    where: { userCollectionId: { in: collectionIds } },
  });
  const folders = await prisma.userCollection.deleteMany({ where: { userId } });
  const saved = await prisma.savedCourt.deleteMany({ where: { userId } });
  await prisma.entitlement.deleteMany({ where: { userId } });
  await prisma.consultationRequest.deleteMany({ where: { userId } });

  await prisma.user.delete({ where: { id: userId } });

  console.error(
    `[ci-clean] deleted user <${CI_EMAIL}>: ${folders.count} folder(s), ` +
      `${links.count} membership link(s), ${saved.count} saved court(s)`,
  );
}

main()
  .catch((err) => {
    console.error('\n[ci-clean] FAILED:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
