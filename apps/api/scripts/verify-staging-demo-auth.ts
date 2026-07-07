/* eslint-disable no-console */
//
// Feature 76 — Staging demo-auth verification (DETERMINISTIC, no Stripe, no magic link).
//
// Proves the STAGING-ONLY demo-auth branch of the AuthGuard end-to-end through the REAL
// protected endpoints. The API under test MUST be running with demo auth ENABLED and the
// SAME secret this script sends:
//
//   # apps/api/.env (or exported env for `pnpm --filter @tennis/api dev`):
//   STAGING_DEMO_AUTH_ENABLED=true
//   STAGING_DEMO_AUTH_SECRET=<a long random secret>
//   STAGING_DEMO_EMAIL=demo@tennisworld.local        # optional; this default is assumed
//
//   pnpm db:up
//   pnpm --filter @tennis/api prisma:migrate:deploy && pnpm --filter @tennis/api db:seed
//   STAGING_DEMO_AUTH_ENABLED=true STAGING_DEMO_AUTH_SECRET=<secret> \
//     pnpm --filter @tennis/api dev                  # API on :3001 with demo auth on
//   DATABASE_URL=... NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/v1 \
//     STAGING_DEMO_AUTH_SECRET=<same secret> \
//     pnpm --filter @tennis/api verify:staging-demo-auth
//
// If STAGING_DEMO_AUTH_SECRET is unset for THIS script, it SKIPs cleanly (exit 0) — like the
// opt-in Stripe harnesses, a green no-op rather than a fake pass.
//
// Scenarios:
//   A. GET /v1/me with NO auth                    → 401  (guard, before handler)
//   B. GET /v1/me with WRONG demo secret          → 401  (present-but-wrong → hard reject)
//   C. GET /v1/me with CORRECT demo secret        → 200  + UserProfileDTO for the demo user
//   D. demo user is FREE                          → membership === 'free' (no entitlement bypass)
//   E. demo profile is STABLE across two requests → same id/name both times (found, not re-created)
//   F. protected saved-courts round-trips as demo → POST save 201, GET list contains it, DELETE 200
//   G. protected collections create as demo       → POST /v1/me/collections 201 + server slug
//   H. public /v1/courts still masks exact coords → NO lat/lng for the demo (authed) header either
//
// CLEANUP: the demo user is a persistent, intentionally-stable row (demo@tennisworld.local by
// default) — this script does NOT delete it (it's the whole point of the demo). It DOES clean
// up the saved court + collection it creates so re-runs stay deterministic.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'http://localhost:3001/v1';

const DEMO_HEADER = 'X-Tennis-Demo-Auth';
const DEMO_SECRET = process.env.STAGING_DEMO_AUTH_SECRET?.trim();
const DEMO_EMAIL =
  process.env.STAGING_DEMO_EMAIL?.trim() || 'demo@tennisworld.local';

// A real, seeded, PUBLISHED court — used for the save round-trip and the public masking check.
const REAL_COURT_SLUG = 'grand-hotel-tremezzo';

// ── Tiny assertion harness (matches the other verify-* scripts) ──────────────────────

interface CheckResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail?: string;
}
const results: CheckResult[] = [];

