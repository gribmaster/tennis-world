import { PaywallTrigger, PAYWALL_COPY } from '@/features/paywall';

// CourtDetailUnlockCard — the LOCKED page's dark unlock card
// (design_v2_stripped.html:1169–1176): ink ground, 12px radius, 20px padding, centered;
// an uppercase eyebrow, a light serif headline, a value line, then a full-width gold
// button.
//
// ── COPY, AND WHERE EACH STRING COMES FROM ──────────────────────────────────────────────
//   • eyebrow   "Premium Content"      — the prototype, verbatim (line 1171).
//   • headline  "Unlock the full atlas" — the prototype, verbatim (line 1172).
//   • value line — `PAYWALL_COPY.valueProp`, NOT the prototype's
//     "Get exact location, full description, directions and booking contacts." (line 1173).
//     That sentence promises "booking contacts", which this product does not sell and this
//     page cannot deliver; the paywall copy module is the one place the real offer is
//     written, and reusing it means the card and the modal it opens can never disagree.
//   • button    "Unlock Full Access"   — the app's existing paywall CTA label
//     (`CourtDetailCtaPanel`), which intake §2.4 names as the replacement for the
//     prototype's stale "Unlock access — $29".
//
// NO PRICE IS QUOTED HERE. The prototype's "$29" is a dead one-time offer; the product
// sells recurring monthly / quarterly / yearly plans, and those prices live in
// `paywall-copy.ts` and are rendered by the modal, on the plan buttons, where a price
// belongs. Quoting a single number on this card could only be wrong.
//
// NO BILLING BEHAVIOUR (CLAUDE.md §7). This is a `PaywallTrigger` — it opens the shared
// modal and nothing else. There is no checkout call, no plan key, no price id, no
// publishable key and no Stripe.js on this path; the modal's own PaywallCheckoutButton
// owns checkout, exactly as it did before this feature. Opening a modal is local UI, so
// per §4 rule 10 the trigger carries no pending primitive and no spinner.

export function CourtDetailUnlockCard() {
  return (
    <div className="rounded-lg bg-ink p-5 text-center">
      {/* 11px / 0.08em uppercase, 60% bone (prototype line 1171). */}
      <p className="text-[11px] uppercase tracking-caption text-bone/60">Premium Content</p>
      {/* 22px serif, weight 300 (prototype line 1172). */}
      <p className="serif mt-1.5 text-[22px] font-light text-bone">Unlock the full atlas</p>
      {/* 13px / 1.5, 70% bone (prototype line 1173) — with the REAL offer's words. */}
      <p className="mt-2 text-[13px] leading-[1.5] text-bone/70">{PAYWALL_COPY.valueProp}</p>
      <PaywallTrigger
        source="court-detail-locked-card"
        className="btn btn-premium mt-4 w-full justify-center"
      >
        Unlock Full Access
      </PaywallTrigger>
    </div>
  );
}
