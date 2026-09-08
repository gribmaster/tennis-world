import type { ReactNode } from 'react';

// CourtDetailBlurredDescription — the court blurb as the LOCKED page shows it
// (design_v2_stripped.html:1073–1077): the real text, rendered with `filter:blur(5px)`
// and `user-select:none`, and nothing else. No "Read more" control — the prototype has
// none on this branch, and offering one would invite a click that reveals nothing
// legible.
//
// ── DECORATION, NOT PROTECTION ──────────────────────────────────────────────────────────
// The blurb is PUBLIC. `GET /v1/courts/:slug` returns `blurb` to every caller, entitled or
// not (contracts `CourtSchema` marks only `lat`/`lng` optional), so the real text is in the
// DOM here exactly as it always has been — one "inspect element" away, and correctly so.
// This CSS blur is a teaser treatment, the same class of thing as the masked title. It is
// NOT a security boundary and must never be mistaken for one: the boundary is the exact
// `lat`/`lng`, which is server-side and entitlement-checked
// (`GET /v1/me/courts/:slug/exact-location`) and never reaches this component. Making the
// blurb itself entitlement-gated would be an API/entitlement-model change — deliberately
// out of scope (intake §2.4 says flag, don't do).
//
// ── SCREEN READERS ──────────────────────────────────────────────────────────────────────
// A blur is a purely visual effect: assistive tech would happily read out, at full
// fidelity, text a sighted viewer cannot read. That is not the parity we want here — it
// makes the paywall behave differently for two users on the same page. So the blurred
// paragraph is `aria-hidden` and non-focusable, and an `sr-only` line stands in its place
// saying what the visual state means. Both readings then convey the same thing: there is a
// description, and membership reveals it.
//
// PRESENTATIONAL: props only, no repository, no state, no client boundary. It receives no
// coordinate and no entitlement — the page derived `locked` once (Feature 64) and simply
// chose to render this component.

export interface CourtDetailBlurredDescriptionProps {
  /** The court's blurb (CourtDTO.blurb) — public data, visually obscured. */
  blurb: string;
}

export function CourtDetailBlurredDescription({
  blurb,
}: CourtDetailBlurredDescriptionProps): ReactNode {
  return (
    <div className="relative">
      {/* The stand-in the accessibility tree gets, in place of unreadable text. */}
      <p className="sr-only">
        This court&rsquo;s description is hidden. Unlock membership to read it.
      </p>
      <p
        aria-hidden
        className="body-m select-none leading-[1.6] text-graphite blur-[5px]"
      >
        {blurb}
      </p>
    </div>
  );
}
