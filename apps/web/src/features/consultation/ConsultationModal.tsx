'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createPortal } from 'react-dom';
import type {
  ConsultationSubmitDTO,
  GroupSize,
  SkillLevel,
} from '@tennis/contracts';
import { repositories } from '@/lib/repositories';
import { CONSULTATION_COPY } from './consultation-copy';
import type { ConsultationCopy } from './consultation-copy';

// ConsultationModal — the consultation/concierge request dialog. Premium/luxury styling
// consistent with PaywallModal (ink background, gold eyebrow flanked by hairline rules,
// serif headline). Holds a small consultation request form.
//
// DATA WIRING (Feature 46): submitting validates a few required fields in client state,
// then calls `repositories.consultation.submit()` — the sanctioned repository boundary.
// The active implementation is chosen by the factory:
//   • `mock` data source → MockConsultationRepository: no network, no persistence; it
//     echoes a fabricated ConsultationRequestDTO so the success state shows (the original
//     Phase-1 mock UX, unchanged).
//   • `api` data source  → HttpConsultationRepository: POST /v1/consultations, which
//     persists an anonymous lead and returns the created DTO.
// The UI/UX is identical to before in both modes. On success the in-modal confirmation
// shows; on failure a NON-BLOCKING error appears and the modal stays open so the user can
// retry. Still no email/CRM here — the CRM webhook is Phase 5
// (PHASE_1_PLACEHOLDER_CTA_AUDIT §3).
//
// State: this component is fully controlled (`open` + `onClose`). Open/close state lives
// in ConsultationTrigger (per the feature brief), not here and not in any global store —
// there is intentionally no state library. Form field state IS local here (a controlled
// form is not app state) and resets every time the modal opens.
//
// Accessibility (mirrors PaywallModal):
//   • role="dialog" + aria-modal="true", labelled by the headline + described by the
//     subhead.
//   • Closes on Escape and on backdrop click.
//   • Moves focus into the dialog on open and restores it to the trigger on close.
//   • Locks body scroll while open.

export interface ConsultationModalProps {
  /** Whether the dialog is open. Controlled by ConsultationTrigger. */
  open: boolean;
  /** Called when the user requests close (Escape, backdrop, ✕, Cancel, success CTA). */
  onClose: () => void;
  /** Override the default copy if needed (defaults to the feature-local CONSULTATION_COPY). */
  copy?: ConsultationCopy;
  /**
   * Optional source label of the trigger (e.g. "home", "court-detail", "saved",
   * "profile"). Mapped to the API's accepted `source` vocabulary (`court | paywall |
   * profile`) on submit — see `toApiSource`. An unmappable/absent label simply omits
   * `source` from the payload (it is optional in the contract).
   */
  source?: string;
}

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

// Minimal client-side shape check — NOT validation-as-a-feature, just enough to block an
// obviously-empty submit. This gates whether we attempt a submit; the API re-validates.
function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// The API's `source` is a closed vocabulary (`court | paywall | profile`), but the
// trigger `source` labels are richer ("home", "court-detail", "court-detail-location",
// "saved", "profile"). Map the trigger label down to an accepted value; anything we can't
// map yields `undefined`, so `source` is simply omitted (it is optional in the contract).
// No invented/fake data — just a narrowing of the existing label.
function toApiSource(source?: string): ConsultationSubmitDTO['source'] {
  if (!source) return undefined;
  if (source === 'profile') return 'profile';
  if (source === 'paywall') return 'paywall';
  // Every court-surface trigger ("court-detail", "court-detail-location") maps to "court".
  if (source.startsWith('court')) return 'court';
  // "home", "saved", and any future label have no API equivalent → omit.
  return undefined;
}

// The skill-level / group-size pill labels in CONSULTATION_COPY are authored to match the
// contract enum vocabularies EXACTLY (Beginner/Intermediate/Advanced/Pro and
// Solo/Couple/Family/Group), so a selected value is a valid enum member. These guards make
// that assumption explicit (and defend against future copy edits) — an off-vocabulary
// value is dropped rather than sent.
const SKILL_LEVELS: readonly SkillLevel[] = ['Beginner', 'Intermediate', 'Advanced', 'Pro'];
const GROUP_SIZES: readonly GroupSize[] = ['Solo', 'Couple', 'Family', 'Group'];

function asSkillLevel(value: string | null): SkillLevel | undefined {
  return value && (SKILL_LEVELS as readonly string[]).includes(value)
    ? (value as SkillLevel)
    : undefined;
}

function asGroupSize(value: string | null): GroupSize | undefined {
  return value && (GROUP_SIZES as readonly string[]).includes(value)
    ? (value as GroupSize)
    : undefined;
}

