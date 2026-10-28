import type { ReactNode } from 'react';
import Image from 'next/image';
import { PendingLink } from '@/components/navigation';
import { PaywallTrigger } from '@/features/paywall';

// HomeMembership — the v3 Atlas membership section + mobile floating CTA (TASK_58).
// Replaces `HomePaywallBand` as Home's conversion surface.
//
// Ported from both v3 prototypes' `HomeScreen` membership block (values only):
//   • desktop: tennis_world_desktop_standalone4.html HomeScreen, ~line 325
//   • mobile:  tennis_world_v17_standalone.html HomeScreen, ~line 401 (+ floating CTA ~443)
//
// COPY — REAL SUBSCRIPTION MODEL (REDESIGN_V3_PLAN.md decision 2): v3's prototype copy
// ("100 Beautiful Tennis Courts" / "One-time payment. No subscription." / "forever") is
// a one-time-purchase product this app does not sell. Every string below describes our
// real recurring plan (monthly / quarterly / yearly, cancel anytime) instead — see the
// mapping table in docs/TASK_58_V3_HOME_ATLAS.md §2. No "one-time", "lifetime",
// "forever" or "no subscription" copy appears anywhere in this component.
//
// "120+" MATCHES the figure `PAYWALL_COPY` / the old `HomePaywallBand` already used —
// not independently re-verified against live production data for this task; report any
// drift to the owner before changing it.
//
// TITLE RENDERED ONCE: the prototype repeats the title (header, then again under the
// image with "The European Collection") — a demo redundancy, and "European Collection"
// is not our product. This component renders the title/subtitle once, in the header
// block, and keeps only the paragraph under the image.
//
// ACCESS STATE: guest and free share identical copy (lock icon, "120+ Beautiful Tennis
// Courts" / subscription subtitle), so this only needs the single `viewerIsEntitled`
// boolean the page already resolves via `getViewerAuthState()` — no separate `signedIn`
// prop. Mirrors the `unlocked` boolean the v3 prototypes use for the same reason.
//
// CTA: desktop's gold `Unlock Full Access →` and the mobile floating pill both open the
// SAME shared `PaywallTrigger` → `PaywallModal` → API-created Stripe Checkout Session
// every other paywall entry point already uses (CLAUDE.md §7) — no billing/Stripe
// behavior change. A guest who opens it gets exactly today's guest paywall behavior.
// Entitled visitors get no desktop button at all, and the mobile pill becomes a plain
// `PendingLink` to `/map` ("Explore the Map") instead.
//
// STICKY PLACEMENT: for the mobile pill's `sticky bottom-[18px]` to work, its containing
// block must be the SAME wrapper that also holds the hero — this component returns the
// membership section and the floating CTA as siblings (a fragment), and `app/page.tsx`
// renders `<HomeHero /><HomeMembership />` inside one shared wrapper so the CTA ends up
// the wrapper's last child, exactly as the task requires.

interface HomeMembershipFeature {
  label: string;
  icon: (size: number) => ReactNode;
}

interface HomeMembershipCopy {
  guestOrFree: { title: string; subtitle: string; paragraph: string };
  entitled: { title: string; subtitle: string; paragraph: string };
  features: HomeMembershipFeature[];
  desktopCtaLabel: string;
  mobileCtaLockedLabel: string;
  mobileCtaUnlockedLabel: string;
  imageUrl: string;
}

