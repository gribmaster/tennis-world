'use client';

// BillingReturn — the post-checkout landing island (Feature 67, /billing/return).
//
// After a hosted Stripe Checkout, Stripe redirects the browser back to the configured
// success URL. Point `STRIPE_SUCCESS_URL` at `${WEB_APP_URL}/billing/return` (see the
// route file). This island then re-reads `/v1/me` to see whether the purchase has been
// fulfilled — membership flips `free → lifetime` when the signature-verified webhook
// (Feature 66) has created the Entitlement.
//
// THE RACE (task 6): the browser redirect and the Stripe webhook are INDEPENDENT and can
// arrive in either order. So on the first read membership may still be `free` even though
// the payment succeeded — the webhook just hasn't landed yet. We therefore POLL `/v1/me`
// a small, BOUNDED number of times with a short delay; the moment it reports `lifetime`
// we show success. If it's still `free` after the last attempt we show a calm
// "payment is processing" state (NOT a failure) with a manual re-check + links out. There
// is NO infinite polling — the loop stops after `MAX_ATTEMPTS`.
//
// CANCEL (task 6): a cancelled Checkout comes back with `?status=cancelled` (the route's
// documented cancel target). That's handled up-front — no polling, a neutral "checkout
// cancelled" message. (The API's DEFAULT cancel URL is `/profile?checkout=cancelled`;
// operators who point the cancel URL here get the same message.)
//
// AUTH: the read uses `getClientRepositories().user.getCurrentUser()`, whose user repo
// sends the httpOnly session cookie (`credentials:'include'`) in `api` mode. A logged-out
// visitor (no/expired cookie) 401s → we show a sign-in prompt (the return page is only
// meaningful for the user who checked out). In MOCK mode there's no API/entitlement seam,
// so `/v1/me` is the static mock user (`free`) — the page settles into the processing
// state, which is the honest "can't confirm here" outcome for mock mode.
//
// NO real Stripe is needed to exercise this page: every state is driven purely by what
// `/v1/me` returns (and the `?status` query), so a seeded lifetime user shows success and
// a free user shows processing — see scripts/verify-web-billing.ts.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getClientRepositories } from '@/lib/repositories.client';
import { AuthRequiredError } from '@/lib/repositories';

// Bounded polling: total worst-case wait ≈ MAX_ATTEMPTS × POLL_INTERVAL_MS. The first
// read happens immediately; subsequent reads are spaced by the interval. Kept short so a
// stuck webhook resolves to the "processing" state quickly rather than hanging the UI.
const MAX_ATTEMPTS = 6;
const POLL_INTERVAL_MS = 2000;

type ReturnState =
  | 'checking' // reading /v1/me (initial or a poll in flight)
  | 'success' // membership === 'lifetime'
  | 'processing' // still 'free' after MAX_ATTEMPTS (webhook race — not a failure)
  | 'cancelled' // ?status=cancelled
  | 'signed-out' // /v1/me 401 (no session)
  | 'error'; // an unexpected fault reading /v1/me

