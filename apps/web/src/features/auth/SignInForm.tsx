'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowIcon, GoogleIcon, MailIcon } from './AuthIcons';
import {
  AuthClientError,
  buildGoogleSignInUrl,
  isApiMode,
  requestMagicLink,
} from './auth-client';
import { InlineSpinner } from '@/components/ui';

// SignInForm — the magic-link sign-in island, ported from `SignIn` in files/signin.html,
// restyled to v3's `AuthGateScreen` (TASK_62: field/button shapes, type sizes, spacing —
// same content and flow as before).
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
// magic-link path already respects). There is no Apple sign-in control (removed in
// TASK_62 — the API has no Apple sign-in; see PHASE_1_PLACEHOLDER_CTA_AUDIT §5).
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
        <h1 className="serif mt-6 text-[28px] font-normal leading-[1.15] text-ink md:text-[32px]">
          Check your inbox
        </h1>
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
      <p className="mb-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-stone">
        Welcome back
      </p>
      <h1 className="serif text-center text-[28px] font-normal leading-[1.15] text-ink md:text-[32px]">
        Sign in to your account
      </h1>
      <p className="mx-auto mt-2.5 max-w-[260px] text-center text-[13px] leading-[1.5] text-stone md:max-w-none">
        Access your saved courts, collections, and membership.
      </p>

      {/* Google is a real full-page navigation to the API's OAuth start route —
          omitted in MOCK mode (no API). There is no Apple control. */}
      {isApiMode() ? (
        <a
          href={buildGoogleSignInUrl(redirectTo)}
          className="mt-7 flex h-12 w-full items-center justify-center gap-2 rounded-md border border-ink/50 bg-transparent text-[12px] font-semibold uppercase tracking-[0.06em] text-ink"
        >
          <GoogleIcon width={15} height={15} /> Continue with Google
        </a>
      ) : (
        <button
          type="button"
          className="mt-7 flex h-12 w-full items-center justify-center gap-2 rounded-md border border-ink/50 bg-transparent text-[12px] font-semibold uppercase tracking-[0.06em] text-ink"
        >
          <GoogleIcon width={15} height={15} /> Continue with Google
        </button>
      )}

      <div className="my-[22px] flex items-center gap-3">
        <span aria-hidden className="h-px flex-1 bg-mist/40" />
        <span className="text-[10px] uppercase tracking-[0.1em] text-stone">OR</span>
        <span aria-hidden className="h-px flex-1 bg-mist/40" />
      </div>

      <form onSubmit={submitMagicLink} noValidate>
        <label
          htmlFor="signin-email"
          className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-stone"
        >
          Email
        </label>
        <div className="mt-1.5 flex h-12 items-center gap-2 rounded-md border border-mist/40 bg-paper px-3.5">
          <MailIcon width={14} height={14} className="shrink-0 text-stone" />
          <input
            id="signin-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="min-w-0 flex-1 border-none bg-transparent text-[14px] text-ink outline-none placeholder:text-stone/60"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          aria-busy={loading}
          aria-disabled={loading || undefined}
          className="btn btn-primary mt-3.5 !h-[50px] w-full justify-center rounded-pill text-[12px] tracking-[0.1em]"
        >
          {loading ? <InlineSpinner label="Sending magic link…" /> : null}
          {loading ? 'Sending…' : 'Send Magic Link'}
          {!loading ? <ArrowIcon width={14} height={14} /> : null}
        </button>
        {error ? (
          <p role="alert" className="body-s mt-3 text-center text-clay">
            {error}
          </p>
        ) : null}
      </form>

      <p className="mt-2.5 text-center text-[11px] text-stone">
        No password needed — we&rsquo;ll email you a secure sign-in link.
      </p>

      <div className="mt-6 border-t border-mist/30 pt-6 text-center">
        <span className="text-[13px] text-stone">New to Tennis World? </span>
        <Link href="/signup" className="text-[13px] font-medium text-ink underline">
          Create an account
        </Link>
      </div>
    </div>
  );
}
