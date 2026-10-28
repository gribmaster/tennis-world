'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getMutationSavedRepository } from '@/lib/repositories.client';
import { AuthRequiredError } from '@/lib/repositories';
import { InlineSpinner } from '@/components/ui';
import { BookmarkGlyph } from '@/components/court/CourtCardSaveButton';

// CollectionSaveHeart — the circular save/unsave control overlaid on an editorial
// collection card or row (Task 42), mirroring `HomeCourtSaveHeart.tsx` line-for-line,
// adapted for a `Collection` instead of a `Court`.
//
// TASK_60 (v3): the mutation logic below is BYTE-FOR-BYTE unchanged — the optimistic
// flip, the `AuthRequiredError` rollback/redirect, the `.finally()` reset, the guest
// sign-in routing and the §4 triad. What TASK_60 added is purely presentational:
//   • `glyph`: `'heart'` (default, every pre-existing call site) or `'bookmark'` — v3's
//     `Ico.save`, used by the restyled "Curated for You" rows. Reuses the EXISTING
//     `BookmarkGlyph` the shared `CourtCardSaveButton` already draws (a named export
///    only — that component itself is untouched) instead of a third copy of the glyph.
//   • `className`: when given, REPLACES the default box classes (position/size/
//     background) — the colour classes below are always layered on top, computed from
//     `saved`, never baked into the caller's override.
//   • `idleColorClassName`: the idle/hover colour (default `'text-paper hover:text-saved'`,
//     this component's original look). The SAVED colour is always `text-saved` (TASK_59's
//     rule for courts, carried over here — it replaces the old `text-clay`).
//   • `state`: Collection Detail (TASK_60) renders this heart TWICE — once in the desktop
//     hero, once in the mobile floating bar — and the two must never disagree. Lifting the
//     state works exactly like `CourtSaveButton`'s `state`/`useCourtSaveState` pair: with
//     no `state` prop supplied, the component owns its own (via `useCollectionSaveState`,
//     extracted below so the host's shared-state wrapper can use the identical hook), so
//     every list call site (Curated rows, the Saved tab's editorial grid) is unaffected.
//
// NESTED INSIDE A CARD LINK: it is NOT. Rendered as a SIBLING of the card's
// `PendingCardLink`, at each call site's wrapping `<li>`.
//
// REPOSITORY: `getMutationSavedRepository()` — the same accessor `HomeCourtSaveHeart`
// uses, since `SavedRepository` carries both court and collection mutation methods.

