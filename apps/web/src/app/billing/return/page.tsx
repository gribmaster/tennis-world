import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AppShell, PageContainer } from '@/components/layout';
import { BillingReturn } from '@/features/billing';

// Post-checkout return page (`/billing/return`) — Feature 67.
//
// Where the browser lands after a hosted Stripe Checkout. To use it, point the API's
// (server-only) `STRIPE_SUCCESS_URL` at `${WEB_APP_URL}/billing/return` and, if you want a
// cancel to land here too, `STRIPE_CANCEL_URL` at `${WEB_APP_URL}/billing/return?status=cancelled`.
// (The API's built-in DEFAULTS are `/profile?checkout=success|cancelled`, which still work
// — this page is the richer, race-aware landing spot; no API change is required to adopt it.)
//
// The <BillingReturn> island re-reads `/v1/me` and tolerates the webhook-vs-redirect race:
// it polls a small, BOUNDED number of times, shows success once membership is `lifetime`,
// and otherwise settles into a calm "payment is processing" state (never an infinite spin,
// never a false failure). `?status=cancelled` short-circuits to a neutral cancelled message.
//
// SERVER shell + CLIENT island: the read must run in the browser (the httpOnly session
// cookie is attached via `credentials:'include'`), so the page is a thin server shell that
// renders the island. `BillingReturn` reads the query via `useSearchParams`, which Next 15
// requires under a Suspense boundary (the page is otherwise statically prerendered).
//
// No real Stripe is needed to render or test this page — every state is a pure function of
// what `/v1/me` returns and the `?status` query.

export const metadata: Metadata = {
  title: 'Confirming your membership — Tennis World',
  description: 'Finishing your membership after checkout.',
  // A transient post-checkout URL — don't index it.
  robots: { index: false, follow: false },
};

export default function BillingReturnRoute() {
  return (
    <AppShell>
      <PageContainer className="py-section-lg md:py-section-xl">
        <Suspense
          fallback={
            <div className="mx-auto max-w-[560px] text-center">
              <h1 className="display-l text-ink">Confirming your membership…</h1>
            </div>
          }
        >
          <BillingReturn />
        </Suspense>
      </PageContainer>
    </AppShell>
  );
}