/**
 * Build the `ConsultationSubmitDTO` payload from the modal's form state.
 *
 * Field mapping (form → contract):
 *   name        → name (optional; omitted when blank)
 *   email       → email (required)
 *   destination → destinationInterest (required)
 *   skillLevel  → skillLevel (enum; omitted when unset)
 *   groupSize   → groupSize (enum; omitted when unset)
 *   message     → additionalRequest (optional)
 *   flexible    → isFlexible
 *
 * TIMEFRAME: the form's `timeframe` is free text ("Spring 2027, or a specific month"),
 * NOT an ISO date, so it is NOT sent as `travelStart`/`travelEnd` (the contract types
 * those as ISO strings the API parses with `new Date(...)`, which would choke on free
 * text). When the user typed a non-flexible timeframe we fold it into `additionalRequest`
 * alongside their message so no information is silently dropped. (Documented per the
 * prompt: no hidden fake data — the timeframe text is carried through verbatim.)
 */
function buildSubmitPayload(form: FormState, source?: string): ConsultationSubmitDTO {
  const message = form.message.trim();
  const timeframe = form.flexible ? '' : form.timeframe.trim();
  // Combine the free-text timeframe (if any) with the message into additionalRequest.
  const additionalRequest = [
    timeframe ? `Timeframe: ${timeframe}` : '',
    message,
  ]
    .filter(Boolean)
    .join('\n\n');

  const apiSource = toApiSource(source);
  const skillLevel = asSkillLevel(form.skillLevel);
  const groupSize = asGroupSize(form.groupSize);
  const name = form.name.trim();

  return {
    email: form.email.trim(),
    destinationInterest: form.destination.trim(),
    isFlexible: form.flexible,
    ...(name ? { name } : {}),
    ...(additionalRequest ? { additionalRequest } : {}),
    ...(skillLevel ? { skillLevel } : {}),
    ...(groupSize ? { groupSize } : {}),
    ...(apiSource ? { source: apiSource } : {}),
  };
}

interface FormState {
  name: string;
  email: string;
  destination: string;
  timeframe: string;
  flexible: boolean;
  message: string;
  skillLevel: string | null;
  groupSize: string | null;
}

const EMPTY_FORM: FormState = {
  name: '',
  email: '',
  destination: '',
  timeframe: '',
  flexible: false,
  message: '',
  skillLevel: null,
  groupSize: null,
};

type Errors = Partial<Record<'name' | 'email' | 'destination', string>>;

