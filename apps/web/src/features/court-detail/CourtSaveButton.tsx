'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getMutationSavedRepository } from '@/lib/repositories.client';
import { AuthRequiredError } from '@/lib/repositories';

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
}

export function CourtSaveButton({
  courtId,
  courtSlug,
  initialSaved,
  signedIn = true,
  className,
}: CourtSaveButtonProps) {
  const router = useRouter();
  // Mutation repo: normal browser-cookie path, OR server-action-backed in staging demo mode
  // (no cookie there — the secret stays server-side). Reads still come from server props.
  const savedRepo = useMemo(() => getMutationSavedRepository(), []);

  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);

  const signInHref = `/signin?redirectTo=${encodeURIComponent(`/courts/${courtSlug}`)}`;

  const handleClick = useCallback(() => {
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

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={signedIn ? saved : undefined}
      className={
        className ??
        'inline-flex h-9 items-center gap-1.5 border border-hairline bg-transparent px-3.5 text-[12px] text-stone transition-colors hover:text-ink'
      }
    >
      <HeartGlyph filled={signedIn && saved} />
      {saved && signedIn ? 'Saved' : 'Save Court'}
    </button>
  );
}
