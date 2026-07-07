'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AppleIcon, ArrowIcon, GoogleIcon, MailIcon } from './AuthIcons';
import { AuthClientError, isApiMode, requestMagicLink } from './auth-client';

// SignUpForm — the name+email sign-up island, ported from `SignUp` in files/signup.html.
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
// MOCK mode keeps the original cosmetic delay → success (no fetch). Apple/Google stay INERT.

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
        <h1 className="display-m mt-6 text-ink">Confirm your email</h1>
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
      <p className="eyebrow text-center text-stone">Join Tennis World</p>
      <h1 className="display-l mt-3 text-center text-ink">Create your account</h1>
      <p className="body-m mt-3 text-center text-stone">
        Save courts, build collections, and unlock the full atlas.
      </p>

      {/* Inert OAuth placeholders — no real Apple/Google sign-up in Phase 1 (no OAuth). */}
      <div className="mt-10 flex flex-col gap-2.5">
        <button type="button" className="btn btn-secondary w-full justify-center gap-2.5">
          <AppleIcon width={16} height={16} /> Continue with Apple
        </button>
        <button type="button" className="btn btn-secondary w-full justify-center gap-2.5">
          <GoogleIcon width={16} height={16} /> Continue with Google
        </button>
      </div>

      <div className="my-7 flex items-center gap-3">
        <span aria-hidden className="h-px flex-1 bg-hairline" />
        <span className="eyebrow text-mist">or</span>
        <span aria-hidden className="h-px flex-1 bg-hairline" />
      </div>

      <form onSubmit={submit} noValidate>
        <div className="mb-[18px]">
          <label htmlFor="signup-name" className="eyebrow mb-2 block text-stone">
            Name
          </label>
          <input
            id="signup-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Eleanor Morgan"
            className="body-m h-[52px] w-full border border-hairline bg-ivory px-4 text-ink outline-none placeholder:text-stone/60"
          />
        </div>
        <div>
          <label htmlFor="signup-email" className="eyebrow mb-2 block text-stone">
            Email
          </label>
          <div className="flex h-[52px] items-center gap-2.5 border border-hairline bg-ivory px-4">
            <MailIcon width={16} height={16} className="shrink-0 text-stone" />
            <input
              id="signup-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="body-m min-w-0 flex-1 border-none bg-transparent text-ink outline-none placeholder:text-stone/60"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary mt-[22px] w-full justify-center"
        >
          {loading ? 'Creating…' : 'Create Account'}
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
        <span className="body-m text-stone">Already have an account? </span>
        <Link href="/signin" className="body-m font-medium text-ink underline">
          Sign in
        </Link>
      </div>
    </div>
  );
}
