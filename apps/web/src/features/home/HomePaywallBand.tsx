import Image from 'next/image';
import { PaywallTrigger } from '@/features/paywall';
import { ConsultationTrigger } from '@/features/consultation';

// HomePaywallBand — the closing membership CTA band, RESTYLED to the v2 language
// (Feature 74).
//
// KEPT DELIBERATELY (intake §8 Q1, decided): the prototype's Home has no equivalent
// section, but this band is the app's ONLY checkout entry point outside Court Detail and
// Profile. A visual redesign does not delete a conversion surface, so it stays and is
// restyled rather than dropped.
//
// V2 RESTYLE: the v1 band was a full-bleed 80–120px dark slab sized for a desktop-first
// page. It is now a rounded ink CARD sitting in the page gutter, matching the radius
// (14px), gutter (20px) and serif-20px heading rhythm the prototype uses for every other
// Home section, so it reads as one more card in the stack rather than a page break. Tokens
// only: ink ground, gold eyebrow, the existing `.btn` variants, the same type scale.
//
// COPY — REAL PLAN MODEL (intake §8 Q2, decided): the value line no longer says "$29",
// "one-time" or "lifetime". Membership is a RECURRING subscription with monthly /
// quarterly / yearly plans (Feature 71's rework), and the band now says exactly that. No
// price is quoted here at all — the amounts live on the plan options inside the paywall
// modal, which is the one place they are authored, so this band cannot drift out of date
// when a price changes.
//
// NO BILLING BEHAVIOUR CHANGE (CLAUDE.md §7 stands in full): this is presentation only.
// The primary CTA opens the SAME shared `PaywallTrigger` → paywall modal → API-created
// Stripe Checkout Session it already opened; the secondary opens the SAME consultation
// modal. No Stripe key, no price id, no plan key, and no checkout call is introduced or
// altered here.

interface PaywallBandCopy {
  eyebrow: string;
  headline: string;
  valueProp: string;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
  backgroundImageUrl: string;
}

const PAYWALL_BAND_COPY: PaywallBandCopy = {
  eyebrow: 'Membership',
  headline: 'The world, unlocked.',
  valueProp:
    '120+ curated courts. Exact locations. Editorial guides. Monthly, quarterly or yearly — cancel anytime.',
  primaryCtaLabel: 'Choose your plan',
  secondaryCtaLabel: 'Request consultation',
  backgroundImageUrl: '/placeholders/jorge-salazar-pY_GFZNKrrc-unsplash.jpg',
};

function ArrowGlyph() {
  return (
    <svg
      width="13"
      height="13"
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
  copy?: PaywallBandCopy;
}

export function HomePaywallBand({ copy = PAYWALL_BAND_COPY }: HomePaywallBandProps) {
  const { eyebrow, headline, valueProp, primaryCtaLabel, secondaryCtaLabel, backgroundImageUrl } =
    copy;

  return (
    <section className="pt-7">
      <div className="container-page">
        <div className="relative overflow-hidden rounded-[14px] bg-ink px-6 py-9 text-center">
          <Image
            src={backgroundImageUrl}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 1280px"
            className="object-cover opacity-20"
          />

          <div className="relative mx-auto max-w-[520px]">
            {/* Gold eyebrow flanked by hairline rules — the v1 treatment, kept. */}
            <div className="mb-4 flex items-center justify-center gap-2.5">
              <span aria-hidden className="h-px w-6 bg-gold/70" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gold">
                {eyebrow}
              </span>
              <span aria-hidden className="h-px w-6 bg-gold/70" />
            </div>

            <h2 className="serif text-[24px] font-normal leading-[30px] text-bone">{headline}</h2>

            <p className="mx-auto mt-3 max-w-[380px] text-[13px] leading-[20px] text-bone/70">
              {valueProp}
            </p>

            <div className="mt-7 flex flex-wrap justify-center gap-2.5">
              {/* PRIMARY — the shared paywall modal (API-created Checkout Session lives
                  inside it, unchanged). Gold `btn-premium` is the sanctioned paywall
                  button, and this IS the paywall. */}
              <PaywallTrigger source="home" className="btn btn-premium gap-2">
                {primaryCtaLabel}
                <ArrowGlyph />
              </PaywallTrigger>

              {/* SECONDARY — the shared consultation modal, unchanged. */}
              <ConsultationTrigger
                source="home"
                className="btn border border-bone/30 bg-transparent text-bone/75"
              >
                {secondaryCtaLabel}
              </ConsultationTrigger>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