export function ConsultationModal({
  open,
  onClose,
  copy = CONSULTATION_COPY,
  source,
}: ConsultationModalProps) {
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  // Remember what had focus before opening so we can restore it on close.
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  // Submit lifecycle: `submitting` disables the button while the request is in flight;
  // `submitError` holds a non-blocking error message shown inline (modal stays open).
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reset all form/submission state every time the modal (re)opens, so the data never
  // outlives a single session-with-the-modal. (No persistence — hard rule.)
  useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM);
      setErrors({});
      setSubmitted(false);
      setSubmitting(false);
      setSubmitError(null);
    }
  }, [open]);

  // Close on Escape + lock body scroll while open + manage focus (same as PaywallModal).
  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move focus into the dialog. Prefer the first text field; fall back to the dialog
    // container for assistive tech.
    (firstFieldRef.current ?? dialogRef.current)?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Restore focus to whatever opened the modal (the trigger button).
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  // Render nothing when closed, and guard against SSR (portal needs a DOM).
  if (!open || typeof document === 'undefined') return null;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(state: FormState): Errors {
    const next: Errors = {};
    if (!state.name.trim()) next.name = 'Please enter your name.';
    if (!state.email.trim()) next.email = 'Please enter your email.';
    else if (!isLikelyEmail(state.email)) next.email = 'Please enter a valid email.';
    if (!state.destination.trim()) next.destination = 'Tell us where you’d like to play.';
    return next;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return; // ignore double-submits while a request is in flight
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    // Submit through the sanctioned repository boundary. The active implementation
    // (mock vs. HTTP) is chosen by the factory from NEXT_PUBLIC_DATA_SOURCE — this
    // component is agnostic. On success → in-modal confirmation; on failure → a
    // non-blocking inline error, modal stays open for retry.
    setSubmitError(null);
    setSubmitting(true);
    try {
      await repositories.consultation.submit(buildSubmitPayload(form, source));
      setSubmitted(true);
    } catch {
      setSubmitError(
        'Something went wrong submitting your request. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  const labelClass = 'eyebrow mb-1.5 block text-stone';
  const inputClass =
    'h-12 w-full border border-hairline bg-paper px-3.5 text-ink outline-none transition-colors placeholder:text-stone/60 focus:border-ink';

  return createPortal(
    // Backdrop — click closes (simple backdrop dismissal, matching PaywallModal).
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
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
        className="relative max-h-[92vh] w-full max-w-[560px] overflow-y-auto bg-paper px-[clamp(24px,5vw,48px)] py-[clamp(32px,5vw,48px)] text-ink outline-none"
      >
        {/* Close button (✕). */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 p-2 text-stone transition-colors hover:text-ink"
        >
          <CloseGlyph />
        </button>

        {submitted ? (
          // ── In-modal confirmation state ──────────────────────────────────────────
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
          // ── Request form ─────────────────────────────────────────────────────────
          <>
            {/* Gold "CONCIERGE" eyebrow flanked by hairline rules (matches the paywall). */}
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
              {/* Name (required) */}
              <div>
                <label className={labelClass} htmlFor={`${titleId}-name`}>
                  {copy.fields.nameLabel}
                </label>
                <input
                  ref={firstFieldRef}
                  id={`${titleId}-name`}
                  type="text"
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder={copy.fields.namePlaceholder}
                  aria-invalid={errors.name ? true : undefined}
                  className={inputClass}
                />
                {errors.name ? (
                  <p className="body-s mt-1.5 text-clay" role="alert">
                    {errors.name}
                  </p>
                ) : null}
              </div>

              {/* Email (required) */}
              <div>
                <label className={labelClass} htmlFor={`${titleId}-email`}>
                  {copy.fields.emailLabel}
                </label>
                <input
                  id={`${titleId}-email`}
                  type="email"
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                  placeholder={copy.fields.emailPlaceholder}
                  aria-invalid={errors.email ? true : undefined}
                  className={inputClass}
                />
                {errors.email ? (
                  <p className="body-s mt-1.5 text-clay" role="alert">
                    {errors.email}
                  </p>
                ) : null}
              </div>

              {/* Destination interest (required) */}
              <div>
                <label className={labelClass} htmlFor={`${titleId}-destination`}>
                  {copy.fields.destinationLabel}
                </label>
                <input
                  id={`${titleId}-destination`}
                  type="text"
                  value={form.destination}
                  onChange={(e) => update('destination', e.target.value)}
                  placeholder={copy.fields.destinationPlaceholder}
                  aria-invalid={errors.destination ? true : undefined}
                  className={inputClass}
                />
                {errors.destination ? (
                  <p className="body-s mt-1.5 text-clay" role="alert">
                    {errors.destination}
                  </p>
                ) : null}
              </div>

              {/* Travel timeframe + "Flexible" toggle (optional) */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="eyebrow block text-stone" htmlFor={`${titleId}-timeframe`}>
                    {copy.fields.timeframeLabel}
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-stone">
                    <input
                      type="checkbox"
                      checked={form.flexible}
                      onChange={(e) => update('flexible', e.target.checked)}
                      className="accent-ink"
                    />
                    <span className="body-s">{copy.fields.timeframeFlexibleLabel}</span>
                  </label>
                </div>
                <input
                  id={`${titleId}-timeframe`}
                  type="text"
                  value={form.flexible ? '' : form.timeframe}
                  onChange={(e) => update('timeframe', e.target.value)}
                  disabled={form.flexible}
                  placeholder={
                    form.flexible ? copy.fields.timeframeFlexibleLabel : copy.fields.timeframePlaceholder
                  }
                  className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-50`}
                />
              </div>

              {/* Skill level pills (optional) */}
              <fieldset className="m-0 border-0 p-0">
                <legend className={labelClass}>{copy.skillLevelLabel}</legend>
                <div className="flex flex-wrap gap-2">
                  {copy.skillLevels.map((level) => {
                    const active = form.skillLevel === level;
                    return (
                      <button
                        key={level}
                        type="button"
                        aria-pressed={active}
                        onClick={() => update('skillLevel', active ? null : level)}
                        className={`filter-pill ${active ? 'is-active' : ''}`}
                      >
                        {level}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {/* Group size pills (optional) */}
              <fieldset className="m-0 border-0 p-0">
                <legend className={labelClass}>{copy.groupSizeLabel}</legend>
                <div className="flex flex-wrap gap-2">
                  {copy.groupSizes.map((size) => {
                    const active = form.groupSize === size;
                    return (
                      <button
                        key={size}
                        type="button"
                        aria-pressed={active}
                        onClick={() => update('groupSize', active ? null : size)}
                        className={`filter-pill ${active ? 'is-active' : ''}`}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {/* Short message / notes (optional) */}
              <div>
                <label className={labelClass} htmlFor={`${titleId}-message`}>
                  {copy.fields.messageLabel}
                </label>
                <textarea
                  id={`${titleId}-message`}
                  value={form.message}
                  onChange={(e) => update('message', e.target.value)}
                  placeholder={copy.fields.messagePlaceholder}
                  rows={4}
                  className="w-full resize-y border border-hairline bg-paper px-3.5 py-2.5 text-ink outline-none transition-colors placeholder:text-stone/60 focus:border-ink"
                />
              </div>

              {/* Non-blocking submit error — modal stays open so the user can retry. */}
              {submitError ? (
                <p className="body-s -mb-1 text-clay" role="alert">
                  {submitError}
                </p>
              ) : null}

              {/* Actions. */}
              <div className="mt-2 flex flex-col gap-2.5">
                <button
                  type="submit"
                  disabled={submitting}
                  aria-busy={submitting || undefined}
                  className="btn btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
                >
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
