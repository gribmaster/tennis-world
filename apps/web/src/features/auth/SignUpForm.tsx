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

// SignUpForm — the name+email sign-up island, ported from `SignUp` in files/signup.html,
// restyled to v3's `AuthGateScreen` (TASK_62: field/button shapes, type sizes, spacing —
// same content and flow as before).
//
// AUTH (Feature 57): magic-link auth is PASSWORDLESS and account creation is implicit — the
// API upserts the User on first verify. So "sign up" and "sign in" hit the SAME endpoint:
// in `api` mode, submitting POSTs `/v1/auth/request-link` with the email (+ `redirectTo`).
//
// NAME — DELIBERATELY NOT SENT (documented): the `request-link` contract is `{ email,
// redirectTo? }` only — it has no `name` field, and inventing one is out of scope (no API
// changes). We still COLLECT + require name for prototype parity and a future profile step:
// once verified, the user can set their name via `PATCH /v1/me` (Feature 53) — wiring that
// onboarding step is a follow-on. Until then the entered name is intentionally discarded
// here. (No enumeration: success is generic on any 2xx.)
//
// MOCK mode keeps the original cosmetic delay → success (no fetch). Google is a real
// full-page navigation to the API's OAuth start route (see SignInForm's header comment for
// the same reasoning — omitted in MOCK mode, no API to redirect to). There is no Apple
// sign-in control (removed in TASK_62 — the API has no Apple sign-in).

export function SignUpForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') ?? undefined;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !name.trim()) return;
    setError(null);
    setLoading(true);

    if (!isApiMode()) {
      setTimeout(() => {
        setLoading(false);
        setSent(true);
      }, 700);
      return;
    }

    try {
      // Name is NOT sent (contract has no field — see header). Email + redirectTo only.
      await requestMagicLink(trimmedEmail, redirectTo);
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
          Confirm your email
        </h1>
        <p className="body-l mt-3 text-stone">
          We&rsquo;ve sent a confirmation link to
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
        Join Tennis World
      </p>
      <h1 className="serif text-center text-[28px] font-normal leading-[1.15] text-ink md:text-[32px]">
        Create your account
      </h1>
      <p className="mx-auto mt-2.5 max-w-[260px] text-center text-[13px] leading-[1.5] text-stone md:max-w-none">
        Save courts, build collections, and unlock the full atlas.
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

      <form onSubmit={submit} noValidate>
        <div className="mb-4">
          <label
            htmlFor="signup-name"
            className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-stone"
          >
            Name
          </label>
          <div className="mt-1.5 flex h-12 items-center gap-2 rounded-md border border-mist/40 bg-paper px-3.5">
            <input
              id="signup-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Eleanor Morgan"
              className="min-w-0 flex-1 border-none bg-transparent text-[14px] text-ink outline-none placeholder:text-stone/60"
            />
          </div>
        </div>
        <div>
          <label
            htmlFor="signup-email"
            className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-stone"
          >
            Email
          </label>
          <div className="mt-1.5 flex h-12 items-center gap-2 rounded-md border border-mist/40 bg-paper px-3.5">
            <MailIcon width={14} height={14} className="shrink-0 text-stone" />
            <input
              id="signup-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="min-w-0 flex-1 border-none bg-transparent text-[14px] text-ink outline-none placeholder:text-stone/60"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={loading}
          aria-busy={loading}
          aria-disabled={loading || undefined}
          className="btn btn-primary mt-3.5 !h-[50px] w-full justify-center rounded-pill text-[12px] tracking-[0.1em]"
        >
          {loading ? <InlineSpinner label="Creating account…" /> : null}
          {loading ? 'Creating…' : 'Create Account'}
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
        <span className="text-[13px] text-stone">Already have an account? </span>
        <Link href="/signin" className="text-[13px] font-medium text-ink underline">
          Sign in
        </Link>
      </div>
    </div>
  );
}
