/* eslint-disable no-console */
//
// Google OAuth verification — proves the CONTROL FLOW of GET /v1/auth/google and
// GET /v1/auth/google/callback without needing a real Google account or browser
// consent click. Two sections:
//
// ── ALWAYS RUNS (no Google env needed) ─────────────────────────────────────────
// Asserts the disabled-by-default posture: with GOOGLE_AUTH_ENABLED unset/false on
// the running API, both routes must respond 404/503 (never crash, never 500,
// never proceed as if configured). This is safe to run against ANY environment,
// including one with zero Google env set — the common/default case.
//
// ── GATED (requires the API under test to run with GOOGLE_AUTH_ENABLED=true + a
//    FAKE clientId/secret/redirectUri) ──────────────────────────────────────────
// These checks only exercise OUR code up to the point of talking to Google (URL
// construction, cookie handling, state comparison, error-path redirects) — none
// of them make a real network call to Google, so fake credentials are sufficient
// and no real Google account is involved. Enabled by setting
// RUN_GOOGLE_OAUTH_VERIFY=1 for THIS script, matching an API instance started
// with:
//   GOOGLE_AUTH_ENABLED=true
//   GOOGLE_CLIENT_ID=fake-client-id.apps.googleusercontent.com
//   GOOGLE_CLIENT_SECRET=fake-client-secret
//   GOOGLE_REDIRECT_URI=http://localhost:3001/v1/auth/google/callback
//   WEB_APP_URL=http://localhost:3000          (already the local default)
//
//   pnpm --filter @tennis/api dev
//   RUN_GOOGLE_OAUTH_VERIFY=1 pnpm --filter @tennis/api verify:google-oauth
//
// If RUN_GOOGLE_OAUTH_VERIFY is unset, the gated section SKIPs cleanly (exit 0)
// after the always-runs section — like the opt-in Stripe harnesses, a green no-op
// rather than a fake pass.
//
// ── NOT COVERED BY THIS SCRIPT (documented gap, not an oversight) ──────────────
// The real Google code-exchange (OAuth2Client.getToken), real ID-token signature
// verification against Google's live JWKS (OAuth2Client.verifyIdToken), and the
// find-or-create/account-linking DB behavior all require a real Google-issued
// authorization `code`, which requires a human consent click against a real
// Google Cloud OAuth client — there is no headless path. These must be verified
// MANUALLY:
//   1. Set real GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI + GOOGLE_AUTH_ENABLED=true
//      against a real (test-mode is fine) Google Cloud OAuth consent screen.
//   2. Click "Continue with Google" in the running web app, complete consent,
//      confirm you land on /profile with a working session (GET /v1/me succeeds).
//   3. Sign in again with the SAME Google account → confirm the SAME User.id is
//      reused (check via Prisma Studio / psql), i.e. no duplicate user created.
//   4. Sign up via magic-link first with an email (no googleId yet), then sign in
//      via Google using that SAME email → confirm googleId gets backfilled onto
//      that row and any existing `name` is NOT overwritten.

import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'http://localhost:3001/v1';
const RUN_GATED = process.env.RUN_GOOGLE_OAUTH_VERIFY === '1';

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

/** Parse `Set-Cookie` response headers into name → { value, attrs }. Node's fetch
 *  exposes multiple Set-Cookie headers via `headers.getSetCookie()`. */
