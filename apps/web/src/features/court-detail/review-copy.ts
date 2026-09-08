// review-copy.ts — the copy shown by the "Played here?" card and the review modal
// (Feature 80).
//
// An intentional feature-local copy object, exactly like `paywall-copy.ts` and
// `consultation-copy.ts`: UI code in `apps/web` may not import `@tennis/mock-data`
// (forbidden by `apps/web/.eslintrc.json`), and standing up a repository for static
// modal copy would be the wrong shape for strings that never come from a server.
//
// ── WHERE EACH STRING COMES FROM ────────────────────────────────────────────────────
//   • the card's title "Played here?"        — the prototype, verbatim (line 1161).
//   • the card's sub-line                    — the prototype, verbatim (line 1162):
//       "Leave a review — we'll start showing ratings once we have enough."
//     This sentence is the reason nothing displays a rating today, said out loud to the
//     visitor, so it stays exactly as written rather than being softened.
//   • the card's button "Review"             — the prototype, verbatim (line 1163).
//   • everything below it (the dialog's own headline, labels and confirmation) is NEW:
//     the prototype draws the card but never opens a form, so it supplies no form copy.
//
// ── WHAT THE CONFIRMATION MAY AND MAY NOT SAY ───────────────────────────────────────
// Reviews are COLLECTED AND NOT DISPLAYED (Feature 80). So the success copy thanks the
// author and says the review was received — it must NOT say "published", "posted",
// "live", "others can see it" or anything else that claims a surface which does not
// exist. `success.body` states plainly that ratings appear once there are enough of
// them, which is both true and the same promise the card makes.

export interface ReviewCopy {
  /** The "Played here?" card on Court Detail. */
  card: {
    title: string;
    /** One-line explanation of why no rating is shown yet. */
    subline: string;
    /** The card's button label (opens the modal, or routes to sign-in). */
    ctaLabel: string;
  };
  /** Gold eyebrow above the dialog headline (matches the consultation/paywall treatment). */
  eyebrow: string;
  headline: string;
  /** One line under the headline. */
  subhead: string;
  /** The 1–5 star rating control. */
  ratingLabel: string;
  /** Accessible names for the five rating options, indexed 1–5. */
  ratingOptionLabels: readonly string[];
  /** Shown when the visitor tries to submit without choosing a rating. */
  ratingRequiredError: string;
  /** The optional free-text field. */
  bodyLabel: string;
  bodyPlaceholder: string;
  /** Suffix appended to the body label, marking it optional. */
  bodyOptionalHint: string;
  /** Shown when the typed review exceeds the contract's length cap. */
  bodyTooLongError: string;
  submitCtaLabel: string;
  /** Label announced while the submit request is in flight. */
  submitPendingLabel: string;
  cancelCtaLabel: string;
  /** Non-blocking inline error when the submit fails; the dialog stays open. */
  submitError: string;
  /** In-modal confirmation after a successful submit. */
  success: {
    eyebrow: string;
    headline: string;
    body: string;
    ctaLabel: string;
  };
}

export const REVIEW_COPY: ReviewCopy = {
  card: {
    title: 'Played here?',
    subline: "Leave a review — we'll start showing ratings once we have enough.",
    ctaLabel: 'Review',
  },
  eyebrow: 'Your Visit',
  headline: 'How was the court?',
  subhead: 'Rate your visit and add a note if you like. It takes a moment.',
  ratingLabel: 'Rating',
  // Indexed 1–5 by the control. Written as full sentences because they are the
  // accessible names of five otherwise-identical star buttons — "3" alone tells a
  // screen-reader user nothing about what it does.
  ratingOptionLabels: [
    'Rate 1 star out of 5',
    'Rate 2 stars out of 5',
    'Rate 3 stars out of 5',
    'Rate 4 stars out of 5',
    'Rate 5 stars out of 5',
  ],
  ratingRequiredError: 'Please choose a rating.',
  bodyLabel: 'Your review',
  bodyPlaceholder: 'What was it like to play here?',
  bodyOptionalHint: 'Optional',
  // The number is interpolated from the contract's REVIEW_BODY_MAX_LENGTH at the call
  // site, so this string and the validated bound can never drift apart.
  bodyTooLongError: 'Please keep your review under {max} characters.',
  submitCtaLabel: 'Submit Review',
  submitPendingLabel: 'Submitting…',
  cancelCtaLabel: 'Cancel',
  submitError: 'Something went wrong submitting your review. Please try again.',
  success: {
    eyebrow: 'Received',
    headline: 'Thank you.',
    // Says RECEIVED, never "published" — the review is displayed nowhere (Feature 80).
    body: "Your review has been recorded. We'll start showing ratings once we have enough of them.",
    ctaLabel: 'Return to the Court',
  },
};
