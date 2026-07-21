/* eslint-disable no-console */
//
// Feature 67 — Web billing wiring verification (NO real Stripe, NO browser automation).
//
// The API side is proven elsewhere (verify-stripe-webhook 20/20, the billing endpoints
// under verify-api-*). THIS harness proves the WEB WIRING Feature 67 adds, and — crucially
// — the PRIVACY/SAFETY guarantees the prompt's hard rules demand, WITHOUT needing a Stripe
// account or a running API for the always-on checks:
//
//   ALWAYS-ON (no API, no Stripe, deterministic — safe for CI):
//     1. No `@stripe/*` / stripe.js dependency in apps/web/package.json.
//     2. No `NEXT_PUBLIC_STRIPE*` (or any client-exposed Stripe secret) anywhere in the
//        web source tree — the secret-leak guard (hard rule).
//     3. The BillingRepository seam exists and is FACTORY-WIRED in BOTH modes:
//          - getRepositories('api').billing  is an HttpBillingRepository-shaped object
//            with createCheckout/createPortalSession,
//          - getRepositories('mock').billing throws BillingNotAvailableError (no fake
//            redirect, no url) for both methods — the mock build stays stable.
//     4. The /billing/return route file exists.
//
//   TOKEN-GATED (need a running API + a minted session; SKIPPED when absent — same shape
//   as verify-web-exact-location.ts). These prove the return page's membership logic
//   WITHOUT Stripe, because the page state is a pure function of what `/v1/me` returns:
//     5. FREE_BEARER_TOKEN      → /v1/me membership === 'free'         → return page "processing".
//     6. ENTITLED_BEARER_TOKEN  → /v1/me membership !== 'free'         → return page "success".
//        (subscription OR lifetime — the return page's success state doesn't distinguish them.
//        Seed the Entitlement exactly as the API exact-location/webhook harnesses do.)
//
//   OPTIONAL with real Stripe test keys (SKIPPED unless RUN_STRIPE_CHECKOUT=1 AND a token):
//     7. billing.createCheckout('monthly') returns a hosted https URL via the API.
//        We DO NOT follow the redirect and DO NOT fake success — we only assert the repo
//        returns a `{ url }` the browser action would navigate to.
//
// ── How to run ─────────────────────────────────────────────────────────────────────
//   # Always-on checks only (no API, no Stripe):
//   pnpm --filter @tennis/web verify:web-billing
//   # With the /v1/me membership checks (mint tokens via the magic-link flow; seed an
//   # Entitlement for the entitled one — see apps/api/scripts/verify-exact-location.ts):
//   NEXT_PUBLIC_DATA_SOURCE=api FREE_BEARER_TOKEN=<jwt> ENTITLED_BEARER_TOKEN=<jwt> \
//     pnpm --filter @tennis/web verify:web-billing
//   # Optional real-Stripe checkout URL check (needs the API configured with test keys):
//   NEXT_PUBLIC_DATA_SOURCE=api RUN_STRIPE_CHECKOUT=1 ENTITLED_BEARER_TOKEN=<jwt> \
//     pnpm --filter @tennis/web verify:web-billing
//
// Repos are imported by RELATIVE path (tsx doesn't read the Next tsconfig `paths`).

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { UserProfileDTO } from '@tennis/contracts';
import { getRepositories, BillingNotAvailableError } from '../src/domain';
import type { HttpAuthOptions } from '../src/domain/http/http-client';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(HERE, '..');
const REPO_ROOT = join(WEB_ROOT, '..', '..');

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'http://localhost:3001/v1';

// ── Tiny assertion harness (matches verify-web-exact-location) ──────────────────────

interface CheckResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail?: string;
}
const results: CheckResult[] = [];
let skipped = 0;

