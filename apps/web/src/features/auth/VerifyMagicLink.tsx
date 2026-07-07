'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { MailIcon } from './AuthIcons';
import { isApiMode, verifyMagicLink } from './auth-client';

// VerifyMagicLink — the landing island for the emailed magic link (Feature 57).
//
// The API mailer builds the link as `${WEB_APP_URL}/verify?token=...&redirectTo=...`
// (auth.service.ts `buildMagicLinkUrl`). Verify is `POST /v1/auth/verify` with a JSON body
// — a browser can't satisfy that by merely following a GET link, AND the resulting
// httpOnly cookie must be set on the WEB ORIGIN's cookie jar. So this CLIENT island runs
// the verify POST from the browser with `credentials:'include'`: the API's `Set-Cookie`
// then lands on the web origin, and the session is live. On success we navigate to
// `redirectTo` (a safe relative path) or /profile.
//
// WHY CLIENT-SIDE (not a server route handler): the cookie has to be stored by the
// browser. A server-to-API verify would set the cookie on the SERVER's fetch, not the
// user's browser. Doing it from the island is the simplest correct path and needs no
// server proxy route.
//
// MOCK mode has no API; the link won't be generated there, but if someone lands on
// /verify we show a benign "nothing to verify" state rather than calling a missing API.
//
// REDIRECT SAFETY: we only navigate to `redirectTo` when it's a SAME-ORIGIN RELATIVE path
// (starts with a single '/'). The API already allowlisted it at request-link time; this is
// belt-and-suspenders against an open redirect on the client navigation.

function safeRelative(redirectTo: string | null): string {
  if (redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//')) {
    return redirectTo;
  }
  return '/profile';
}

type Status = 'verifying' | 'success' | 'error' | 'no-token';

export function VerifyMagicLink() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const destination = safeRelative(searchParams.get('redirectTo'));

  const [status, setStatus] = useState<Status>('verifying');
  // Guard React StrictMode's double-effect in dev: the token is single-use, so a second
  // verify would 400. Run the POST exactly once.
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    if (!token) {
      setStatus('no-token');
      return;
    }
    if (!isApiMode()) {
      // No API to verify against in mock mode.
      setStatus('no-token');
      return;
    }

    void verifyMagicLink(token)
      .then(() => {
        setStatus('success');
        // Brief beat so the success state is visible, then go to the destination. A full
        // navigation (router.replace) re-runs the now-authenticated server pages, which
        // read /v1/me/* with the freshly-set cookie.
        router.replace(destination);
      })
      .catch(() => setStatus('error'));
  }, [token, destination, router]);

  if (status === 'success') {
    return (
      <div className="fade-in text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-ink">
          <MailIcon width={24} height={24} className="text-bone" />
        </div>
        <h1 className="display-m mt-6 text-ink">You&rsquo;re signed in</h1>
        <p className="body-l mt-3 text-stone">Taking you to your account…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="fade-in text-center">
        <h1 className="display-m text-ink">Link expired</h1>
        <p className="body-l mt-3 text-stone">
          This sign-in link is invalid or has already been used. Request a new one.
        </p>
        <Link href="/signin" className="btn btn-primary mt-6 justify-center">
          Back to sign in
        </Link>
      </div>
    );
  }

  if (status === 'no-token') {
    return (
      <div className="fade-in text-center">
        <h1 className="display-m text-ink">Nothing to verify</h1>
        <p className="body-l mt-3 text-stone">
          Open the sign-in link from your email, or start again.
        </p>
        <Link href="/signin" className="btn btn-primary mt-6 justify-center">
          Go to sign in
        </Link>
      </div>
    );
  }

  // verifying
  return (
    <div className="fade-in text-center">
      <h1 className="display-m text-ink">Signing you in…</h1>
      <p className="body-l mt-3 text-stone">One moment while we verify your link.</p>
    </div>
  );
}
