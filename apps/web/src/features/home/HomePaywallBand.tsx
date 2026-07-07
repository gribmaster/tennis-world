import Image from 'next/image';
import { PaywallTrigger } from '@/features/paywall';
import { ConsultationTrigger } from '@/features/consultation';

// HomePaywallBand — the closing "membership" CTA band, ported from the final
// paywall section in `files/home.html` (the dark "The world, unlocked." band).
//
// PRESENTATIONAL ONLY (Phase 1 — no auth, no payments, no real unlock; Decision #11
// / hard rules). The primary CTA opens the shared Phase-1 Paywall modal (presentational
// only — no checkout). The secondary (consultation) CTA opens the shared Phase-1
// Consultation modal (presentational only — no backend/CRM/email). Phase 4 wires real
// pricing/unlock; Phase 2/5 wire the real consultation submit.
//
// DATA SOURCE: the copy lives in a small feature-local config object below. There is
// no approved repository/config boundary for paywall copy yet, and this feature must
// not import `@tennis/mock-data` in UI nor build a repository just for this. (A
// `PAYWALL_COPY` config does exist in @tennis/mock-data for the future paywall modal;
// in Phase 4 this band's copy would flow from there through a sanctioned boundary —
// for now it is intentionally local and presentational.)
//
// VISUAL: ink background with a faint full-bleed photo, a gold "MEMBERSHIP" eyebrow
// flanked by hairline rules, a serif headline, a value-prop line, and two centered
// CTAs (gold primary + outline-over-dark secondary). Centered + mobile-first; the
// CTAs wrap on narrow screens and sit inline on wider ones.

interface PaywallBandCopy {
  eyebrow: string;
  headline: string;
  valueProp: string;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
  /** Faint background photo (remote Unsplash URL, whitelisted in next.config.mjs). */
  backgroundImageUrl: string;
}

// Copy ported verbatim from home.html's paywall band. Kept local + presentational.
const PAYWALL_BAND_COPY: PaywallBandCopy = {
  eyebrow: 'Membership',
  headline: 'The world, unlocked.',
  valueProp: '120+ curated courts. Exact locations. Editorial guides. One-time $29.',
  primaryCtaLabel: 'Unlock Full Access',
  secondaryCtaLabel: 'Request Consultation',
  backgroundImageUrl:
    'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=1600&q=80&auto=format&fit=crop',
};

function ArrowGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export interface HomePaywallBandProps {
  /** Override the default (prototype) copy if needed. */
  copy?: PaywallBandCopy;
}

export function HomePaywallBand({ copy = PAYWALL_BAND_COPY }: HomePaywallBandProps) {
  const { eyebrow, headline, valueProp, primaryCtaLabel, secondaryCtaLabel, backgroundImageUrl } =
    copy;

  return (
    <section className="relative overflow-hidden bg-ink px-[clamp(24px,6vw,80px)] py-[clamp(56px,8vw,120px)]">
      {/* Faint full-bleed photo (opacity ~0.2 like the prototype). */}
      <Image
        src={backgroundImageUrl}
        alt=""
        fill
        sizes="100vw"
        className="object-cover opacity-20"
      />

      <div className="relative mx-auto max-w-[720px] text-center">
        {/* Gold "MEMBERSHIP" eyebrow flanked by hairline rules. */}
        <div className="mb-5 flex items-center justify-center gap-2.5">
          <span aria-hidden className="h-px w-7 bg-gold/70" />
          <span className="serif text-[13px] uppercase tracking-[0.28em] text-gold">{eyebrow}</span>
          <span aria-hidden className="h-px w-7 bg-gold/70" />
        </div>

        <h2 className="display-l text-bone">{headline}</h2>

        <p className="body-l mx-auto mt-4 max-w-[420px] text-bone/70">{valueProp}</p>

        <div className="mt-9 flex flex-wrap justify-center gap-3">
          {/* PRIMARY CTA — opens the shared Paywall modal (presentational only; the
              modal's checkout is a Phase 4 placeholder). The gold `btn-premium` variant
              is reserved for the paywall (this is it). */}
          <PaywallTrigger source="home" className="btn btn-premium gap-2">
            {primaryCtaLabel}
            <ArrowGlyph />
          </PaywallTrigger>

          {/* SECONDARY CTA — opens the shared Consultation modal (presentational only;
              its submit is mock — no backend/CRM/email). */}
          <ConsultationTrigger
            source="home"
            className="btn border border-bone/30 bg-transparent text-bone/75"
          >
            {secondaryCtaLabel}
          </ConsultationTrigger>
        </div>
      </div>
    </section>
  );
}