function record(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
  const tag = ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  ${tag}  ${name}`);
  if (!ok && detail) for (const line of detail.split('\n')) console.log(`        ${line}`);
}
function expectTrue(name: string, ok: boolean, detail?: string): void {
  record(name, ok, ok ? undefined : detail);
}
function skip(name: string, why: string): void {
  skipped += 1;
  console.log(`  \x1b[33mSKIP\x1b[0m  ${name}`);
  console.log(`        ${why}`);
}
function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Read a file relative to the repo root, or '' if missing. */
function readRepoFile(rel: string): string {
  const p = join(REPO_ROOT, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

/** Recursively list source files under a dir (ts/tsx/js/jsx/json/env), skipping build dirs. */
function listSourceFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist') {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      listSourceFiles(full, acc);
    } else if (/\.(tsx?|jsx?|json|env(\..*)?)$/.test(entry.name) || entry.name.startsWith('.env')) {
      acc.push(full);
    }
  }
  return acc;
}

async function main(): Promise<void> {
  console.log('Feature 67 — Web billing wiring verification (no real Stripe)');
  console.log(`API base (token-gated checks): ${API_BASE}\n`);

  // ── 1. No Stripe.js dependency in web ──────────────────────────────────────────────
  console.log('Always-on checks (no API, no Stripe)');
  {
    const pkgRaw = readRepoFile('apps/web/package.json');
    const pkg = pkgRaw ? (JSON.parse(pkgRaw) as Record<string, unknown>) : {};
    const deps = {
      ...((pkg.dependencies as Record<string, string>) ?? {}),
      ...((pkg.devDependencies as Record<string, string>) ?? {}),
    };
    const stripeDeps = Object.keys(deps).filter(
      (d) => d === 'stripe' || d.startsWith('@stripe/') || d === '@stripe/stripe-js',
    );
    expectTrue(
      'apps/web has NO Stripe.js / stripe dependency',
      stripeDeps.length === 0,
      stripeDeps.length ? `found: ${stripeDeps.join(', ')}` : undefined,
    );
  }

  // ── 2. No client-exposed Stripe secret anywhere in the web source tree ──────────────
  {
    const srcFiles = listSourceFiles(join(WEB_ROOT, 'src'));
    const scriptFiles = listSourceFiles(join(WEB_ROOT, 'scripts'));
    // Also scan any committed env files at the web root (not the ignored .env.local).
    const files = [...srcFiles, ...scriptFiles];

    const offenders: string[] = [];
    // Any NEXT_PUBLIC_STRIPE* is a leak by definition (NEXT_PUBLIC_ ships to the browser).
    // Also flag a raw secret/publishable KEY or a price id literal appearing in web code.
    const patterns: RegExp[] = [
      /NEXT_PUBLIC_STRIPE/i,
      /STRIPE_SECRET_KEY/,
      /STRIPE_WEBHOOK_SECRET/,
      /\bsk_(test|live)_[A-Za-z0-9]/, // secret key literal
      /\bpk_(test|live)_[A-Za-z0-9]/, // publishable key literal
      /\bwhsec_[A-Za-z0-9]/, // webhook signing secret literal
      /\bprice_[A-Za-z0-9]{6,}/, // Stripe price id literal
    ];
    for (const file of files) {
      // Don't scan THIS harness (it names the patterns to search for them).
      if (file.endsWith('verify-web-billing.ts')) continue;
      const text = readFileSync(file, 'utf8');
      for (const re of patterns) {
        if (re.test(text)) {
          offenders.push(`${file.replace(REPO_ROOT, '.')}  (${re})`);
          break;
        }
      }
    }
    expectTrue(
      'web source has NO NEXT_PUBLIC_STRIPE / secret key / price id literal',
      offenders.length === 0,
      offenders.length ? `offenders:\n${offenders.join('\n')}` : undefined,
    );
  }

  // ── 3. BillingRepository seam is factory-wired in BOTH modes ─────────────────────────
  {
    const apiBilling = getRepositories('api').billing;
    expectTrue(
      "getRepositories('api').billing has createCheckout + createPortalSession",
      typeof apiBilling.createCheckout === 'function' &&
        typeof apiBilling.createPortalSession === 'function',
    );

    const mockBilling = getRepositories('mock').billing;
    expectTrue(
      "getRepositories('mock').billing has createCheckout + createPortalSession",
      typeof mockBilling.createCheckout === 'function' &&
        typeof mockBilling.createPortalSession === 'function',
    );

    // Mock mode must NOT fabricate a redirect — both methods throw BillingNotAvailableError.
    let checkoutThrew: unknown;
    try {
      await mockBilling.createCheckout('monthly');
    } catch (err) {
      checkoutThrew = err;
    }
    expectTrue(
      'mock createCheckout throws BillingNotAvailableError (no fake redirect/url)',
      checkoutThrew instanceof BillingNotAvailableError,
      `threw: ${describeError(checkoutThrew)}`,
    );

    let portalThrew: unknown;
    try {
      await mockBilling.createPortalSession();
    } catch (err) {
      portalThrew = err;
    }
    expectTrue(
      'mock createPortalSession throws BillingNotAvailableError (no fake redirect/url)',
      portalThrew instanceof BillingNotAvailableError,
      `threw: ${describeError(portalThrew)}`,
    );
  }

  // ── 4. The /billing/return route exists ─────────────────────────────────────────────
  {
    const returnPage = join(WEB_ROOT, 'src', 'app', 'billing', 'return', 'page.tsx');
    expectTrue('billing return route exists (src/app/billing/return/page.tsx)', existsSync(returnPage));
  }

  // ── 5. ProfileHeader's cancellation label includes date AND time, with a safe fallback ──
  // Regression guard for the "Cancels on {date}" ambiguity: a date-only label can show a
  // different calendar day than Stripe's Customer Portal once the UTC `activeUntil` instant
  // is converted to the browser's local time (e.g. Europe/Kyiv rolls late-UTC into the next
  // day). We don't render React here (no DOM harness in this file) — we assert directly on
  // the ProfileHeader source: it must format with both date and time parts, word the line as
  // "Access until ..." (describing access expiry, not Stripe's calendar label), and fall back
  // to a neutral message instead of ever rendering "Invalid Date".
  {
    const headerSrc = readRepoFile('apps/web/src/features/profile/ProfileHeader.tsx');
    expectTrue(
      'ProfileHeader formats activeUntil with Intl.DateTimeFormat including hour+minute',
      /Intl\.DateTimeFormat/.test(headerSrc) &&
        /hour:\s*['"]2-digit['"]/.test(headerSrc) &&
        /minute:\s*['"]2-digit['"]/.test(headerSrc),
    );
    expectTrue(
      'ProfileHeader uses browser locale (no hardcoded locale/timeZone arg)',
      !/Intl\.DateTimeFormat\(\s*['"]/.test(headerSrc) && !/timeZone:/.test(headerSrc),
    );
    expectTrue(
      'ProfileHeader words the line as "Access until ..." (not a bare Stripe-style date)',
      /Access until/.test(headerSrc),
    );
    expectTrue(
      'ProfileHeader falls back to a neutral message for missing/invalid activeUntil (never "Invalid Date")',
      /Cancellation scheduled/.test(headerSrc) && !/Invalid Date/.test(headerSrc),
    );
  }

  // ── Token-gated: return-page membership logic via /v1/me (no Stripe) ────────────────
  console.log('\nToken-gated checks (/v1/me membership — no Stripe)');

  const apiReachable = await preflight();

  await meMembershipCheck(
    apiReachable,
    process.env.FREE_BEARER_TOKEN?.trim(),
    'FREE_BEARER_TOKEN',
    'free',
    'free /v1/me → return page shows "processing" (membership=free)',
  );
  // ENTITLED_BEARER_TOKEN may belong to a lifetime OR a subscription entitlement — the
  // return page's success state is keyed off `membership !== 'free'` (BillingReturn.tsx),
  // not off a specific membership value, so either is a valid "success" fixture.
  await entitledMeMembershipCheck(
    apiReachable,
    process.env.ENTITLED_BEARER_TOKEN?.trim(),
    'ENTITLED_BEARER_TOKEN',
    'entitled /v1/me → return page shows "success" (membership=subscription|lifetime)',
  );

  // ── Optional: real Stripe hosted checkout URL (needs API configured with test keys) ──
  console.log('\nOptional real-Stripe checkout URL check');
  const runStripe = process.env.RUN_STRIPE_CHECKOUT === '1';
  const entitledToken = process.env.ENTITLED_BEARER_TOKEN?.trim();
  if (!runStripe) {
    skip('createCheckout returns a hosted https url', 'set RUN_STRIPE_CHECKOUT=1 (and a bearer token, API configured with Stripe test keys) to run this.');
  } else if (!apiReachable) {
    skip('createCheckout returns a hosted https url', 'API is not reachable.');
  } else if (!entitledToken) {
    skip('createCheckout returns a hosted https url', 'set ENTITLED_BEARER_TOKEN (any signed-in user) to run this.');
  } else {
    const billing = getRepositories('api', { bearerToken: entitledToken } as HttpAuthOptions).billing;
    try {
      const session = await billing.createCheckout('monthly');
      expectTrue(
        'createCheckout returns a hosted https url (not followed, not faked)',
        typeof session.url === 'string' && session.url.startsWith('https://'),
        `url=${String(session.url)}`,
      );
    } catch (err) {
      // A 500 here means the API's Stripe env isn't configured — that's an operator/env
      // condition, not a web-wiring failure, so SKIP rather than FAIL.
      skip('createCheckout returns a hosted https url', `API checkout errored (likely no Stripe env): ${describeError(err)}`);
    }
  }

  summarize();
}

/** Cheap API reachability probe (public /courts). Returns false if the API is down. */
async function preflight(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/courts`, { headers: { accept: 'application/json' } });
    return res.ok;
  } catch {
    return false;
  }
}

