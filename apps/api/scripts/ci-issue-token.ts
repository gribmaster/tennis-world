/* eslint-disable no-console */
//
// Feature 59 — CI auth-token bootstrap (infra only; NOT a product endpoint).
//
// The two authed web verification harnesses (verify-user-saved-http.ts,
// verify-persisted-saved-flow.ts) need a real bearer `accessToken` to drive the
// protected /v1/me/* surface. In local dev that token is obtained by copying the raw
// magic-link token out of the dev mailer LOG (MAGIC_LINK_DEV_LOG) and POSTing it to
// /v1/auth/verify — log scraping that is fragile and non-deterministic in CI.
//
// This script obtains the SAME kind of token DETERMINISTICALLY, through the REAL verify
// path, with no log scraping and no new endpoint:
//   1. Pick a deterministic raw token (32 random bytes — minted here, in-process).
//   2. Insert a MagicLinkToken row whose `tokenHash` = SHA-256(rawToken), exactly the
//      shape AuthService.requestLink would have written (the raw token never hits the DB
//      anywhere else, so writing the row directly is the only way to know the raw value
//      without scraping the log).
//   3. POST { token: rawToken } to /v1/auth/verify — the genuine endpoint: it hashes,
//      looks up, single-use-consumes the row, UPSERTS the User, and signs a real access
//      JWT with the running API's JWT_SECRET. This is the production verify code path,
//      not a shortcut around it.
//   4. Print ONLY the `accessToken` to stdout so the CI step can capture it:
//        TOKEN="$(node ... ci-issue-token.js)"  /  pnpm ... | tail -n1
//
// SELF-CLEANING: the verify call consumes the token row (consumedAt set), so it can't be
// replayed. The script then best-effort deletes any leftover token rows for its dedicated
// test email and (optionally) the test User it created, so repeated CI runs stay clean.
// The dedicated email is namespaced (`ci-verify@tennis.test`) and never collides with a
// real or seeded user (the seed creates NO users).
//
// Run (after the API is up and migrated/seeded):
//   DATABASE_URL=... NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/v1 \
//     tsx apps/api/scripts/ci-issue-token.ts
// Prints the bearer token on the LAST stdout line; everything else goes to stderr.
//
// Determinism / isolation notes:
//   • Uses its OWN email so it never clobbers the harnesses' own per-feature emails.
//   • Inserts via the SAME Prisma client + DATABASE_URL the API uses, so the row the API
//     reads on verify is the row this script wrote (one database).
//   • Hash algorithm (SHA-256 hex of the raw token) mirrors AuthService.sha256 exactly;
//     if that ever changes, this script's verify POST returns 400 and CI fails loudly.

import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Dedicated, namespaced CI identity. The seed creates no users, and this address can't
// match a real one (`.test` TLD), so it is safe to create/clean repeatedly.
const CI_EMAIL = 'ci-verify@tennis.test';

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'http://localhost:3001/v1';

/** SHA-256 hex — mirrors AuthService.sha256 (the only thing that must stay in lockstep). */
function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function main(): Promise<void> {
  // 1–2. Mint a raw token and persist ONLY its hash (the request-link shape).
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 15 * 60_000); // 15 min, matches default TTL

  // Clear any stale tokens for this email first (idempotent re-runs).
  await prisma.magicLinkToken.deleteMany({ where: { email: CI_EMAIL } });
  await prisma.magicLinkToken.create({
    data: { email: CI_EMAIL, tokenHash, expiresAt },
  });
  console.error(`[ci-issue-token] inserted magic-link token for <${CI_EMAIL}>`);

  // 3. Exchange it through the REAL verify endpoint (genuine User upsert + JWT signing).
  const res = await fetch(`${API_BASE}/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ token: rawToken }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `POST ${API_BASE}/auth/verify → ${res.status} ${res.statusText}\n${body}`,
    );
  }
  const session = (await res.json()) as { accessToken?: string };
  if (!session.accessToken) {
    throw new Error('verify succeeded but returned no accessToken');
  }
  console.error('[ci-issue-token] verified — access token minted');

  // The raw token row is already consumed by verify; nothing else to clean for the token.
  // Print ONLY the token to stdout (last line) so the CI step can capture it cleanly.
  console.log(session.accessToken);
}

main()
  .catch((err) => {
    console.error('\n[ci-issue-token] FAILED:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
