'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getMutationSavedRepository } from '@/lib/repositories.client';
import { AuthRequiredError } from '@/lib/repositories';
import { InlineSpinner } from '@/components/ui';

// CourtSaveButton — the standalone Save / Unsave (heart) control for Court Detail.
//
// This is the individual-court save toggle, DISTINCT from the "Add to Collection" menu
// (SaveToCollectionMenu, folder membership). It backs the API's Feature-54 endpoints
// (POST/DELETE /v1/me/saved-courts) through the SavedRepository's `saveCourt`/`unsaveCourt`
// — the pair the web layer was previously missing, which left those endpoints unreachable.
//
// REPOSITORY (mirrors SaveToCollectionMenu): the write goes through the SavedRepository via
// `getMutationSavedRepository()`. In MOCK mode that's the in-memory seam (no backend/
// persistence); in `api` mode it's the protected endpoint, reached with the httpOnly session
// cookie (`credentials:'include'`), OR — in STAGING DEMO MODE (Feature 76, no cookie) —
// routed through a server action so the demo secret stays server-side. The UI is identical.
//
// AUTH (mirrors SaveToCollectionMenu): Court Detail is PUBLIC. For a logged-out visitor in
// `api` mode `signedIn` is false — the button does NOT mutate; clicking routes to
// `/signin?redirectTo=/courts/{slug}` (consistent with the existing sign-in prompt). A
// session that expires mid-use surfaces as `AuthRequiredError` from the write; we roll back
// the optimistic flip and route to /signin. (In mock mode `signedIn` is always true.)
//
// STATE: `saved` is LOCAL, seeded from the server-computed `initialSaved` and flipped
// optimistically on click (the button stays responsive; no server re-read on the happy
// path). `pending` disables the button during the in-flight write so a double-click can't
// race two opposite mutations.
//
// SHARED STATE (Feature 78, ADDITIVE — the mutation logic below is untouched): the v2
// Court Detail renders this control TWICE — once over the hero image, once in the sticky
// footer bar — and the two must never disagree about whether the court is saved. So the
// state can optionally be LIFTED: `useCourtSaveState()` builds the exact same
// `saved`/`pending`/`handleClick` triple once in the parent, and each button receives it
// via the `state` prop instead of owning its own copy. With no `state` prop the component
// behaves exactly as it always has (its own hook call), which is how every pre-existing
// call site — the CTA panel's full-width button — still renders.
//
// APPEARANCE (Feature 78, ADDITIVE): `presentation="icon"` renders the heart glyph alone
// with an accessible label, for the circular over-image control in the hero and the
// 52×52 square in the footer. `presentation="label"` (the default) keeps the original
// glyph + "Save Court" / "Saved" text. Either way the §4 triad is identical: `disabled`,
// `aria-busy`, and an `InlineSpinner` swapped 1:1 for the glyph so the box never resizes.

