'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { REVIEW_BODY_MAX_LENGTH, type ReviewSubmitDTO } from '@tennis/contracts';
import { getClientRepositories } from '@/lib/repositories.client';
import { AuthRequiredError } from '@/lib/repositories';
import { InlineSpinner } from '@/components/ui';
import { REVIEW_COPY, type ReviewCopy } from './review-copy';

// ReviewModal — the review-submission dialog opened by the "Played here?" card
// (Feature 80). Structurally the ConsultationModal: a portalled, labelled dialog with a
// small form, a submit that goes through the repository boundary, an inline non-blocking
// error, and an in-modal confirmation. Styled with the same premium language (ivory/paper
// ground, gold eyebrow flanked by hairline rules, serif headline).
//
// ── COLLECTION ONLY (the hard rule of this feature) ─────────────────────────────────────
// The form COLLECTS a 1–5 rating, because that is the point of collecting. It DISPLAYS no
// aggregate of any kind: no average, no review count, no other person's review, no "4.6
// (128)". The five stars here are an INPUT control showing the visitor their own current
// selection — the prototype's read-only `Stars` display component is not ported, and there
// is nothing on this screen or any other that renders a score. The success state says the
// review was RECEIVED, never that it was published, because it is displayed nowhere.
//
// ── DATA WIRING ─────────────────────────────────────────────────────────────────────────
// Submitting calls `getClientRepositories().reviews.submit()` — the sanctioned boundary
// for a BROWSER island that needs an authenticated transport (it passes `auth:'include'`,
// so the httpOnly session cookie rides along). This is why it is not the bare
// `repositories` singleton the ConsultationModal uses: POST /v1/consultations is public,
// POST /v1/reviews is AuthGuard-protected.
//   • `mock` data source → MockReviewRepository: no network; stores in memory and echoes
//     the stored shape back, so the confirmation state shows identically.
//   • `api` data source  → HttpReviewRepository: POST /v1/reviews with the session cookie.
// The modal is agnostic to which.
//
// A logged-out visitor should never get here — ReviewTrigger routes them to /signin
// BEFORE opening this dialog rather than letting a submit fail. If a session expires while
// the dialog is open, the submit's `AuthRequiredError` is caught and reported as its own
// message (sign in again) rather than the generic failure, and the dialog stays open.
//
// ── CLAUDE.md §4 ────────────────────────────────────────────────────────────────────────
// The submit control is an async DATABASE-BACKED mutation, so it carries the §4 triad in
// full: local `submitting` state, `disabled={submitting}`, `aria-busy`, an
// `<InlineSpinner label="Submitting…" />` rendered ALONGSIDE the unchanged label (the box
// never resizes, rule 5), and `setSubmitting(false)` in an UNCONDITIONAL `finally` so a
// failure can never leave the button stuck (rule 7). Failure surfaces as a real inline
// error and the dialog stays open for a retry. It is a plain `<button type="submit">`
// rather than `PendingButton` for the same reason `CourtSaveButton` is: PendingButton
// wraps `Button`, whose visual is not this dialog's full-width `.btn .btn-primary` form
// action — so this uses the equivalent triad the §4 table sanctions for exactly that case.
// Every OTHER control here (the star buttons, Cancel, ✕, the backdrop) is purely local UI
// and correctly carries no pending affordance (rule 10).
//
// ── ACCESSIBILITY ───────────────────────────────────────────────────────────────────────
// Meets the bar FilterSheet set in Feature 73 (which is higher than ConsultationModal's —
// that one has no focus trap):
//   • role="dialog" + aria-modal="true", labelled by the headline, described by the subhead.
//   • Focus moves into the dialog on open and is restored to the trigger on close.
//   • Focus is TRAPPED while open — Tab / Shift+Tab cycle within the dialog.
//   • Escape closes.
//   • Background scroll is locked while open.
//   • The rating is a real `radiogroup` of five `radio`s: arrow keys move between stars,
//     one tab stop for the group, and the current value is announced. A row of
//     `aria-pressed` buttons would announce five independent toggles instead.
//   • Errors are `role="alert"` and referenced by `aria-describedby` on the control.

/** Selector for everything focusable inside the dialog (used by the focus trap). */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The five selectable ratings, low to high. */
const RATINGS = [1, 2, 3, 4, 5] as const;

function CloseGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** Star glyph — the prototype's polygon (line 251); `filled` shows a chosen rating. */
function StarGlyph({ filled, size = 28 }: { filled: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

export interface ReviewModalProps {
  /** Whether the dialog is open. Controlled by ReviewTrigger. */
  open: boolean;
  /** Called when the user requests close (Escape, backdrop, ✕, Cancel, success CTA). */
  onClose: () => void;
  /** The court being reviewed, by slug — the only identifier the payload carries. */
  courtSlug: string;
  /** Override the default copy if a surface needs different wording. */
  copy?: ReviewCopy;
}

export function ReviewModal({ open, onClose, courtSlug, copy = REVIEW_COPY }: ReviewModalProps) {
  const titleId = useId();
  const descId = useId();
  const ratingErrorId = useId();
  const bodyErrorId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // Remember what had focus before opening so it can be restored on close.
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Form state. Local on purpose — a controlled form is not app state, and it resets
  // every time the dialog opens so nothing outlives one visit to it.
  const [rating, setRating] = useState<number | null>(null);
  const [body, setBody] = useState('');
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  // Submit lifecycle (CLAUDE.md §4): `submitting` disables the control while the request
  // is in flight; `submitError` is a non-blocking inline message — the dialog stays open.
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // The repository is resolved once per mount, not per render. Which implementation this
  // is (mock vs. HTTP) is the factory's decision, not this component's.
  const reviews = useMemo(() => getClientRepositories().reviews, []);

  const trimmedBody = body.trim();
  // Mirrors the contract's `z.string().trim().max(REVIEW_BODY_MAX_LENGTH)`. The textarea
  // also carries `maxLength`, so this is the belt to that suspenders — it catches a paste
  // in browsers that ignore the attribute, and it is what disables the submit control.
  const bodyTooLong = trimmedBody.length > REVIEW_BODY_MAX_LENGTH;
  const bodyError = bodyTooLong
    ? copy.bodyTooLongError.replace('{max}', String(REVIEW_BODY_MAX_LENGTH))
    : null;

  // Reset all form/submission state every time the dialog (re)opens.
  useEffect(() => {
    if (open) {
      setRating(null);
      setBody('');
      setRatingError(null);
      setSubmitted(false);
      setSubmitting(false);
      setSubmitError(null);
    }
  }, [open]);

  // Escape to close + focus trap + focus move-in/restore + background scroll lock.
  // Same implementation as FilterSheet's (Feature 73), which is the app's a11y bar.
  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move focus in. The close control is the first tab stop, so the whole dialog is
    // reachable from there by Tab alone.
    (closeButtonRef.current ?? dialogRef.current)?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Restore focus to whatever opened the dialog (the card's Review button).
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  // Render nothing when closed, and guard against SSR (the portal needs a DOM).
  if (!open || typeof document === 'undefined') return null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return; // ignore double-submits while a request is in flight

    // Rating is required; body is optional but must fit the contract's cap.
    if (rating === null) {
      setRatingError(copy.ratingRequiredError);
      return;
    }
    if (bodyTooLong) return;
    setRatingError(null);

    const payload: ReviewSubmitDTO = {
      courtSlug,
      rating,
      // Omit an empty body entirely rather than sending '' — the contract's optional
      // field rejects a blank string, and "no note" is genuinely an absent value.
      ...(trimmedBody ? { body: trimmedBody } : {}),
    };

    setSubmitError(null);
    setSubmitting(true);
    void reviews
      .submit(payload)
      .then(() => setSubmitted(true))
      .catch((err: unknown) => {
        // A session that expired while the dialog was open — say so specifically rather
        // than blaming the network, so the fix ("sign in again") is obvious.
        setSubmitError(
          err instanceof AuthRequiredError
            ? 'Your session has expired. Please sign in again to leave a review.'
            : copy.submitError,
        );
      })
      // UNCONDITIONAL — the control can never be left stuck disabled (§4 rule 7).
      .finally(() => setSubmitting(false));
  }

  const labelClass = 'eyebrow mb-1.5 block text-stone';

  return createPortal(
    // Backdrop — click closes (same dismissal as ConsultationModal).
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-ink/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      {/* Dialog. stopPropagation so clicks inside don't bubble to the backdrop. */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="relative max-h-[92vh] w-full max-w-[520px] overflow-y-auto bg-paper px-[clamp(24px,5vw,48px)] py-[clamp(32px,5vw,48px)] text-ink outline-none"
      >
        {/* Close button (✕) — the dialog's first tab stop. */}
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 p-2 text-stone transition-colors hover:text-ink"
        >
          <CloseGlyph />
        </button>

        {submitted ? (
          // ── In-modal confirmation ──────────────────────────────────────────────────
          // RECEIVED, not published. Nothing in the app displays this review.
          <div className="py-6 text-center">
            <div className="mb-5 flex items-center justify-center gap-2.5">
              <span aria-hidden className="h-px w-7 bg-gold/70" />
              <span className="serif text-[13px] uppercase tracking-[0.28em] text-gold">
                {copy.success.eyebrow}
              </span>
              <span aria-hidden className="h-px w-7 bg-gold/70" />
            </div>
            <h2 id={titleId} className="display-m text-ink">
              {copy.success.headline}
            </h2>
            <p id={descId} className="body-m mx-auto mt-3 max-w-[380px] text-stone">
              {copy.success.body}
            </p>
            <button
              type="button"
              onClick={onClose}
              autoFocus
              className="btn btn-primary mt-8 w-full justify-center"
            >
              {copy.success.ctaLabel}
            </button>
          </div>
        ) : (
          // ── The form ───────────────────────────────────────────────────────────────
          <>
            <div className="mb-5 flex items-center gap-2.5">
              <span aria-hidden className="h-px w-7 bg-gold/70" />
              <span className="serif text-[13px] uppercase tracking-[0.28em] text-gold">
                {copy.eyebrow}
              </span>
              <span aria-hidden className="h-px w-7 bg-gold/70" />
            </div>

            <h2 id={titleId} className="display-m text-ink">
              {copy.headline}
            </h2>
            <p id={descId} className="body-m mt-3 max-w-[420px] text-stone">
              {copy.subhead}
            </p>

            <form className="mt-7 flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
              {/* Rating — a real radiogroup, NOT a display of anyone's score. */}
              <div>
                <span className={labelClass} id={`${titleId}-rating-label`}>
                  {copy.ratingLabel}
                </span>
                <div
                  role="radiogroup"
                  aria-labelledby={`${titleId}-rating-label`}
                  aria-describedby={ratingError ? ratingErrorId : undefined}
                  aria-required
                  className="flex items-center gap-1.5"
                >
                  {RATINGS.map((value) => {
                    const selected = rating === value;
                    // One tab stop for the whole group: the selected star is the tab
                    // target, or the first star when nothing is chosen yet. Arrow keys
                    // then move within the group (native radio behaviour, reproduced
                    // here because these are buttons carrying role="radio").
                    const isTabTarget = rating === null ? value === 1 : selected;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={copy.ratingOptionLabels[value - 1]}
                        tabIndex={isTabTarget ? 0 : -1}
                        onClick={() => {
                          setRating(value);
                          setRatingError(null);
                        }}
                        onKeyDown={(event) => {
                          const delta =
                            event.key === 'ArrowRight' || event.key === 'ArrowDown'
                              ? 1
                              : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                                ? -1
                                : 0;
                          if (delta === 0) return;
                          event.preventDefault();
                          // Wrap within 1–5, seeding from the current value (or 1).
                          const next = (((rating ?? 1) - 1 + delta + 5) % 5) + 1;
                          setRating(next);
                          setRatingError(null);
                          // Move focus to follow the selection, as native radios do.
                          const group = event.currentTarget.parentElement;
                          const target = group?.children[next - 1];
                          if (target instanceof HTMLElement) target.focus();
                        }}
                        className={`rounded-sm p-1 transition-colors ${
                          // `filled` below decides the glyph; the color carries the state.
                          selected || (rating !== null && value < rating)
                            ? 'text-gold'
                            : 'text-mist hover:text-stone'
                        }`}
                      >
                        <StarGlyph filled={rating !== null && value <= rating} />
                      </button>
                    );
                  })}
                </div>
                {ratingError ? (
                  <p id={ratingErrorId} className="body-s mt-1.5 text-clay" role="alert">
                    {ratingError}
                  </p>
                ) : null}
              </div>

              {/* Optional free-text review. */}
              <div>
                <label className={labelClass} htmlFor={`${titleId}-body`}>
                  {copy.bodyLabel}{' '}
                  <span className="normal-case tracking-normal text-stone/70">
                    ({copy.bodyOptionalHint})
                  </span>
                </label>
                <textarea
                  id={`${titleId}-body`}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={copy.bodyPlaceholder}
                  rows={4}
                  // Hard stop at the contract's cap; `bodyTooLong` above is the check
                  // for browsers that let a paste through anyway.
                  maxLength={REVIEW_BODY_MAX_LENGTH}
                  aria-invalid={bodyError ? true : undefined}
                  aria-describedby={bodyError ? bodyErrorId : undefined}
                  className="w-full resize-y border border-hairline bg-paper px-3.5 py-2.5 text-ink outline-none transition-colors placeholder:text-stone/60 focus:border-ink"
                />
                {bodyError ? (
                  <p id={bodyErrorId} className="body-s mt-1.5 text-clay" role="alert">
                    {bodyError}
                  </p>
                ) : null}
              </div>

              {/* Non-blocking submit error — the dialog stays open so the user can retry. */}
              {submitError ? (
                <p className="body-s -mb-1 text-clay" role="alert">
                  {submitError}
                </p>
              ) : null}

              {/* Actions. The submit carries the full §4 triad (see the file header). */}
              <div className="mt-2 flex flex-col gap-2.5">
                <button
                  type="submit"
                  disabled={submitting || bodyTooLong}
                  aria-busy={submitting || undefined}
                  className="btn btn-primary w-full justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {/* The spinner is rendered ALONGSIDE the unchanged label, so the
                      control's height and width never move while pending (§4 rule 5). */}
                  {submitting ? <InlineSpinner label={copy.submitPendingLabel} /> : null}
                  {copy.submitCtaLabel}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-secondary w-full justify-center"
                >
                  {copy.cancelCtaLabel}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
