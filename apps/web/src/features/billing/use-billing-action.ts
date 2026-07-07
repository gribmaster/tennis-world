'use client';

// use-billing-action — the shared browser-side hook that drives a billing redirect
// (Feature 67). Both the paywall "Unlock" button and the profile "Manage / Restore"
// controls use it, so the loading/error/auth behavior lives in ONE place.
//
// WHAT IT DOES on click:
//   1. flips to a `pending` state (the button shows a loading label + is disabled),
//   2. calls the billing repo (`createCheckout('lifetime')` or `createPortalSession()`)
//      through `getClientRepositories()` — whose billing repo sends the httpOnly session
//      cookie via `credentials:'include'` in `api` mode,
//   3. on success, navigates the whole browser to the returned hosted URL with
//      `window.location.assign(url)` (a full navigation to Stripe — NOT a client route),
//   4. on `AuthRequiredError` (401), routes to `/signin?redirectTo=<current path>` so the
//      user signs in and returns to where they were,
//   5. on any OTHER failure (HttpError — e.g. a 500 when the API's Stripe env is
//      unconfigured, a 400 for an unoffered plan, or the mock-mode "not available"
//      error), flips to an `error` state and does NOT navigate.
//
// NO Stripe.js, NO publishable key, NO price id — the browser only ever receives an
// opaque hosted `url` and navigates to it. On success the page is UNLOADED (we're leaving
// for Stripe), so there is no "success" resting state to model — `pending` simply stays
// until the navigation happens (or the tab is closed). Only `error` returns control here.

import { useCallback, useState } from 'react';
import type { CheckoutSessionDTO, CustomerPortalSessionDTO } from '@tennis/contracts';
import { getClientRepositories } from '@/lib/repositories.client';
import { AuthRequiredError } from '@/lib/repositories';

/** The action's UI state. `idle` → `pending` → (`error` | navigates away). */
export type BillingActionStatus = 'idle' | 'pending' | 'error';

export interface UseBillingActionResult {
  /** Current status; drives the button's label/disabled state and any error copy. */
  status: BillingActionStatus;
  /** True while the request is in flight (convenience for `status === 'pending'`). */
  pending: boolean;
  /** A safe, user-facing error message when `status === 'error'`; null otherwise. */
  error: string | null;
  /** Start a lifetime checkout: creates the session and navigates to the hosted URL. */
  startCheckout: () => Promise<void>;
  /** Open the customer portal: creates the session and navigates to the hosted URL. */
  openPortal: () => Promise<void>;
}

/**
 * The path (+ query) the user is currently on, used as `redirectTo` after sign-in.
 * Read from `window.location` at click time (client-only). Falls back to '/profile' if
 * somehow unavailable (SSR guard) — a sane private landing spot.
 */
function currentPath(): string {
  if (typeof window === 'undefined') return '/profile';
  return `${window.location.pathname}${window.location.search}`;
}

/** Navigate the whole browser to a hosted (Stripe) URL. Extracted for one call site. */
function navigateTo(url: string): void {
  window.location.assign(url);
}

/** Send the user to sign in, preserving where to return via `?redirectTo`. */
function redirectToSignIn(): void {
  const back = currentPath();
  window.location.assign(`/signin?redirectTo=${encodeURIComponent(back)}`);
}

/**
 * Drive a billing redirect (checkout or portal). Returns the current status + the two
 * actions. Designed for a button: disable while `pending`, show `error` inline when set.
 *
 * A generic message is shown on failure — we NEVER surface the raw API/Stripe error
 * (the service already scrubs provider detail server-side; this is the last guard).
 */
export function useBillingAction(): UseBillingActionResult {
  const [status, setStatus] = useState<BillingActionStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (
      create: () => Promise<CheckoutSessionDTO | CustomerPortalSessionDTO>,
      failureMessage: string,
    ): Promise<void> => {
      // Enter the loading state; the button disables itself on `pending`, which is what
      // actually prevents a double-submit (a second click while the first is in flight).
      setStatus('pending');
      setError(null);
      try {
        // `create()` calls the browser repo set (its billing repo sends the session
        // cookie via `credentials:'include'` in `api` mode; in mock mode it throws
        // BillingNotAvailableError, handled by the generic error branch below).
        const session = await create();
        // Leaving the app for the hosted page — this unloads the page; no success state.
        navigateTo(session.url);
      } catch (err) {
        if (err instanceof AuthRequiredError) {
          // Not signed in (or session expired) — go sign in and come back here.
          redirectToSignIn();
          return; // navigating away; leave status as-is (page is unloading)
        }
        // Any other failure (unconfigured Stripe → 500, unoffered plan → 400, mock mode
        // → BillingNotAvailableError, or a network blip): show a calm inline error and
        // stay put. The raw detail is never surfaced.
        setStatus('error');
        setError(failureMessage);
      }
    },
    [],
  );

  const startCheckout = useCallback(
    () =>
      run(
        () => getClientRepositories().billing.createCheckout('lifetime'),
        'We couldn’t start checkout just now. Please try again in a moment.',
      ),
    [run],
  );

  const openPortal = useCallback(
    () =>
      run(
        () => getClientRepositories().billing.createPortalSession(),
        'We couldn’t open the billing portal just now. Please try again in a moment.',
      ),
    [run],
  );

  return {
    status,
    pending: status === 'pending',
    error,
    startCheckout,
    openPortal,
  };
}
