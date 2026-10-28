'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getMutationSavedRepository } from '@/lib/repositories.client';
import { AuthRequiredError } from '@/lib/repositories';
import { InlineSpinner } from '@/components/ui';

// CourtCardSaveButton — the ONE shared bookmark save/unsave control for the v3
// `CourtCard` (TASK_56). Merges what `HomeCourtSaveHeart` / `CollectionCourtSaveHeart` /
// `UserCollectionCourtSaveHeart` each did (those are superseded by this component — see
// CourtCard's own header comment on the "one heart per screen" convention ending) with
// v3's bookmark visuals and its guest "Sign in to save" tooltip.
//
// BEHAVIOUR — identical to the superseded hearts, and the CLAUDE.md §4 rule-2 triad:
//   • local pending state + `disabled` + `aria-busy` + `<InlineSpinner label="Saving…" />`,
//   • optimistic flip, rolled back on ANY failure so the UI matches the server,
//   • `pending` reset in an unconditional `.finally()` — never left stuck (§4 rule 7),
//   • element dimensions never change: the spinner swaps 1:1 with the glyph inside a
//     fixed box (§4 rule 5),
//   • `AuthRequiredError` mid-session → roll back and route to /signin.
//
// GUEST (`signedIn === false`, v3): rather than routing straight to /signin on click (the
// superseded hearts' behaviour), v3 dims the button and a click opens a small tooltip
// with a "Sign in to save" link — so this component still ends at /signin, but shows the
// v3 affordance on the way there. The tooltip closes on outside click / Escape.
//
// NESTED INSIDE A CARD LINK: it is NOT — CourtCard renders this as a SIBLING of its
// PendingCardLink, positioned over it, so a click here can never be a click on the
// card's anchor. `stopPropagation` is belt-and-braces for the pointer landing on the
// shared parent.
//
// REPOSITORY: `getMutationSavedRepository()` — the in-memory seam in mock mode, the
// protected POST/DELETE /v1/me/saved-courts in `api` mode (httpOnly cookie via
// `credentials:'include'`), or a server action in staging demo mode so the demo secret
// stays server-side. This island never fetches reads; `initialSaved` comes from the page.

/**
 * v3's `Ico.save` — a bookmark, not a heart. Exported (TASK_60) so
 * `features/collections/CollectionSaveHeart.tsx` can render the same glyph for its
 * `glyph="bookmark"` variant instead of drawing a third copy. This component's own
 * behaviour is otherwise unchanged.
 */
export function BookmarkGlyph({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export interface CourtCardSaveButtonProps {
  courtId: string;
  courtSlug: string;
  /** The DISPLAYED name (may be "Premium Court") — used in aria-label, never the real masked name. */
  courtLabel: string;
  initialSaved: boolean;
  /** false → v3's disabled/guest state: dimmed, click opens a "Sign in to save" tooltip. */
  signedIn: boolean;
  /**
   * Optional: told about every committed/rolled-back state change. Saved uses it to
   * remove the card from its list the moment it is unsaved (and restore it on failure).
   */
  onSavedChange?: (saved: boolean) => void;
}

export function CourtCardSaveButton({
  courtId,
  courtSlug,
  courtLabel,
  initialSaved,
  signedIn,
  onSavedChange,
}: CourtCardSaveButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const savedRepo = useMemo(() => getMutationSavedRepository(), []);

  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const signInHref = `/signin?redirectTo=${encodeURIComponent(pathname || `/courts/${courtSlug}`)}`;

  // Close the guest tooltip on outside click / Escape.
  useEffect(() => {
    if (!tooltipOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setTooltipOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setTooltipOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [tooltipOpen]);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      // The card link is a sibling, not an ancestor — this is defensive only.
      event.stopPropagation();
      event.preventDefault();

      if (!signedIn) {
        setTooltipOpen((open) => !open);
        return;
      }
      if (pending) return;

      const next = !saved;
      setSaved(next); // optimistic
      onSavedChange?.(next);
      setPending(true);

      const write = next ? savedRepo.saveCourt(courtId) : savedRepo.unsaveCourt(courtId);

      void write
        .catch((err: unknown) => {
          // Roll back either way so the button reflects the true server state.
          setSaved(!next);
          onSavedChange?.(!next);
          if (err instanceof AuthRequiredError) router.push(signInHref);
        })
        .finally(() => setPending(false));
    },
    [courtId, onSavedChange, pending, router, saved, savedRepo, signInHref, signedIn],
  );

  const isSaved = signedIn && saved;
  const label = isSaved ? `Unsave ${courtLabel}` : `Save ${courtLabel}`;

  return (
    <div ref={rootRef} className="absolute right-2.5 top-2.5 md:right-3 md:top-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-busy={pending}
        aria-disabled={pending || undefined}
        aria-pressed={signedIn ? saved : undefined}
        aria-label={label}
        // Fixed box (34×34 md+ / 32×32 below) so swapping glyph ↔ spinner never reflows.
        className={[
          'flex h-8 w-8 items-center justify-center rounded-pill bg-ink/45 backdrop-blur-[8px]',
          'transition-colors disabled:opacity-60 md:h-[34px] md:w-[34px]',
          !signedIn ? 'cursor-not-allowed text-bone/50' : isSaved ? 'text-saved' : 'text-bone',
        ].join(' ')}
      >
        {pending ? (
          <InlineSpinner label="Saving…" className="text-bone" />
        ) : (
          <span className="md:hidden">
            <BookmarkGlyph size={14} />
          </span>
        )}
        {!pending ? (
          <span className="hidden md:inline-flex">
            <BookmarkGlyph size={15} />
          </span>
        ) : null}
      </button>

      {!signedIn && tooltipOpen ? (
        <div
          role="tooltip"
          className="absolute right-0 top-[115%] z-20 whitespace-nowrap rounded-md bg-ink px-2.5 py-1.5 text-[11px] font-medium text-bone shadow-card"
        >
          <a
            href={signInHref}
            className="hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            Sign in to save
          </a>
        </div>
      ) : null}
    </div>
  );
}
