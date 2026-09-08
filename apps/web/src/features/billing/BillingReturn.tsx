'use client';

// BillingReturn — the post-checkout landing island (Feature 67, /billing/return).
//
// After a hosted Stripe Checkout, Stripe redirects the browser back to the configured
// success URL. Point `STRIPE_SUCCESS_URL` at `${WEB_APP_URL}/billing/return` (see the
// route file). This island then re-reads `/v1/me` to see whether the purchase has been
// fulfilled — membership flips `free → subscription` (or `lifetime`) when the
// signature-verified webhook (Feature 66) has created the Entitlement.
//
// THE RACE (task 6): the browser redirect and the Stripe webhook are INDEPENDENT and can
// arrive in either order. So on the first read membership may still be `free` even though
// the payment succeeded — the webhook just hasn't landed yet. We therefore POLL `/v1/me`
// a small, BOUNDED number of times with a short delay; the moment it reports anything
// other than `free` we show success. If it's still `free` after the last attempt we show a
// calm "payment is processing" state (NOT a failure) with a manual re-check + links out.
// There is NO infinite polling — the loop stops after `MAX_ATTEMPTS`.
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
//
// VISUAL DESIGN (Feature 83, `docs/FEATURE_71_DESIGN_V2_INTAKE.md` §2.9/§2.10): the
// prototype's `PurchaseSuccessScreen`/`PurchaseFailedScreen` only modeled TWO states
// (static, no polling). This screen has SIX. The state machine above is untouched — this
// change only restyles what each state renders. See `ReturnHero`/`ReturnShell` below for
// the six-state → screen mapping, and the header comment on each `if (state === …)`
// branch for why that state looks the way it does.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { getClientRepositories } from '@/lib/repositories.client';
import { AuthRequiredError } from '@/lib/repositories';
import { BackButton, PendingLink, useElementPending } from '@/components/navigation';
import { InlineSpinner } from '@/components/ui';

// Bounded polling: total worst-case wait ≈ MAX_ATTEMPTS × POLL_INTERVAL_MS. The first
// read happens immediately; subsequent reads are spaced by the interval. Kept short so a
// stuck webhook resolves to the "processing" state quickly rather than hanging the UI.
const MAX_ATTEMPTS = 6;
const POLL_INTERVAL_MS = 2000;