/** Sleep helper for the bounded poll. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function BillingReturn() {
  const searchParams = useSearchParams();
  const cancelled = searchParams.get('status') === 'cancelled';

  const [state, setState] = useState<ReturnState>(cancelled ? 'cancelled' : 'checking');
  const [attempts, setAttempts] = useState(0);
  // Cancels an in-flight poll loop when the component unmounts (or a manual recheck
  // supersedes it), so we never setState after unmount and never leak a running loop.
  const cancelledRef = useRef(false);

  // The bounded poll. Reads /v1/me up to MAX_ATTEMPTS times; resolves to success the moment
  // membership is 'lifetime', else settles into 'processing'. A 401 → 'signed-out'; any
  // other throw → 'error'. Runs immediately, then spaced by POLL_INTERVAL_MS.
  const runPoll = useCallback(async () => {
    cancelledRef.current = false;
    setState('checking');
    setAttempts(0);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      if (cancelledRef.current) return;
      setAttempts(attempt);
      try {
        const user = await getClientRepositories().user.getCurrentUser();
        if (cancelledRef.current) return;
        if (user.membership === 'lifetime') {
          setState('success');
          return;
        }
      } catch (err) {
        if (cancelledRef.current) return;
        if (err instanceof AuthRequiredError) {
          setState('signed-out');
          return;
        }
        setState('error');
        return;
      }
      // Still 'free'. Wait before the next attempt (skip the wait after the last one).
      if (attempt < MAX_ATTEMPTS) {
        await delay(POLL_INTERVAL_MS);
      }
    }
    if (cancelledRef.current) return;
    // Exhausted the attempts and never saw 'lifetime' — the webhook likely hasn't landed
    // yet. This is the RACE outcome, not a failure: show the processing state.
    setState('processing');
  }, []);

  useEffect(() => {
    if (cancelled) return; // no polling for a cancelled checkout
    void runPoll();
    return () => {
      cancelledRef.current = true;
    };
  }, [cancelled, runPoll]);

  // ── States ──────────────────────────────────────────────────────────────────────

  if (state === 'cancelled') {
    return (
      <ReturnShell
        eyebrow="Checkout"
        title="Checkout cancelled"
        body="No payment was taken. You can pick up where you left off whenever you’re ready."
      >
        <Link href="/profile" className="btn btn-primary justify-center">
          Back to your profile
        </Link>
      </ReturnShell>
    );
  }

  if (state === 'success') {
    return (
      <ReturnShell
        eyebrow="Membership"
        title="You’re unlocked."
        body="Your membership is active — exact locations, the full atlas, and every collection are now open across Tennis World."
      >
        <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Link href="/profile" className="btn btn-primary justify-center">
            Go to your profile
          </Link>
          <Link href="/map" className="btn justify-center border border-hairline">
            Explore the map
          </Link>
        </div>
      </ReturnShell>
    );
  }

  if (state === 'processing') {
    return (
      <ReturnShell
        eyebrow="Membership"
        title="Your payment is processing"
        body="Thanks — your payment went through and we’re just finishing setting up your membership. This usually takes a few moments; it will unlock automatically. You can check again now or head to your profile."
      >
        <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => void runPoll()}
            className="btn btn-primary justify-center"
          >
            Check again
          </button>
          <Link href="/profile" className="btn justify-center border border-hairline">
            Go to your profile
          </Link>
        </div>
      </ReturnShell>
    );
  }

  if (state === 'signed-out') {
    return (
      <ReturnShell
        eyebrow="Membership"
        title="Sign in to confirm your membership"
        body="We couldn’t confirm your session here. Sign in and we’ll take you straight to your profile, where your membership will be up to date."
      >
        <Link
          href="/signin?redirectTo=/profile"
          className="btn btn-primary justify-center"
        >
          Sign in
        </Link>
      </ReturnShell>
    );
  }

  if (state === 'error') {
    return (
      <ReturnShell
        eyebrow="Membership"
        title="We couldn’t check your membership"
        body="Something went wrong confirming your membership just now. Your payment isn’t affected — try again, or open your profile."
      >
        <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => void runPoll()}
            className="btn btn-primary justify-center"
          >
            Try again
          </button>
          <Link href="/profile" className="btn justify-center border border-hairline">
            Go to your profile
          </Link>
        </div>
      </ReturnShell>
    );
  }

  // checking (initial read / a poll in flight)
  return (
    <ReturnShell
      eyebrow="Membership"
      title="Confirming your membership…"
      body="One moment while we finish unlocking your account."
    >
      <p className="body-s text-stone" aria-live="polite">
        Checking… (attempt {attempts} of {MAX_ATTEMPTS})
      </p>
    </ReturnShell>
  );
}

/** Shared centered layout for every return state (eyebrow + serif title + body + actions). */
function ReturnShell({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="fade-in mx-auto max-w-[560px] text-center">
      <div className="eyebrow text-gold">{eyebrow}</div>
      <h1 className="display-l mt-3 text-ink">{title}</h1>
      <p className="body-l mt-4 text-graphite">{body}</p>
      {children ? <div className="mt-8">{children}</div> : null}
    </div>
  );
}
