'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getMutationSavedRepository } from '@/lib/repositories.client';
import { AuthRequiredError } from '@/lib/repositories';
import { InlineSpinner } from '@/components/ui';

// CollectionSaveHeart — the circular save/unsave heart overlaid on an editorial
// collection card (Task 42), mirroring `HomeCourtSaveHeart.tsx` line-for-line,
// adapted for a `Collection` instead of a `Court`.
//
// WHY A NEW COMPONENT RATHER THAN REUSING `HomeCourtSaveHeart`: same shape, wrong
// object — it is typed for a court id/slug/label and calls `saveCourt`/`unsaveCourt`.
// This is the sibling-object equivalent, same as `SavedCourtsGrid`'s unsave overlay
// and `HomeCourtSaveHeart` are screen/object-local rather than shared.
//
// BEHAVIOUR — identical triad to HomeCourtSaveHeart, and the CLAUDE.md §4 rule-2 triad:
//   • local pending state + `disabled` + `aria-busy` + `<InlineSpinner label="Saving…" />`,
//   • optimistic flip, rolled back on ANY failure so the UI matches the server,
//   • `pending` reset in an unconditional `.finally()` — never left stuck (§4 rule 7),
//   • element dimensions never change: the spinner swaps 1:1 with the heart inside a
//     fixed 36×36 box (§4 rule 5),
//   • logged out (public page, `api` mode) → no mutation, route to /signin with a
//     `redirectTo` back to this collection, matching CourtSaveButton/HomeCourtSaveHeart,
//   • `AuthRequiredError` mid-session → roll back and route to /signin.
//
// NESTED INSIDE A CARD LINK: it is NOT. Rendered as a SIBLING of the card's
// `PendingCardLink`, at each call site's wrapping `<li>` — `CollectionCard` and
// `CuratedCollectionCard` themselves are not edited (see those call sites).
//
// POSITION: `absolute right-3 top-3` — both `CollectionCard` and `CuratedCollectionCard`
// have their count pill at `left-2`/`left-2.5 top-2`/`top-2.5`, so the top-right corner
// is free on both.
//
// REPOSITORY: `getMutationSavedRepository()` — the same accessor `HomeCourtSaveHeart`
// uses, since `SavedRepository` now carries both court and collection mutation methods.

/** Heart glyph — same path/visual language as HomeCourtSaveHeart's. */
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
  /**
   * Called with the new saved state right after the optimistic flip (and again, with the
   * restored value, on rollback). Optional — most call sites just render the heart in
   * place; `SavedEditorialCollectionsGrid` uses it to lift the toggle into its parent's
   * `unsavedIds` set so a card disappears from that list the moment it's unsaved, the same
   * way `SavedCourtsGrid`'s unsave button does via `onUnsavedChange`.
   */
  onSavedChange?: (saved: boolean) => void;
}

export function CollectionSaveHeart({
  collectionId,
  collectionSlug,
  collectionLabel,
  initialSaved,
  signedIn = true,
  onSavedChange,
}: CollectionSaveHeartProps) {
  const router = useRouter();
  const savedRepo = useMemo(() => getMutationSavedRepository(), []);

  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);

  const signInHref = `/signin?redirectTo=${encodeURIComponent(`/collections/${collectionSlug}`)}`;

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      // The card link is a sibling, not an ancestor — this is defensive only.
      event.stopPropagation();
      event.preventDefault();

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
          // Roll back either way so the heart reflects the true server state.
          setSaved(!next);
          onSavedChange?.(!next);
          if (err instanceof AuthRequiredError) router.push(signInHref);
        })
        .finally(() => setPending(false));
    },
    [collectionId, onSavedChange, pending, savedRepo, router, saved, signInHref, signedIn],
  );

  const isSaved = signedIn && saved;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-busy={pending}
      aria-disabled={pending || undefined}
      aria-pressed={signedIn ? saved : undefined}
      aria-label={isSaved ? `Unsave ${collectionLabel}` : `Save ${collectionLabel}`}
      // Fixed 36×36 box (matches HomeCourtSaveHeart's geometry) so swapping heart ↔
      // spinner never reflows.
      className={[
        'absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-pill',
        'bg-ink/35 backdrop-blur-sm transition-colors disabled:opacity-60',
        isSaved ? 'text-clay' : 'text-paper hover:text-clay',
      ].join(' ')}
    >
      {pending ? (
        <InlineSpinner label="Saving…" className="text-paper" />
      ) : (
        <HeartGlyph filled={isSaved} />
      )}
    </button>
  );
}