/** Heart glyph — same path/visual language as HomeCourtSaveHeart's. `size` added (TASK_60) so the Collection Detail hero/bar (18px) and every pre-existing 16px call site share one glyph. */
function HeartGlyph({ filled, size = 16 }: { filled: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

/** The lifted save state — same shape as `CourtSaveButton`'s `CourtSaveState`. */
export interface CollectionSaveState {
  saved: boolean;
  pending: boolean;
  signedIn: boolean;
  onToggle: () => void;
}

export interface UseCollectionSaveStateOptions {
  collectionId: string;
  collectionSlug: string;
  initialSaved: boolean;
  signedIn?: boolean;
  /**
   * Reported right after the optimistic flip, and again with the restored value on
   * rollback. Only the list call sites (which own no OTHER instance to keep in sync)
   * pass this; the Collection Detail shared-state use (TASK_60) omits it.
   */
  onSavedChange?: (saved: boolean) => void;
}

/**
 * The save/unsave behaviour, extracted (TASK_60, mirroring `useCourtSaveState`) ONLY so
 * two controls (Collection Detail's hero heart + mobile bar heart) can share one state
 * instead of drifting apart. Nothing about the optimistic flip, the AuthRequiredError
 * rollback, the sign-in routing or the `finally` reset changed from the original inline
 * handler.
 */
export function useCollectionSaveState({
  collectionId,
  collectionSlug,
  initialSaved,
  signedIn = true,
  onSavedChange,
}: UseCollectionSaveStateOptions): CollectionSaveState {
  const router = useRouter();
  const savedRepo = useMemo(() => getMutationSavedRepository(), []);

  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);

  const signInHref = `/signin?redirectTo=${encodeURIComponent(`/collections/${collectionSlug}`)}`;

  const onToggle = useCallback(() => {
    if (!signedIn) {
      router.push(signInHref);
      return;
    }
    if (pending) return;

    const next = !saved;
    setSaved(next); // optimistic
    onSavedChange?.(next);
    setPending(true);

    const write = next
      ? savedRepo.saveCollection(collectionId)
      : savedRepo.unsaveCollection(collectionId);

    void write
      .catch((err: unknown) => {
        // Roll back either way so the control reflects the true server state.
        setSaved(!next);
        onSavedChange?.(!next);
        if (err instanceof AuthRequiredError) router.push(signInHref);
      })
      .finally(() => setPending(false));
  }, [collectionId, onSavedChange, pending, savedRepo, router, saved, signInHref, signedIn]);

  return { saved, pending, signedIn, onToggle };
}

/** Default box: a 36×36 dark-glass circle over a photo (Featured-strip/Saved-tab look). */
const DEFAULT_BOX_CLASSNAME =
  'absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-pill bg-ink/35 backdrop-blur-sm transition-colors disabled:opacity-60';

export interface CollectionSaveHeartProps {
  collectionId: string;
  collectionSlug: string;
  /**
   * Accessible name for the control — the DISPLAYED name (editorial collections
   * aren't masked today, but this mirrors `HomeCourtSaveHeart`'s `courtLabel` for
   * consistency and future-proofing).
   */
  collectionLabel: string;
  /** Server-computed saved state (page.tsx, from `saved.getSavedEditorialCollections()`). */
  initialSaved: boolean;
  /** False for a logged-out visitor in `api` mode → the click routes to /signin. */
  signedIn?: boolean;
  /** Called with the new saved state right after the optimistic flip (and on rollback). */
  onSavedChange?: (saved: boolean) => void;
  /** `'heart'` (default) or v3's bookmark (`Ico.save`) — TASK_60's Curated rows. */
  glyph?: 'heart' | 'bookmark';
  /** Pixel size of the HEART glyph only; the bookmark renders its own responsive 14/15px pair (matching `CourtCardSaveButton`). Defaults to 16 (every pre-existing call site). */
  size?: number;
  /** Replaces the default box (position/size/background) classes. Colour is always computed here, never part of this override. */
  className?: string;
  /** Idle/hover colour. Defaults to the original look. Ignored once saved — saved is always `text-saved`. */
  idleColorClassName?: string;
  /** Lifted state (TASK_60) — see the file header. Omit to let this instance own its state. */
  state?: CollectionSaveState;
}

export function CollectionSaveHeart({
  collectionId,
  collectionSlug,
  collectionLabel,
  initialSaved,
  signedIn = true,
  onSavedChange,
  glyph = 'heart',
  size = 16,
  className,
  idleColorClassName = 'text-paper hover:text-saved',
  state,
}: CollectionSaveHeartProps) {
  // Own state when the caller didn't lift it. Called unconditionally (rules of hooks);
  // when `state` is supplied its result is simply not the one rendered.
  const ownState = useCollectionSaveState({
    collectionId,
    collectionSlug,
    initialSaved,
    signedIn,
    onSavedChange,
  });
  const { saved, pending, onToggle } = state ?? ownState;
  const effectiveSignedIn = state ? state.signedIn : signedIn;
  const isSaved = effectiveSignedIn && saved;

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      // The card link is a sibling, not an ancestor — this is defensive only.
      event.stopPropagation();
      event.preventDefault();
      onToggle();
    },
    [onToggle],
  );

  const colorClassName = isSaved ? 'text-saved' : idleColorClassName;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-busy={pending}
      aria-disabled={pending || undefined}
      aria-pressed={effectiveSignedIn ? saved : undefined}
      aria-label={isSaved ? `Unsave ${collectionLabel}` : `Save ${collectionLabel}`}
      className={[className ?? DEFAULT_BOX_CLASSNAME, colorClassName].join(' ')}
    >
      {pending ? (
        // Inherits currentColor (TASK_60) so it reads correctly on the dark-glass,
        // bone and glass-paper circles alike — no hardcoded spinner colour.
        <InlineSpinner label="Saving…" />
      ) : glyph === 'bookmark' ? (
        <>
          <span className="md:hidden">
            <BookmarkGlyph size={14} />
          </span>
          <span className="hidden md:inline-flex">
            <BookmarkGlyph size={15} />
          </span>
        </>
      ) : (
        <HeartGlyph filled={isSaved} size={size} />
      )}
    </button>
  );
}
