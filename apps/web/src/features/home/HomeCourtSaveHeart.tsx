'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getMutationSavedRepository } from '@/lib/repositories.client';
import { AuthRequiredError } from '@/lib/repositories';
import { InlineSpinner } from '@/components/ui';

// HomeCourtSaveHeart — the circular save/unsave heart overlaid on a Home featured card
// (prototype: 36×36, `top:12 right:12`, translucent ink circle, filled heart when saved
// — design_v2_stripped.html:545–549).
//
// WHY NOT `features/court-detail/CourtSaveButton`: that component was checked first, as
// the brief requires, and it does not fit — not because of the write logic (which is
// identical, and is deliberately reproduced here rule for rule) but because of its SHAPE.
// It renders a labelled control ("Save Court" / "Saved" text beside the glyph) sized as a
// bordered 36px-tall inline button, and its `className` prop REPLACES its default classes
// wholesale while the text remains unconditional. A card overlay needs a 36×36 icon-only
// circle with an accessible NAME rather than visible text. Passing a className could not
// remove the text node, and adding an `iconOnly` variant would mean editing Court Detail's
// control to serve Home — a change to a screen this feature is scoped out of. So the
// PRESENTATION is screen-local (as SavedCourtsGrid's unsave overlay already is, for the
// same reason) and the BEHAVIOUR is the same audited triad.
//
// BEHAVIOUR — identical to CourtSaveButton, and the CLAUDE.md §4 rule-2 triad:
//   • local pending state + `disabled` + `aria-busy` + `<InlineSpinner label="Saving…" />`,
//   • optimistic flip, rolled back on ANY failure so the UI matches the server,
//   • `pending` reset in an unconditional `.finally()` — never left stuck (§4 rule 7),
//   • element dimensions never change: the spinner swaps 1:1 with the heart inside a
//     fixed 36×36 box (§4 rule 5),
//   • logged out (public page, `api` mode) → no mutation, route to /signin with a
//     `redirectTo` back to this court, matching CourtSaveButton exactly,
//   • `AuthRequiredError` mid-session → roll back and route to /signin.
//
// NESTED INSIDE A CARD LINK: it is NOT. The heart is rendered as a SIBLING of the
// PendingCardLink, positioned over it — the pattern SavedCourtsGrid already uses — so a
// click on the heart can never be a click on the card's anchor. `stopPropagation` on top
// of that is belt-and-braces for the pointer landing on the shared parent.
//
// REPOSITORY: `getMutationSavedRepository()` — the in-memory seam in mock mode, the
// protected POST/DELETE /v1/me/saved-courts in `api` mode (httpOnly cookie via
// `credentials:'include'`), or a server action in staging demo mode so the demo secret
// stays server-side. This island never fetches reads; `initialSaved` comes from the page.

/** Heart glyph — same path/visual language as CourtSaveButton's. */
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

export interface HomeCourtSaveHeartProps {
  courtId: string;
  courtSlug: string;
  /**
   * Accessible name for the control. The card may be showing "Premium Court" instead of
   * the real name, so the caller passes the DISPLAYED name — the label must not leak a
   * masked name the card itself is not showing.
   */
  courtLabel: string;
  /** Server-computed saved state (page.tsx, from `saved.getSavedCourts()`). */
  initialSaved: boolean;
  /** False for a logged-out visitor in `api` mode → the click routes to /signin. */
  signedIn?: boolean;
}

export function HomeCourtSaveHeart({
  courtId,
  courtSlug,
  courtLabel,
  initialSaved,
  signedIn = true,
}: HomeCourtSaveHeartProps) {
  const router = useRouter();
  const savedRepo = useMemo(() => getMutationSavedRepository(), []);

  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);

  const signInHref = `/signin?redirectTo=${encodeURIComponent(`/courts/${courtSlug}`)}`;

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
      setPending(true);

      const write = next ? savedRepo.saveCourt(courtId) : savedRepo.unsaveCourt(courtId);

      void write
        .catch((err: unknown) => {
          // Roll back either way so the heart reflects the true server state.
          setSaved(!next);
          if (err instanceof AuthRequiredError) router.push(signInHref);
        })
        .finally(() => setPending(false));
    },
    [courtId, pending, savedRepo, router, saved, signInHref, signedIn],
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
      aria-label={isSaved ? `Unsave ${courtLabel}` : `Save ${courtLabel}`}
      // Fixed 36×36 box (prototype geometry) so swapping heart ↔ spinner never reflows.
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