type ReturnState =
  | 'checking' // reading /v1/me (initial or a poll in flight)
  | 'success' // membership !== 'free' (subscription or lifetime)
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

  // Always starts at 'checking' — including for a cancelled checkout, which the effect
  // below switches to 'cancelled' on mount. Initialising straight to 'cancelled' meant
  // this island never re-rendered after hydration (it was already showing the right
  // thing), and the route's <Suspense> boundary was therefore never resolved on the
  // client: the visitor kept the "Confirming your membership…" fallback on screen while
  // the real "Checkout cancelled" markup sat in the DOM under display:none. Every other
  // state reaches the screen through a post-mount setState from the poll; this makes
  // 'cancelled' behave the same way. No polling is added for a cancelled checkout.
  const [state, setState] = useState<ReturnState>('checking');
  const [attempts, setAttempts] = useState(0);
  // Cancels an in-flight poll loop when the component unmounts (or a manual recheck
  // supersedes it), so we never setState after unmount and never leak a running loop.
  const cancelledRef = useRef(false);

  // The bounded poll. Reads /v1/me up to MAX_ATTEMPTS times; resolves to success the moment
  // membership is no longer 'free' (subscription or lifetime), else settles into
  // 'processing'. A 401 → 'signed-out'; any other throw → 'error'. Runs immediately, then
  // spaced by POLL_INTERVAL_MS.
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
        if (user.membership !== 'free') {
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
    if (cancelled) {
      // No polling for a cancelled checkout — just commit the state from an effect so the
      // island re-renders after hydration (see the useState comment above).
      setState('cancelled');
      return;
    }
    void runPoll();
    return () => {
      cancelledRef.current = true;
    };
  }, [cancelled, runPoll]);

  // Local pending state for the "Check again" / "Try again" retry buttons (processing +
  // error states). These re-run the SAME `runPoll` the initial mount uses — no new
  // network call, no checkout, nothing billing-shaped is added. `useElementPending`
  // gives the button its own disabled/aria-busy/spinner triad (CLAUDE.md §4 rule 2)
  // independent of the `state`/`attempts` that drive the screen body itself.
  const retry = useElementPending();

  // ── States ──────────────────────────────────────────────────────────────────────
  // Six states, six deliberate treatments (Feature 83). The prototype only drew two
  // (success/failed); the other four are real outcomes of the bounded-poll race and
  // must never read as a payment failure when they aren't one. See the comment on
  // each branch for why it looks the way it does.

  if (state === 'cancelled') {
    // The user backed out of Checkout themselves — not a failure. No charge ever
    // happened, so the reassurance list is true here and shown.
    return (
      <ReturnHero
        tone="neutral"
        eyebrow="Checkout"
        title="Checkout cancelled"
        body="No payment was taken. You can pick up where you left off whenever you’re ready."
        reassurance
      >
        <PendingLink href="/profile" className="btn btn-primary w-full justify-center">
          Back to your profile
        </PendingLink>
      </ReturnHero>
    );
  }

  if (state === 'success') {
    // `/v1/me` reports a real, webhook-confirmed membership. The prototype's stat row
    // ("120+ Countries", "1800+ Courts") is fabricated marketing copy the real database
    // can't back (11 countries, 12 courts) — dropped rather than replaced with smaller
    // real numbers dressed up the same way; this screen doesn't fetch anything new to
    // populate it (see report).
    return (
      <ReturnHero tone="success" eyebrow="WELCOME TO" title="Tennis World">
        <p className="body-m mt-3 text-graphite">Your membership is now active.</p>
        <p className="body-s mx-auto mt-2 max-w-[280px] text-stone">
          You now have full access to exact court locations, the complete atlas, and all
          curated collections across Tennis World.
        </p>
        <div className="flex flex-col gap-2.5">
          <PendingLink href="/map" className="btn btn-primary w-full justify-center">
            Explore the map
          </PendingLink>
          <div className="flex gap-2.5">
            <PendingLink href="/saved" className="btn btn-secondary flex-1 justify-center">
              Saved courts
            </PendingLink>
            <PendingLink href="/profile" className="btn btn-secondary flex-1 justify-center">
              Go to profile
            </PendingLink>
          </div>
        </div>
      </ReturnHero>
    );
  }

  if (state === 'processing') {
    // NOT a failure — a charge DID happen; the signature-verified webhook just hasn't
    // landed yet (the race the whole polling loop exists for). Reuses the success
    // screen's calm, welcoming structure (same hero tone) so it never reads as an
    // error, but the copy makes no promise of access that isn't active yet — no
    // reassurance list here, because "card not charged" would be false.
    return (
      <ReturnHero tone="success" eyebrow="Membership" title="Your payment is processing">
        <p className="body-m mt-3 text-graphite">
          Thanks — your payment went through and we’re just finishing setting up your
          membership.
        </p>
        <p className="body-s mx-auto mt-2 max-w-[320px] text-stone">
          This usually takes a few moments and will unlock automatically. You can check
          again now, or come back to your profile in a bit.
        </p>
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => void retry.run(runPoll)}
            disabled={retry.pending}
            aria-busy={retry.pending}
            aria-disabled={retry.pending || undefined}
            className="btn btn-primary w-full justify-center gap-2"
          >
            {retry.pending ? <InlineSpinner label="Checking…" /> : null}
            {retry.pending ? 'Checking…' : 'Check again'}
          </button>
          <PendingLink href="/profile" className="btn btn-secondary w-full justify-center">
            Go to your profile
          </PendingLink>
        </div>
      </ReturnHero>
    );
  }

  if (state === 'signed-out') {
    // A 401 mid-poll — the session cookie is missing/expired. This is a plain sign-in
    // prompt, not a payment outcome either way, so it gets neither the success nor the
    // failure visual language.
    return (
      <ReturnShell
        eyebrow="Membership"
        title="Sign in to confirm your membership"
        body="We couldn’t confirm your session here. Sign in and we’ll take you straight to your profile, where your membership will be up to date."
      >
        <PendingLink href="/signin?redirectTo=/profile" className="btn btn-primary justify-center">
          Sign in
        </PendingLink>
      </ReturnShell>
    );
  }

  if (state === 'error') {
    // An unexpected fault reading /v1/me. By this point Checkout has already run, so we
    // genuinely don't know whether a charge landed — the reassurance list (in particular
    // "card not charged") is suppressed here on purpose; only the cancelled state, where
    // no charge ever happened, gets to say that.
    return (
      <ReturnHero
        tone="neutral"
        eyebrow="Membership"
        title="We couldn’t check your membership"
        body="Something went wrong confirming your membership just now. If you completed checkout, it isn’t lost — try checking again, or open your profile."
      >
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => void retry.run(runPoll)}
            disabled={retry.pending}
            aria-busy={retry.pending}
            aria-disabled={retry.pending || undefined}
            className="btn btn-primary w-full justify-center gap-2"
          >
            {retry.pending ? <InlineSpinner label="Trying again…" /> : null}
            {retry.pending ? 'Trying again…' : 'Try again'}
          </button>
          <PendingLink href="/profile" className="btn btn-secondary w-full justify-center">
            Go to your profile
          </PendingLink>
        </div>
      </ReturnHero>
    );
  }

  // checking (initial read / a poll in flight) — a quiet waiting state, not a full-page
  // blocking loader (CLAUDE.md §4 rule 4): just the shell's title/body plus a small
  // inline attempt counter.
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

