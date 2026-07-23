'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AppleIcon, ArrowIcon, GoogleIcon, MailIcon } from './AuthIcons';
import {
  AuthClientError,
  buildGoogleSignInUrl,
  isApiMode,
  requestMagicLink,
} from './auth-client';

// SignInForm — the magic-link sign-in island, ported from `SignIn` in files/signin.html.
//
// AUTH (Feature 57): in `api` mode, submitting POSTs `/v1/auth/request-link` with the
// email (+ `redirectTo` from the query string, if present, so verify can return the user
// to where sign-in was triggered). The API always answers 202 `{ ok: true }` regardless of
// whether the email has an account (no enumeration), so we ALWAYS flip to the generic
// "Check your inbox" success on a 2xx — success copy reveals nothing. A network/validation
// failure shows an inline error instead. In MOCK mode there is no API, so we keep the
// original cosmetic delay → success (no fetch).
//
// GOOGLE OAUTH: the Google button is a plain full-page navigation (`<a href>`, NOT a
// fetch/onClick) to `GET ${API_BASE_URL}/auth/google?redirectTo=...` — the API responds
// with a 302 to Google's consent screen, so this can only be a real browser navigation.
// In MOCK mode there's no API, so the link is omitted (same "no API" boundary the
// magic-link path already respects). The Apple button stays an INERT placeholder (Apple
// sign-in is out of scope; recorded in PHASE_1_PLACEHOLDER_CTA_AUDIT §5).
//
// State is local React state (email, `sent`, `loading`, `error`) discarded on unmount.

export function SignInForm() {
  const searchParams = useSearchParams();
  // Where to return after verify (e.g. /profile when redirected here by a private page).
  // The API allowlists it server-side before honoring it, so an untrusted value is safe.
  const redirectTo = searchParams.get('redirectTo') ?? undefined;

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setError(null);
    setLoading(true);

    if (!isApiMode()) {
      // MOCK mode — no API. Keep the prototype's cosmetic delay → success.
      setTimeout(() => {
        setLoading(false);
        setSent(true);
      }, 700);
      return;
    }

    try {
      await requestMagicLink(trimmed, redirectTo);
      // Generic success even on 202 (no enumeration) — see header.
      setSent(true);
    } catch (err) {
      setError(
        err instanceof AuthClientError && err.status === 400
          ? 'Please enter a valid email address.'
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="fade-in text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-ink">
          <MailIcon width={24} height={24} className="text-bone" />
        </div>
        <h1 className="display-m mt-6 text-ink">Check your inbox</h1>
        <p className="body-l mt-3 text-stone">
          We&rsquo;ve sent a sign-in link to
          <br />
          <strong className="text-ink">{email}</strong>
        </p>
        <button
          type="button"
          onClick={() => {
            setSent(false);
            setError(null);
          }}
          className="btn btn-ghost mt-6 text-stone"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <p className="eyebrow text-center text-stone">Welcome back</p>
      <h1 className="display-l mt-3 text-center text-ink">Sign in to your account</h1>
      <p className="body-m mt-3 text-center text-stone">
        Access your saved courts, collections, and membership.
      </p>

      {/* Apple stays an inert placeholder (out of scope). Google is a real full-page
          navigation to the API's OAuth start route — omitted in MOCK mode (no API). */}
      <div className="mt-10 flex flex-col gap-2.5">
        <button type="button" className="btn btn-secondary w-full justify-center gap-2.5">
          <AppleIcon width={16} height={16} /> Continue with Apple
        </button>
        {isApiMode() ? (
          <a
            href={buildGoogleSignInUrl(redirectTo)}
            className="btn btn-secondary w-full justify-center gap-2.5"
          >
            <GoogleIcon width={16} height={16} /> Continue with Google
          </a>
        ) : (
          <button type="button" className="btn btn-secondary w-full justify-center gap-2.5">
            <GoogleIcon width={16} height={16} /> Continue with Google
          </button>
        )}
      </div>

      <div className="my-7 flex items-center gap-3">
        <span aria-hidden className="h-px flex-1 bg-hairline" />
        <span className="eyebrow text-mist">or</span>
        <span aria-hidden className="h-px flex-1 bg-hairline" />
      </div>

      <form onSubmit={submitMagicLink} noValidate>
        <label htmlFor="signin-email" className="eyebrow mb-2 block text-stone">
          Email
        </label>
        <div className="flex h-[52px] items-center gap-2.5 border border-hairline bg-ivory px-4">
          <MailIcon width={16} height={16} className="shrink-0 text-stone" />
          <input
            id="signin-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="body-m min-w-0 flex-1 border-none bg-transparent text-ink outline-none placeholder:text-stone/60"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary mt-3.5 w-full justify-center"
        >
          {loading ? 'Sending…' : 'Send Magic Link'}
          {!loading ? <ArrowIcon width={14} height={14} /> : null}
        </button>
        {error ? (
          <p role="alert" className="body-s mt-3 text-center text-clay">
            {error}
          </p>
        ) : null}
      </form>

      <p className="body-s mt-7 text-center text-stone">
        No password needed — we&rsquo;ll email you a secure sign-in link.
      </p>

      <div className="mt-9 border-t border-hairline pt-7 text-center">
        <span className="body-m text-stone">New to Tennis World? </span>
        <Link href="/signup" className="body-m font-medium text-ink underline">
          Create an account
        </Link>
      </div>
    </div>
  );
}