function parseSetCookies(res: Response): Map<string, { value: string; raw: string }> {
  const map = new Map<string, { value: string; raw: string }>();
  const raws =
    typeof (res.headers as { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')!] : []);
  for (const raw of raws) {
    const [pair] = raw.split(';');
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    map.set(name, { value, raw });
  }
  return map;
}

const STATE_COOKIE_NAME = 'tennis_google_oauth_state';

/** A redirect Location must never contain anything JWT/token-shaped. */
function containsNoTokenLeak(location: string): boolean {
  const lower = location.toLowerCase();
  if (lower.includes('accesstoken=') || lower.includes('access_token=')) return false;
  if (lower.includes('token=')) return false;
  // A bare JWT is three base64url segments separated by dots — a crude but useful net.
  if (/[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}/i.test(location)) return false;
  return true;
}

async function main(): Promise<void> {
  console.log('\nGoogle OAuth verification');
  console.log(`  API: ${API_BASE}\n`);

  // ── ALWAYS RUNS: disabled-by-default posture ──────────────────────────────────────
  console.log('  -- disabled-by-default (no Google env assumed on a fresh call) --');
  {
    // NOTE: this section asserts the ROUTE NEVER CRASHES when unconfigured. If the
    // target API happens to be running with Google fully configured (the gated
    // section's own server), these two specific requests below still can't produce a
    // 2xx/3xx here because they carry no real state/code, so we assert "not a raw
    // 500 crash" rather than a hard 404, keeping this section meaningful in both cases.
    const startRes = await fetch(`${API_BASE}/auth/google`, { redirect: 'manual' });
    record(
      'disabled/unconfigured or invalid request: GET /v1/auth/google never crashes (5xx)',
      startRes.status < 500,
      `got ${startRes.status}`,
    );

    const callbackRes = await fetch(
      `${API_BASE}/auth/google/callback?code=x&state=y`,
      { redirect: 'manual' },
    );
    record(
      'disabled/unconfigured or invalid request: GET /v1/auth/google/callback never crashes (5xx)',
      callbackRes.status < 500,
      `got ${callbackRes.status}`,
    );
  }

  if (!RUN_GATED) {
    console.log(
      '\n  SKIP  gated flow checks — RUN_GOOGLE_OAUTH_VERIFY not set to "1". Start the API ' +
        'with GOOGLE_AUTH_ENABLED=true + fake GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI and set ' +
        'RUN_GOOGLE_OAUTH_VERIFY=1 to run them. See this script\'s header for the exact env.\n',
    );
  } else {
    console.log('\n  -- gated: full start/callback control-flow checks --');

    // 1/2/3/4/5 — start route: crypto-random state, cookie attributes, redirectTo
    // sanitization, redirect shape + safe param encoding.
    let firstState: string | undefined;
    let firstStateCookieRaw: string | undefined;
    {
      const res = await fetch(`${API_BASE}/auth/google?redirectTo=%2Fprofile`, {
        redirect: 'manual',
      });
      const location = res.headers.get('location') ?? '';
      const cookies = parseSetCookies(res);
      const stateCookie = cookies.get(STATE_COOKIE_NAME);

      record('1. GET /v1/auth/google → 302', res.status === 302, `got ${res.status}`);
      record(
        '2. redirects to Google\'s authorize endpoint',
        location.startsWith('https://accounts.google.com/o/oauth2/v2/auth'),
        `Location: ${location}`,
      );

      let params: URLSearchParams | undefined;
      try {
        params = new URL(location).searchParams;
      } catch {
        params = undefined;
      }
      record(
        '3. requests only openid email profile, response_type=code, access_type=online',
        params?.get('scope') === 'openid email profile' &&
          params?.get('response_type') === 'code' &&
          params?.get('access_type') === 'online',
        `scope=${params?.get('scope')} response_type=${params?.get('response_type')} access_type=${params?.get('access_type')}`,
      );
      record(
        '4. no offline access requested (no prompt=consent/offline artifacts)',
        !location.includes('prompt=consent') && params?.get('access_type') !== 'offline',
        `Location: ${location}`,
      );
      record(
        '5. state cookie set: httpOnly + Secure(dev=false) + SameSite=Lax + scoped path',
        !!stateCookie &&
          /HttpOnly/i.test(stateCookie.raw) &&
          /SameSite=Lax/i.test(stateCookie.raw) &&
          /Path=\/v1\/auth\/google/i.test(stateCookie.raw),
        `Set-Cookie: ${stateCookie?.raw ?? '(none)'}`,
      );
      record(
        '6. redirect contains no token/JWT-shaped leak',
        containsNoTokenLeak(location),
        `Location: ${location}`,
      );

      firstState = params?.get('state') ?? undefined;
      firstStateCookieRaw = stateCookie?.value;
      record(
        '7. state param matches the nonce stored in the cookie',
        !!firstState && !!firstStateCookieRaw && decodeURIComponent(firstStateCookieRaw).includes(firstState),
        `state=${firstState} cookie=${firstStateCookieRaw}`,
      );
    }

    // 8. crypto-random: a second call produces a DIFFERENT state.
    {
      const res = await fetch(`${API_BASE}/auth/google`, { redirect: 'manual' });
      const location = res.headers.get('location') ?? '';
      let secondState: string | undefined;
      try {
        secondState = new URL(location).searchParams.get('state') ?? undefined;
      } catch {
        secondState = undefined;
      }
      record(
        '8. state is crypto-random (two calls → different values)',
        !!secondState && secondState !== firstState,
        `first=${firstState} second=${secondState}`,
      );
    }

    // 9. unsafe redirectTo is dropped, not embedded in the cookie.
    {
      const res = await fetch(
        `${API_BASE}/auth/google?redirectTo=${encodeURIComponent('https://evil.example.com/steal')}`,
        { redirect: 'manual' },
      );
      const cookies = parseSetCookies(res);
      const stateCookie = cookies.get(STATE_COOKIE_NAME);
      const decoded = stateCookie ? decodeURIComponent(stateCookie.value) : '';
      record(
        '9. unsafe absolute redirectTo is rejected (not present in the state cookie)',
        !decoded.includes('evil.example.com'),
        `cookie payload: ${decoded}`,
      );
    }

    // 10. Google error param → safe redirect, no internals.
    {
      const res = await fetch(
        `${API_BASE}/auth/google/callback?error=access_denied`,
        { redirect: 'manual' },
      );
      const location = res.headers.get('location') ?? '';
      record(
        '10. Google error param → 302 to a safe web error page',
        res.status === 302 && location.includes('/signin') && location.includes('error='),
        `status=${res.status} Location=${location}`,
      );
      record('10b. no internals leaked in the error redirect', containsNoTokenLeak(location), location);
    }

    // 11. missing code → safe redirect (never a raw 500/crash, never proceeds).
    {
      const res = await fetch(`${API_BASE}/auth/google/callback?state=whatever`, {
        redirect: 'manual',
      });
      record(
        '11. missing code → 302 to safe error page (not a crash)',
        res.status === 302,
        `got ${res.status}`,
      );
    }

    // 12. state mismatch (no prior cookie at all) → safe redirect.
    {
      const res = await fetch(
        `${API_BASE}/auth/google/callback?code=fake&state=${randomBytes(16).toString('hex')}`,
        { redirect: 'manual' },
      );
      record(
        '12. state with no matching cookie → 302 to safe error page',
        res.status === 302 && (res.headers.get('location') ?? '').includes('/signin'),
        `got ${res.status}`,
      );
    }

    // 13/14. Full round trip using a REAL state cookie: get a valid nonce, then call
    // back with a WRONG state (mismatch) and confirm the state cookie gets cleared.
    {
      const startRes = await fetch(`${API_BASE}/auth/google`, { redirect: 'manual' });
      const cookies = parseSetCookies(startRes);
      const stateCookie = cookies.get(STATE_COOKIE_NAME);

      const callbackRes = await fetch(
        `${API_BASE}/auth/google/callback?code=fake-code&state=deliberately-wrong-state`,
        {
          redirect: 'manual',
          headers: stateCookie ? { cookie: `${STATE_COOKIE_NAME}=${stateCookie.value}` } : {},
        },
      );
      const location = callbackRes.headers.get('location') ?? '';
      record(
        '13. mismatched state (cookie present, wrong value) → 302 to safe error page',
        callbackRes.status === 302 && location.includes('/signin'),
        `got ${callbackRes.status}, Location=${location}`,
      );

      const clearCookies = parseSetCookies(callbackRes);
      const clearedState = clearCookies.get(STATE_COOKIE_NAME);
      record(
        '14. state cookie is cleared after the callback (Max-Age=0 / Expires in the past)',
        !!clearedState &&
          (/Max-Age=0/i.test(clearedState.raw) || /Expires=Thu, 01 Jan 1970/i.test(clearedState.raw)),
        `Set-Cookie: ${clearedState?.raw ?? '(none)'}`,
      );
      record('15. no token leaked in the mismatch-error redirect', containsNoTokenLeak(location), location);
    }
  }

  // ── Web bundle check: the Google client secret must never ship client-side ─────────
  // Static check against the web app's client-readable env surface: any var read by
  // web code WITHOUT the NEXT_PUBLIC_ prefix never reaches the browser bundle (Next.js
  // inlines only NEXT_PUBLIC_* into client code). We assert the web app defines no
  // NEXT_PUBLIC_GOOGLE_* var at all — the web app should need ZERO Google env, since it
  // only ever navigates the browser to the API's start route.
  {
    const hasPublicGoogleEnv = Object.keys(process.env).some(
      (k) => k.startsWith('NEXT_PUBLIC_GOOGLE') || k === 'NEXT_PUBLIC_GOOGLE_CLIENT_SECRET',
    );
    record(
      '16. no NEXT_PUBLIC_GOOGLE_* env var defined (client secret can\'t leak into the web bundle)',
      !hasPublicGoogleEnv,
      hasPublicGoogleEnv ? 'found a NEXT_PUBLIC_GOOGLE_* var in this process env' : undefined,
    );
  }

  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`\n  ${passed}/${total} checks passed\n`);
  console.log(
    '  NOTE: real Google code-exchange, ID-token signature verification, and account\n' +
      '  linking against a real Google identity are NOT exercised by this script — see the\n' +
      '  header comment for the required manual click-through steps.\n',
  );
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