/**
 * Lightweight centered shell (no hero image) for states that are neither a success nor
 * a failure outcome — `checking` (transient) and `signed-out` (a sign-in prompt, not a
 * payment result).
 */
function ReturnShell({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[560px]">
      <BackButton
        fallbackHref="/profile"
        label="Profile"
        className="eyebrow mb-8 inline-flex items-center gap-1.5 text-stone transition-colors hover:text-ink"
      />
      <div className="fade-in text-center">
        <div className="eyebrow text-gold">{eyebrow}</div>
        <h1 className="display-l mt-3 text-ink">{title}</h1>
        <p className="body-l mt-4 text-graphite">{body}</p>
        {children ? <div className="mt-8">{children}</div> : null}
      </div>
    </div>
  );
}

function CheckCircleGlyph({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function CloseCircleGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

const REASSURANCE_ITEMS = [
  'Card details not charged',
  'Your courts still saved',
  'Your progress not affected',
];

/**
 * Hero-image shell for the two "real outcome" visual treatments grafted from the
 * prototype's `PurchaseSuccessScreen`/`PurchaseFailedScreen` (Feature 83):
 *   • `tone="success"` — the gold check circle + fading hero, used for BOTH `success`
 *     and `processing` (a charge happened in both; the difference is copy, not tone).
 *   • `tone="neutral"` — the desaturated hero + close circle, used for `cancelled` and
 *     `error` (neither is a triumphant outcome, but neither is "your card was declined"
 *     either — the prototype's clay/red failure framing is reserved for an actual
 *     declined-payment case this app cannot detect from `/v1/me` alone).
 * `reassurance` renders the "card not charged / courts saved / progress not affected"
 * list — only ever passed `true` for `cancelled`, the one state where it is true.
 */
function ReturnHero({
  tone,
  eyebrow,
  title,
  body,
  reassurance = false,
  children,
}: {
  tone: 'success' | 'neutral';
  eyebrow: string;
  title: string;
  body?: string;
  reassurance?: boolean;
  children?: ReactNode;
}) {
  const circleColorClass = tone === 'success' ? 'border-gold text-gold' : 'border-clay text-clay';

  return (
    <div className="mx-auto max-w-[560px]">
      <BackButton
        fallbackHref="/profile"
        label="Profile"
        className="eyebrow mb-8 inline-flex items-center gap-1.5 text-stone transition-colors hover:text-ink"
      />
      <div className="fade-in">
        {/* Hero image fading to bone, per the prototype (height:280 success / height:200
            failed, with a grayscale+dim filter on the neutral tone). Reuses an existing
            app image — no new asset, no fabricated photography. */}
        <div className={`relative -mx-5 overflow-hidden sm:mx-0 ${tone === 'success' ? 'h-[220px] sm:h-[280px]' : 'h-[160px] sm:h-[200px]'}`}>
          <Image
            src="/placeholders/jorge-salazar-pY_GFZNKrrc-unsplash.jpg"
            alt=""
            fill
            sizes="560px"
            className={`object-cover ${tone === 'neutral' ? 'grayscale-[0.5] brightness-75' : ''}`}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                tone === 'success'
                  ? 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(245,242,236,1) 100%)'
                  : 'linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(245,242,236,1) 100%)',
            }}
          />
        </div>

        <div className="-mt-5 flex flex-col items-center px-2 text-center">
          <div
            className={`mb-5 flex h-14 w-14 items-center justify-center rounded-full border-[1.5px] ${circleColorClass}`}
          >
            {tone === 'success' ? <CheckCircleGlyph /> : <CloseCircleGlyph />}
          </div>
          {eyebrow ? (
            <div className="eyebrow text-gold">{eyebrow}</div>
          ) : null}
          <h1 className="display-l mt-2 text-ink">{title}</h1>
          {body ? <p className="body-m mx-auto mt-3 max-w-[320px] text-stone">{body}</p> : null}

          {reassurance ? (
            <div className="mt-7 w-full rounded-lg border border-hairline bg-paper p-4">
              {REASSURANCE_ITEMS.map((item, i) => (
                <div
                  key={item}
                  className={`flex items-center gap-2.5 py-2 ${i < REASSURANCE_ITEMS.length - 1 ? 'border-b border-hairline/60' : ''}`}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
                    <CheckCircleGlyph size={12} />
                  </span>
                  <span className="body-s text-graphite">{item}</span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-8 w-full">{children}</div>
        </div>
      </div>
    </div>
  );
}
