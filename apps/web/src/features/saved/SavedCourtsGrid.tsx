'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CourtSummaryDTO } from '@tennis/contracts';
import { CourtCard } from '@/components/court';
import { getMutationSavedRepository } from '@/lib/repositories.client';
import { AuthRequiredError } from '@/lib/repositories';
import { SavedEmptyState } from './SavedEmptyState';

// SavedCourtsGrid — the Courts tab of the Saved page (FEATURE_19 §3.1). A responsive grid
// of saved courts rendered with the shared CourtCard.
//
// INTERACTIVE UNSAVE (Saved-court flow audit): previously this was a presentational server
// component whose CourtCard heart was VISUAL-ONLY. It is now a small client island so the
// heart works: each card carries an "Unsave" control that calls the SavedRepository
// (`unsaveCourt`) and removes the card from the grid. CourtCard itself is UNCHANGED (still
// presentational, still no onClick) — the interactive control is a sibling overlay button,
// so the card's use elsewhere (Home/Map/related) is unaffected and the page is not
// redesigned. Every court here is saved, so CourtCard still renders a filled heart.
//
// REPOSITORY / AUTH (mirrors the other saved islands): the write goes through
// `getMutationSavedRepository()` — the in-memory seam in mock mode, the protected
// DELETE /v1/me/saved-courts/:courtId in `api` mode (httpOnly cookie via
// credentials:'include', or a server action in staging demo mode). Removal is OPTIMISTIC
// (the card disappears immediately); a
// session that expired mid-use surfaces as `AuthRequiredError`, on which we restore the
// card and route to /signin (Saved is a private page — the same redirect the server uses).
//
// DATA-DRIVEN: the seed list arrives via the `courts` prop (server-fetched in page.tsx →
// SavedTabs). This island imports no @tennis/mock-data and hardcodes no court data.

/** Small X glyph for the unsave control — inline to avoid an icon dependency (hard rule). */
function CloseGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export interface SavedCourtsGridProps {
  courts: CourtSummaryDTO[];
}

export function SavedCourtsGrid({ courts }: SavedCourtsGridProps) {
  const router = useRouter();
  // Mutation repo: browser-cookie path, OR server-action-backed in staging demo mode.
  const savedRepo = useMemo(() => getMutationSavedRepository(), []);

  // Local, optimistic copy of the saved list — seeded from the server prop. Unsaving a
  // court removes it here immediately; a failed write restores it.
  const [items, setItems] = useState<CourtSummaryDTO[]>(courts);
  // Courts with an in-flight unsave (disables the control, prevents a double-fire).
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());

  const handleUnsave = useCallback(
    (court: CourtSummaryDTO) => {
      if (pending.has(court.id)) return;

      // Optimistic remove + mark pending.
      setItems((prev) => prev.filter((c) => c.id !== court.id));
      setPending((prev) => new Set(prev).add(court.id));

      void savedRepo
        .unsaveCourt(court.id)
        .catch((err: unknown) => {
          // Restore the card on any failure so the grid reflects the true server state.
          setItems((prev) =>
            prev.some((c) => c.id === court.id) ? prev : [...prev, court],
          );
          if (err instanceof AuthRequiredError) {
            // Session expired on a private page → sign in again (matches the server redirect).
            router.push('/signin?redirectTo=/saved');
          }
        })
        .finally(() =>
          setPending((prev) => {
            const next = new Set(prev);
            next.delete(court.id);
            return next;
          }),
        );
    },
    [pending, savedRepo, router],
  );

  if (items.length === 0) {
    return (
      <SavedEmptyState
        title="No saved courts yet."
        description="Save your favourites — they'll wait here for you."
        cta={{ href: '/map', label: 'Explore the map' }}
      />
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((court) => (
        <li key={court.id} className="relative">
          {/* CourtCard is presentational; its own bottom-right heart is not shown here
              (`showSaved` omitted) because the interactive unsave control below occupies
              that spot. The card layout itself is unchanged. */}
          <CourtCard court={court} href={`/courts/${court.slug}`} />
          {/* Unsave overlay — a sibling of the CourtCard, positioned over its bottom-right
              (where the visual saved-heart would sit) so the card layout is untouched. Sits
              above the card's own Link via z-index so the click unsaves rather than
              navigating. A filled heart reads "saved"; clicking it removes the court. */}
          <button
            type="button"
            onClick={() => handleUnsave(court)}
            disabled={pending.has(court.id)}
            aria-label={`Unsave ${court.name}`}
            title="Unsave"
            className="absolute bottom-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-pill bg-black/35 text-clay backdrop-blur-sm transition-colors hover:text-paper disabled:opacity-50"
          >
            <CloseGlyph />
          </button>
        </li>
      ))}
    </ul>
  );
}