function PinGlyph(d: number) {
  return (
    <svg
      width={d}
      height={d}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function CalendarGlyph(d: number) {
  return (
    <svg
      width={d}
      height={d}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function HeartGlyph(d: number) {
  return (
    <svg
      width={d}
      height={d}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function PlusGlyph(d: number) {
  return (
    <svg
      width={d}
      height={d}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function LockGlyph({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function CheckGlyph({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

const HOME_MEMBERSHIP_COPY: HomeMembershipCopy = {
  guestOrFree: {
    title: '120+ Beautiful Tennis Courts',
    subtitle: 'Monthly, quarterly or yearly. Cancel anytime.',
    paragraph: 'Unlock every court and every detail for as long as you are a member.',
  },
  entitled: {
    title: 'Everything is unlocked',
    subtitle: 'Full Access — Active',
    paragraph: 'Every court and every detail, plus new additions as they are published.',
  },
  features: [
    { label: 'Full map & court details', icon: PinGlyph },
    { label: 'Exact locations for every court', icon: CalendarGlyph },
    { label: 'Save your favourite courts', icon: HeartGlyph },
    { label: 'New courts as they are added', icon: PlusGlyph },
  ],
  desktopCtaLabel: 'Unlock Full Access →',
  mobileCtaLockedLabel: 'Unlock the Map',
  mobileCtaUnlockedLabel: 'Explore the Map',
  imageUrl: '/placeholders/jorge-salazar-pY_GFZNKrrc-unsplash.jpg',
};

export interface HomeMembershipProps {
  /** Whether this viewer carries an active (non-free) membership. Guest and free share
   *  identical copy, so no separate `signedIn` prop is needed. */
  viewerIsEntitled: boolean;
}

export function HomeMembership({ viewerIsEntitled }: HomeMembershipProps) {
  const copy = viewerIsEntitled ? HOME_MEMBERSHIP_COPY.entitled : HOME_MEMBERSHIP_COPY.guestOrFree;
  const { features, imageUrl, desktopCtaLabel, mobileCtaLockedLabel, mobileCtaUnlockedLabel } =
    HOME_MEMBERSHIP_COPY;

  return (
    <>
      <section>
        {/* Desktop: image left, copy right. */}
        <div className="mx-auto hidden max-w-[1180px] items-center gap-[72px] px-14 py-[100px] md:flex">
          <div className="h-[460px] flex-1 overflow-hidden rounded-[20px] shadow-[0_2px_16px_rgba(15,15,15,0.06)]">
            <Image
              src={imageUrl}
              alt=""
              width={560}
              height={460}
              sizes="(min-width: 768px) 540px, 100vw"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="flex-1">
            <div className="mb-[26px] flex h-16 w-16 items-center justify-center rounded-pill border border-[rgba(184,184,182,0.4)] bg-bone text-ink">
              {viewerIsEntitled ? <CheckGlyph size={26} /> : <LockGlyph size={24} />}
            </div>
            <h2 className="serif text-[44px] font-normal leading-[1.08] text-ink">{copy.title}</h2>
            <p className="mt-2.5 text-[15px] text-stone">{copy.subtitle}</p>
            <p className="mt-[22px] max-w-[440px] text-[15px] leading-[1.7] text-graphite">
              {copy.paragraph}
            </p>

            <div className="mt-[34px] flex flex-col gap-[18px]">
              {features.map((feature) => (
                <div key={feature.label} className="flex items-center gap-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill border border-[rgba(184,184,182,0.3)] bg-bone text-graphite">
                    {feature.icon(16)}
                  </span>
                  <span className="text-[15px] text-graphite">{feature.label}</span>
                </div>
              ))}
            </div>

            {!viewerIsEntitled ? (
              <PaywallTrigger source="home" className="btn btn-premium mt-[38px]">
                {desktopCtaLabel}
              </PaywallTrigger>
            ) : null}
          </div>
        </div>

        {/* Mobile: one card — header, image, paragraph, feature list. No button here;
            the floating pill below is the mobile CTA. */}
        <div className="mx-4 mt-7 rounded-[20px] bg-paper px-5 py-7 shadow-[0_2px_16px_rgba(15,15,15,0.06)] md:hidden">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-pill border border-[rgba(184,184,182,0.4)] bg-bone text-ink">
              {viewerIsEntitled ? <CheckGlyph size={22} /> : <LockGlyph size={20} />}
            </div>
            <h2 className="serif text-[24px] font-normal leading-[1.2] text-ink">{copy.title}</h2>
            <p className="mt-1.5 text-[13px] text-stone">{copy.subtitle}</p>
          </div>

          <div className="mt-5 h-[170px] overflow-hidden rounded-[16px]">
            <Image
              src={imageUrl}
              alt=""
              width={700}
              height={170}
              sizes="100vw"
              className="h-full w-full object-cover"
            />
          </div>

          <p className="mt-4 text-center text-[13px] leading-[1.5] text-graphite">
            {copy.paragraph}
          </p>

          <div className="mt-[18px] flex flex-col gap-3.5">
            {features.map((feature) => (
              <div key={feature.label} className="flex items-center gap-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill border border-[rgba(184,184,182,0.3)] bg-bone text-graphite">
                  {feature.icon(16)}
                </span>
                <span className="text-[14px] text-graphite">{feature.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mobile floating CTA — sticky to the viewport bottom while scrolling, resting at
          the end of this wrapper (see file header on the shared-wrapper requirement). */}
      <div className="sticky bottom-[18px] mx-4 mt-7 md:hidden">
        {viewerIsEntitled ? (
          <PendingLink
            href="/map"
            className="flex h-14 w-full items-center justify-center rounded-pill bg-ink text-[12px] font-medium uppercase tracking-[0.16em] text-bone shadow-[0_16px_40px_rgba(15,15,15,0.25),0_2px_10px_rgba(15,15,15,0.1)]"
          >
            {mobileCtaUnlockedLabel}
          </PendingLink>
        ) : (
          <PaywallTrigger
            source="home-floating"
            className="flex h-14 w-full items-center justify-center rounded-pill bg-ink text-[12px] font-medium uppercase tracking-[0.16em] text-bone shadow-[0_16px_40px_rgba(15,15,15,0.25),0_2px_10px_rgba(15,15,15,0.1)]"
          >
            {mobileCtaLockedLabel}
          </PaywallTrigger>
        )}
      </div>
    </>
  );
}