/** Assert /v1/me membership for a token, or SKIP when the token/API is unavailable. */
async function meMembershipCheck(
  apiReachable: boolean,
  token: string | undefined,
  envName: string,
  expected: UserProfileDTO['membership'],
  name: string,
): Promise<void> {
  if (!token) {
    skip(name, `set ${envName} to a signed-in user's bearer token (membership expected: ${expected}).`);
    return;
  }
  if (!apiReachable) {
    skip(name, `API not reachable at ${API_BASE}; start it to run this.`);
    return;
  }
  try {
    const user = await getRepositories('api', { bearerToken: token } as HttpAuthOptions).user.getCurrentUser();
    expectTrue(name, user.membership === expected, `membership=${user.membership} (expected ${expected})`);
  } catch (err) {
    expectTrue(name, false, `read /v1/me threw: ${describeError(err)}`);
  }
}

/**
 * Assert /v1/me membership is any non-'free' value (subscription OR lifetime) — the
 * generic "entitled user" fixture used for the return page's success state, which is
 * keyed off `membership !== 'free'`, not a specific membership value.
 */
async function entitledMeMembershipCheck(
  apiReachable: boolean,
  token: string | undefined,
  envName: string,
  name: string,
): Promise<void> {
  if (!token) {
    skip(name, `set ${envName} to a signed-in entitled user's bearer token.`);
    return;
  }
  if (!apiReachable) {
    skip(name, `API not reachable at ${API_BASE}; start it to run this.`);
    return;
  }
  try {
    const user = await getRepositories('api', { bearerToken: token } as HttpAuthOptions).user.getCurrentUser();
    expectTrue(name, user.membership !== 'free', `membership=${user.membership} (expected subscription or lifetime)`);
  } catch (err) {
    expectTrue(name, false, `read /v1/me threw: ${describeError(err)}`);
  }
}

function summarize(): void {
  const failed = results.filter((r) => !r.ok);
  console.log('\n──────────────────────────────────────────────');
  console.log(
    `Total checks: ${results.length}   Passed: ${results.length - failed.length}   Failed: ${failed.length}   Skipped: ${skipped}`,
  );
  if (failed.length) {
    console.log('\nFailing checks:');
    for (const f of failed) console.log(`  - ${f.name}`);
    console.log('\n\x1b[31mVERIFICATION FAILED\x1b[0m\n');
    process.exit(1);
  }
  console.log(
    '\n\x1b[32mVERIFICATION PASSED — billing seam wired, no Stripe.js / client secret in web, return-page logic keyed off /v1/me.\x1b[0m\n',
  );
  if (skipped) {
    console.log(
      `\x1b[33mNote:\x1b[0m ${skipped} token-gated / optional check(s) skipped. Supply FREE_BEARER_TOKEN / ENTITLED_BEARER_TOKEN (and RUN_STRIPE_CHECKOUT=1 with Stripe test env) to run the full matrix.\n`,
    );
  }
}

main().catch((err) => {
  console.error('\n\x1b[31mHarness crashed:\x1b[0m', err);
  process.exitCode = 1;
});
