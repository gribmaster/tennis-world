'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { REVIEW_COPY } from './review-copy';
import { ReviewModal } from './ReviewModal';

// CourtDetailReviewCard — the prototype's "Played here? Leave a review" card
// (design_v2_stripped.html:1154–1166) and the control that opens the review form
// (Feature 80). It is the trigger and the card in one component, exactly as
// ConsultationTrigger is: it OWNS the open/close state locally (one `useState`, no global
// store) and renders the modal alongside itself.
//
// ── UNLOCKED BRANCH ONLY ────────────────────────────────────────────────────────────────
// The page mounts this only in `renderUnlocked()`. That matches the prototype (the card is
// inside `{!isLocked && …}`, line 1155, and the dark unlock card takes its place when
// locked) and it is also the right rule on its own terms: a viewer who cannot be told where
// the court IS has not played there, so inviting them to review it would be inviting a
// review of a place they have never been. The locked branch keeps `CourtDetailUnlockCard`
// in this slot, unchanged.
//
// ── SIGNED OUT ──────────────────────────────────────────────────────────────────────────
// Submission requires a session (POST /v1/reviews is AuthGuard-protected). So when
// `signedIn` is false the button does NOT open the form — it routes to
// `/signin?redirectTo=/courts/{slug}`, the SAME path and the same encoding
// `CourtSaveButton` uses for its logged-out click. Opening a dialog whose submit is
// guaranteed to 401 would waste the visitor's typing.
//
// The card itself still renders for a logged-out visitor rather than disappearing: it is
// the invitation, and hiding it would make the sign-in reason invisible. Only the button's
// destination changes.
//
// ── CLAUDE.md §4 ────────────────────────────────────────────────────────────────────────
// The button here does ONE of two purely local things: open a modal, or navigate to
// /signin. Opening a modal needs no pending affordance (rule 10). The sign-in case IS a
// navigation, but it is conditional on state the button already holds and shares its
// element with the modal-open case — so rather than a `PendingLink` that is only sometimes
// a link, it stays a button and `router.push`es, the same shape and the same reason
// `CourtSaveButton`'s logged-out branch does. The ONE async, database-backed control in
// this feature is the modal's submit, and that carries the full §4 triad (see ReviewModal).
//
// ── NO RATING IS DISPLAYED ──────────────────────────────────────────────────────────────
// The card shows a single decorative gold star inside a circle — the prototype's icon
// (line 1158), not a score. There is no average here, no count, no `Stars` read-out. The
// sub-line says so in as many words, and it is the prototype's own sentence.

/** The card's circled star icon — decorative (prototype line 1158), never a rating. */
function StarBadgeGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

export interface CourtDetailReviewCardProps {
  /** The court being reviewed — carried in the payload and in the sign-in return path. */
  courtSlug: string;
  /**
   * Whether the visitor is signed in (Feature 57), as resolved once on the server by the
   * page. False ⇒ the button routes to /signin instead of opening the form. Always true in
   * mock mode (no auth seam). Defaults to true so a caller that omits it behaves as before.
   */
  signedIn?: boolean;
}

export function CourtDetailReviewCard({
  courtSlug,
  signedIn = true,
}: CourtDetailReviewCardProps) {
  const router = useRouter();
  // The ONLY state here. Local on purpose: the modal owns its own form state; neither is
  // global (there is deliberately no state library in this app).
  const [open, setOpen] = useState(false);

  const signInHref = `/signin?redirectTo=${encodeURIComponent(`/courts/${courtSlug}`)}`;

  return (
    <>
      {/* Ivory ground, 12px radius, 16px padding, 12px gap, hairline border — the
          prototype's geometry (line 1156) in existing tokens. */}
      <div className="flex items-center gap-3 rounded-lg border border-hairline bg-ivory p-4">
        {/* 40px paper circle holding the gold star (prototype line 1157). */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill border border-hairline bg-paper text-gold">
          <StarBadgeGlyph />
        </div>
        <div className="flex-1">
          <p className="text-[13px] font-semibold text-ink">{REVIEW_COPY.card.title}</p>
          <p className="mt-0.5 text-[11px] leading-[1.4] text-stone">
            {REVIEW_COPY.card.subline}
          </p>
        </div>
        <button
          type="button"
          onClick={() => (signedIn ? setOpen(true) : router.push(signInHref))}
          // Only advertise a dialog when clicking actually opens one.
          aria-haspopup={signedIn ? 'dialog' : undefined}
          className="btn btn-secondary shrink-0 !h-9 !px-3.5 !text-[11px]"
        >
          {REVIEW_COPY.card.ctaLabel}
        </button>
      </div>

      {/* Rendered only for a signed-in visitor; a logged-out click never reaches it. */}
      {signedIn ? (
        <ReviewModal open={open} onClose={() => setOpen(false)} courtSlug={courtSlug} />
      ) : null}
    </>
  );
}