/** Heart glyph — same visual language as CourtCard's; `filled` toggles the saved look. */
function HeartGlyph({ filled }: { filled: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
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

/** The lifted save state: exactly what the button needs to render and act. */
export interface CourtSaveState {
  saved: boolean;
  pending: boolean;
  signedIn: boolean;
  onToggle: () => void;
}

export interface UseCourtSaveStateOptions {
  courtId: string;
  courtSlug: string;
  initialSaved: boolean;
  signedIn?: boolean;
}

/**
 * The save/unsave behaviour, verbatim from the original component body — extracted ONLY
 * so two buttons (hero + sticky footer) can share one state instead of drifting apart.
 * Nothing about the optimistic flip, the AuthRequiredError rollback, the sign-in routing
 * or the `finally` reset changed.
 */
export function useCourtSaveState({
  courtId,
  courtSlug,
  initialSaved,
  signedIn = true,
}: UseCourtSaveStateOptions): CourtSaveState {
  const router = useRouter();
  // Mutation repo: normal browser-cookie path, OR server-action-backed in staging demo mode
  // (no cookie there — the secret stays server-side). Reads still come from server props.
  const savedRepo = useMemo(() => getMutationSavedRepository(), []);

  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);

  const signInHref = `/signin?redirectTo=${encodeURIComponent(`/courts/${courtSlug}`)}`;

  const onToggle = useCallback(() => {
    // Logged-out on this public page: prompt sign-in instead of a silent failed write —
    // consistent with SaveToCollectionMenu / the private-page redirect behaviour.
    if (!signedIn) {
      router.push(signInHref);
      return;
    }
    if (pending) return;

    const next = !saved;
    setSaved(next); // optimistic
    setPending(true);

    const write = next
      ? savedRepo.saveCourt(courtId)
      : savedRepo.unsaveCourt(courtId);

    void write
      .catch((err: unknown) => {
        if (err instanceof AuthRequiredError) {
          // Session expired mid-use: roll back and send to sign-in (same as the menu).
          setSaved(!next);
          router.push(signInHref);
          return;
        }
        // Other (network) errors: roll back so the UI reflects the true server state.
        setSaved(!next);
      })
      .finally(() => setPending(false));
  }, [courtId, pending, savedRepo, router, saved, signInHref, signedIn]);

  return { saved, pending, signedIn, onToggle };
}

export interface CourtSaveButtonProps {
  /** The court to save/unsave (its `id`, matching COURTS[].id / CourtSummaryDTO.id). */
  courtId: string;
  /** The court's slug — used only to build the sign-in return path for a logged-out click. */
  courtSlug: string;
  /**
   * Whether this court is already in the user's saved courts, computed on the server
   * (page.tsx via `repositories.saved.isCourtSaved(court.id)`). Seeds the pressed state.
   */
  initialSaved: boolean;
  /**
   * Whether the visitor is signed in (Feature 57). When false (logged-out visitor in `api`
   * mode on this PUBLIC page), the button performs NO mutation and routes to /signin.
   * Always true in mock mode. Defaults to true so existing callers/tests are unaffected.
   */
  signedIn?: boolean;
  /** Optional class names applied to the button (the CTA panel passes the shared btn width). */
  className?: string;
  /**
   * LIFTED state (Feature 78). When supplied, this button renders and acts on the caller's
   * shared `useCourtSaveState()` result instead of owning its own — so the hero control and
   * the sticky-footer control are always in agreement. Omit it and the component is exactly
   * what it was before: self-contained.
   */
  state?: CourtSaveState;
  /**
   * `"label"` (default) = the original heart + "Save Court" / "Saved" text.
   * `"icon"` = the heart alone, with the text moved to `aria-label`/`title`, for the
   * circular over-image control and the square footer control. Purely visual.
   */
  presentation?: 'label' | 'icon';
  /**
   * The court name AS DISPLAYED by the host page (Feature 79). When supplied, the icon
   * presentation's accessible name names the court — "Save Sunset Club" — using the
   * DISPLAYED string, which on the locked page is the masked placeholder. That keeps the
   * mask out of the accessibility tree, the same rule `HomeCourtSaveHeart` follows.
   * Omitted ⇒ the original generic "Save Court" / "Saved" label, unchanged.
   */
  courtLabel?: string;
}

export function CourtSaveButton({
  courtId,
  courtSlug,
  initialSaved,
  signedIn = true,
  className,
  state,
  presentation = 'label',
  courtLabel,
}: CourtSaveButtonProps) {
  // Own state when the caller didn't lift it. The hook is called unconditionally (rules of
  // hooks); when `state` is supplied its result is simply not the one rendered.
  const ownState = useCourtSaveState({ courtId, courtSlug, initialSaved, signedIn });
  const { saved, pending, onToggle } = state ?? ownState;
  const effectiveSignedIn = state ? state.signedIn : signedIn;

  const label = saved && effectiveSignedIn ? 'Saved' : 'Save Court';
  // Icon-only controls get a name that says WHAT is being saved. Built from the DISPLAYED
  // name, never the real one behind a mask.
  const iconLabel = courtLabel
    ? saved && effectiveSignedIn
      ? `Unsave ${courtLabel}`
      : `Save ${courtLabel}`
    : label;

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      aria-busy={pending}
      aria-disabled={pending || undefined}
      aria-pressed={effectiveSignedIn ? saved : undefined}
      aria-label={presentation === 'icon' ? iconLabel : undefined}
      title={presentation === 'icon' ? iconLabel : undefined}
      className={
        className ??
        'inline-flex h-9 items-center gap-1.5 border border-hairline bg-transparent px-3.5 text-[12px] text-stone transition-colors hover:text-ink'
      }
    >
      {/* Spinner swaps 1:1 for the glyph (both 16px), so the control never resizes while
          pending — CLAUDE.md §4 rule 5. */}
      {pending ? (
        <InlineSpinner label="Saving…" />
      ) : (
        <HeartGlyph filled={effectiveSignedIn && saved} />
      )}
      {presentation === 'label' ? label : null}
    </button>
  );
}