function record(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
  const tag = ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  ${tag}  ${name}`);
  if (!ok && detail) for (const line of detail.split('\n')) console.log(`        ${line}`);
}

/** Recursively scan for any `lat`/`lng` key (exact-coordinate leak detector). */
function hasCoordKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasCoordKey);
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'lat' || k === 'lng') return true;
      if (hasCoordKey(v)) return true;
    }
  }
  return false;
}

async function main(): Promise<void> {
  if (!DEMO_SECRET) {
    console.log(
      '\n  SKIP  verify:staging-demo-auth — STAGING_DEMO_AUTH_SECRET not set for this ' +
        'harness. Set it (matching the running API) to run the checks.\n',
    );
    return;
  }

  console.log('\nFeature 76 — staging demo-auth verification');
  console.log(`  API: ${API_BASE}  demo email: ${DEMO_EMAIL}\n`);

  const demoHeaders = { [DEMO_HEADER]: DEMO_SECRET };

  // A. No auth → 401.
  {
    const res = await fetch(`${API_BASE}/me`);
    record('A. GET /v1/me with no auth → 401', res.status === 401, `got ${res.status}`);
  }

  // B. Wrong demo secret → 401 (a present-but-wrong secret is rejected, not fallen through).
  {
    const res = await fetch(`${API_BASE}/me`, {
      headers: { [DEMO_HEADER]: `${DEMO_SECRET}-wrong` },
    });
    record('B. GET /v1/me with wrong demo secret → 401', res.status === 401, `got ${res.status}`);
  }

  // C/D. Correct demo secret → 200 + UserProfileDTO; membership is 'free'.
  let demoId: string | undefined;
  let demoName: string | undefined;
  {
    const res = await fetch(`${API_BASE}/me`, { headers: demoHeaders });
    const ok = res.status === 200;
    const body = ok ? ((await res.json()) as Record<string, unknown>) : {};
    demoId = body.id as string | undefined;
    demoName = body.name as string | undefined;
    record('C. GET /v1/me with correct demo secret → 200 UserProfileDTO', ok && !!demoId, `got ${res.status}`);
    record(
      "D. demo user membership is 'free' (no entitlement bypass)",
      body.membership === 'free',
      `membership=${String(body.membership)}`,
    );
    record(
      'D2. no email surfaced on the profile DTO',
      !('email' in body),
      'UserProfileDTO must not carry email',
    );
  }

  // E. Stable identity across two requests (found, not re-created each time).
  {
    const res = await fetch(`${API_BASE}/me`, { headers: demoHeaders });
    const body = (await res.json()) as Record<string, unknown>;
    record(
      'E. demo profile stable across requests (same id + name)',
      body.id === demoId && body.name === demoName && demoName === 'Demo User',
      `first=(${demoId},${demoName}) second=(${String(body.id)},${String(body.name)})`,
    );
  }

  // Resolve the real court id (needed to save it).
  let courtId: string | undefined;
  {
    const res = await fetch(`${API_BASE}/courts/${REAL_COURT_SLUG}`);
    if (res.ok) {
      const court = (await res.json()) as Record<string, unknown>;
      courtId = court.id as string | undefined;
    }
  }

  // F. Saved-courts round-trip as the demo user.
  if (courtId) {
    const saveRes = await fetch(`${API_BASE}/me/saved-courts`, {
      method: 'POST',
      headers: { ...demoHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ courtId }),
    });
    record('F1. POST /v1/me/saved-courts as demo → 201', saveRes.status === 201, `got ${saveRes.status}`);

    const listRes = await fetch(`${API_BASE}/me/saved-courts`, { headers: demoHeaders });
    const list = listRes.ok ? ((await listRes.json()) as Array<{ id: string }>) : [];
    record(
      'F2. GET /v1/me/saved-courts contains the saved court',
      list.some((c) => c.id === courtId),
      `list ids: ${list.map((c) => c.id).join(', ') || '(empty)'}`,
    );

    const delRes = await fetch(`${API_BASE}/me/saved-courts/${courtId}`, {
      method: 'DELETE',
      headers: demoHeaders,
    });
    record('F3. DELETE /v1/me/saved-courts/:id as demo → 200', delRes.status === 200, `got ${delRes.status}`);
  } else {
    record('F. saved-courts round-trip', false, `could not resolve court id for ${REAL_COURT_SLUG}`);
  }

  // G. Create a collection as the demo user; server derives the slug. Clean it up after.
  {
    const name = `Demo Check ${Date.now()}`;
    const res = await fetch(`${API_BASE}/me/collections`, {
      method: 'POST',
      headers: { ...demoHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const ok = res.status === 201;
    const body = ok ? ((await res.json()) as Record<string, unknown>) : {};
    record(
      'G. POST /v1/me/collections as demo → 201 + server slug',
      ok && typeof body.slug === 'string' && (body.slug as string).length > 0,
      `status ${res.status}, slug=${String(body.slug)}`,
    );
    // Clean up the created collection so re-runs stay deterministic.
    if (typeof body.id === 'string' && demoId) {
      await prisma.userCollection.deleteMany({ where: { id: body.id, userId: demoId } });
    }
  }

  // H. Public /v1/courts must NOT expose exact lat/lng — even with the demo (authed) header.
  {
    const res = await fetch(`${API_BASE}/courts`, { headers: demoHeaders });
    const body = (await res.json()) as unknown;
    record(
      'H. public /v1/courts still masks exact lat/lng (demo header present)',
      !hasCoordKey(body),
      'exact lat/lng must never appear on the public list',
    );
  }

  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`\n  ${passed}/${total} checks passed\n`);
  if (passed !== total) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
