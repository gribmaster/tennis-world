'use client';

import { cloneElement, isValidElement, type ReactNode } from 'react';
import type { UserCollectionDTO } from '@tennis/contracts';
import { CourtDetailGalleryProvider, CourtDetailGalleryHero } from './CourtDetailGallery';
import { CourtDetailShareButton } from './CourtDetailShareButton';
import { CourtSaveButton, useCourtSaveState } from './CourtSaveButton';
import { SaveToCollectionMenu } from './SaveToCollectionMenu';
import type { CourtImageDTO } from '@tennis/contracts';

// CourtDetailShell — the client shell for Court Detail. It exists for exactly two
// reasons, both of them state-sharing:
//
//   1. The gallery's active image (and, since TASK_59, the shared lightbox index) is read
//      by the hero band AND the "Gallery" thumbnail strip, which the layout separates by
//      several sections. `CourtDetailGalleryProvider` wraps the whole body so both read
//      one index.
//   2. The save control appears up to FOUR times now (TASK_59: the mobile floating action
//      bar's heart, the desktop inline action row's heart — the hero overlay's own heart
//      is gone, see below). All of them render from ONE `useCourtSaveState()` here, so
//      they can never disagree. The mutation logic itself is CourtSaveButton's, unchanged
//      (CLAUDE.md §4 triad: `disabled` + `aria-busy` + `InlineSpinner`, and the 1:1 glyph
//      swap keeps both controls' boxes fixed while pending).
//
// SHARED BY BOTH READINGS (Feature 79, carried into TASK_59). `locked` chooses only a
// handful of presentational seams below — it is a PROP, never derived here.
//
// TASK_59 (v3) RESHAPED THE WHOLE SHELL, not just its sizes:
//   • Desktop (md+) is a two-column CSS GRID: the gallery hero framed box, the thumbnail
//     strip, the location block and Nearby courts down the LEFT column (explicit
//     `md:col-start-1`/`md:row-start-*`, independent of DOM order — see page.tsx); the
//     title/chips/description + the inline action row + the review/unlock card down the
//     RIGHT column, as ONE cell spanning all four rows (`md:row-span-4`).
//   • Mobile keeps the full-bleed hero + overlapping white card. The "white card" div
//     below is a REAL box at mobile (background, rounded top, negative margin pulling it
//     up over the hero) but turns `md:contents` at md+ — CSS removes its own box
//     entirely at that breakpoint, promoting its children (the info-panel cell, and
//     `children`'s location/strip/nearby sections) to be direct items of the grid one
//     level up. That is what lets ONE piece of markup serve both the mobile "stack in
//     DOM order inside a card" layout and the desktop "scatter into named grid cells"
//     layout without duplicating any of it.
//   • The sticky docked footer bar is GONE. Mobile gets a floating glass action pill
//     (`sticky`, not `fixed` — CLAUDE.md §4 rule 4); desktop gets a plain inline action
//     row inside the info panel. Both are built HERE (not by page.tsx) because both need
//     the shared `saveState`. The two rows want different SHAPES from the same
//     `primaryAction` element (mobile: `rounded-pill`/48px; desktop: the plain square
//     `.btn`/52px) — `primaryAction` stays a plain `ReactNode` (a Server Component CANNOT
//     hand a Client Component a function prop; it isn't serializable across that
//     boundary), and `cloneElement` merges each render site's extra className onto it at
//     render time instead.
//
// IT OWNS NO DATA AND NO GATE. `locked`, `directionsUrl`, `signedIn`, the saved state and
// the collections all arrive as PROPS from `app/courts/[slug]/page.tsx`, which is still the
// only repository boundary on this screen and still the only place the entitlement is
// derived (Feature 64). Nothing here calls the exact-location endpoint, reads `isLocked` as
// a gate, or receives a coordinate — the primary action takes the opaque server-built
// `directionsUrl` as a string and puts it in an href.
//
// `backControl` (the mobile pill overlay) and `desktopBackControl` (the plain-text link
// above the grid) are both passed in from the page so their harness-asserted
// `fallbackHref="/map"` pairing lives in page.tsx, per CLAUDE.md §5. `infoPanelTop`
// (title/location row/chips/description) and `reviewOrUnlockCard` (the review card or the
// dark unlock card) are SERVER-rendered content from page.tsx too — this shell only
// decides WHERE they sit and, for `reviewOrUnlockCard`, renders it TWICE (mobile end-of-
// card / desktop info-panel), never building their copy itself.

function PinGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

// Desktop action-row circle: 52px, `bg-paper`, a 1px `rgba(184,184,182,0.4)` border
// (TASK_59 desktop spec — NOT `.btn-secondary`'s solid ink border, which reads much
// heavier against the ivory page than the prototype's hairline-mist ring).
const DESKTOP_CIRCLE =
  'grid h-[52px] w-[52px] shrink-0 place-items-center rounded-pill border border-[rgba(184,184,182,0.4)] bg-paper text-ink transition-colors hover:bg-bone';

// Mobile floating-bar circle: 48px, `bg-ink/5`, no border (TASK_59 mobile spec).
const MOBILE_CIRCLE =
  'grid h-12 w-12 shrink-0 place-items-center rounded-pill bg-ink/5 text-ink transition-colors hover:bg-ink/10';

export interface CourtDetailShellProps {
  /** Gallery slides (CourtDTO.images) — resolved inside the provider. */
  images: CourtImageDTO[];
  /** Fallback single image (CourtDTO.heroImageUrl). */
  heroImageUrl: string;
  /**
   * The court's REAL name. Used ONLY for the gallery's image alt text — an image
   * description, not a masked surface. Never rendered as the title.
   */
  courtName: string;
  /**
   * The court name AS DISPLAYED on this page — the real name when unlocked, the masked
   * placeholder when locked. It supplies the accessible names of the save and share
   * controls, so a masked title cannot leak through the accessibility tree. Defaults to
   * `courtName` (Feature 78's behaviour, unchanged for the unlocked page).
   */
  courtLabel?: string;
  /** The court's id — what the save control and the collection menu act on. */
  courtId: string;
  /** The court's slug — builds the sign-in return path for a logged-out save click. */
  courtSlug: string;
  /** Server-computed saved state, seeding the shared toggle. */
  initialSaved: boolean;
  /** Whether the visitor has a session (Feature 57), forwarded unchanged. */
  signedIn: boolean;
  /** The user's wishlist folders (server-fetched), for the Add-to-Collection menu. */
  collections: UserCollectionDTO[];
  /** Which of `collections` already contain this court (server-fetched). */
  memberCollectionIds: string[];
  /**
   * The server-built directions deep link for an ENTITLED viewer (Feature 64). `null` for
   * a non-entitled viewer or in mock mode — the primary action then falls back to the
   * same inert placeholder the pre-redesign page used. NEVER a raw coordinate.
   */
  directionsUrl: string | null;
  /**
   * Which reading to render. Computed ONCE at the page level from the protected
   * exact-location read (Feature 64) and passed down — this component never derives it,
   * never reads `court.isLocked`, and never calls the endpoint. It only chooses which
   * default primary action is built when `primaryAction` is omitted.
   */
  locked?: boolean;
  /**
   * The primary action's content — a plain element (NOT a function: this prop crosses
   * the server/client boundary from page.tsx, and a function isn't serializable there).
   * TASK_59 renders it TWICE, in the mobile bar (`rounded-pill`/48px) and the desktop row
   * (plain `.btn`/52px) — `cloneElement` merges each site's extra className onto its own
   * copy, so one element still serves both shapes. Omitted ⇒ the built-in "Get
   * directions" control below (the unlocked reading). The LOCKED page passes the paywall
   * trigger instead: it is a modal opener, not a link, and the paywall feature owns that
   * control (CLAUDE.md §7 — no checkout, no plan key, no Stripe here).
   */
  primaryAction?: ReactNode;
  /** The mobile pill BackButton overlaid on the hero (CLAUDE.md §5), `md:hidden`. */
  backControl: ReactNode;
  /**
   * The plain-text BackButton shown above the grid at md+ (TASK_59) — a SECOND instance
   * of the shared `BackButton`, `label="Back to Courts"`, `hidden md:inline-flex`. Two
   * instances of the same control at two sizes is fine (CLAUDE.md §5 only requires the
   * `fallbackHref`/behaviour to match, not a single DOM node).
   */
  desktopBackControl: ReactNode;
  /**
   * Title, location row + surface chip, tag chips and description — SERVER content from
   * page.tsx. Sits at the top of the right-column info panel at md+, and as the second
   * block (right after the hero) in the mobile stack. This shell appends the action
   * row/bar and `reviewOrUnlockCard` after it; it never builds this content itself.
   */
  infoPanelTop: ReactNode;
  /**
   * The review card (unlocked) or the dark unlock card (locked) — SERVER content from
   * page.tsx. Rendered TWICE (CLAUDE.md's "duplicated text/button block" allowance,
   * never applied to the gallery/map): once inside the desktop info panel (`hidden
   * md:block`, right after the action row), once as the final mobile-only section
   * (`md:hidden`, at the end of the white card).
   */
  reviewOrUnlockCard: ReactNode;
  /**
   * The location section, the gallery-strip section and the Nearby-courts section, IN
   * THAT DOM ORDER (page.tsx's existing order — unchanged) — each carrying its own
   * `md:col-start-1 md:row-start-*` so the grid can reorder them (strip moves to row 2,
   * ahead of location's row 3) independently of this DOM order, which is what mobile
   * actually renders in (no grid there).
   */
  children: ReactNode;
}

export function CourtDetailShell({
  images,
  heroImageUrl,
  courtName,
  courtLabel,
  courtId,
  courtSlug,
  initialSaved,
  signedIn,
  collections,
  memberCollectionIds,
  directionsUrl,
  locked = false,
  primaryAction,
  backControl,
  desktopBackControl,
  infoPanelTop,
  reviewOrUnlockCard,
  children,
}: CourtDetailShellProps) {
  // The name the CONTROLS announce. Falls back to the real name, so the unlocked page is
  // byte-identical to Feature 78.
  const displayName = courtLabel ?? courtName;
  // ONE save state, every heart instance. See the header note.
  const saveState = useCourtSaveState({ courtId, courtSlug, initialSaved, signedIn });
  const heartColor = saveState.saved && signedIn ? 'text-saved' : 'text-ink';

  // The default primary action (the unlocked reading's own "Get directions" control,
  // built here so it can take `extraClassName` directly — unlike `primaryAction`, which
  // arrives from page.tsx as a fixed element, this one is only ever constructed on the
  // client, so a function is fine for it).
  function defaultPrimaryAction(extraClassName: string): ReactNode {
    const className = ['btn btn-primary justify-center gap-2', extraClassName]
      .filter(Boolean)
      .join(' ');

    return directionsUrl ? (
      // Entitled viewer: the REAL server-built deep link, opened in a new tab.
      <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className={className}>
        <PinGlyph />
        Get directions
      </a>
    ) : (
      // Unlocked court with no exact-location fetch, or mock mode — inert placeholder,
      // exactly as before this redesign.
      <a href="#" className={className}>
        <PinGlyph />
        Get directions
      </a>
    );
  }

  // The primary action, rendered at a given render site's shape. `primaryAction` is a
  // fixed element from page.tsx (see its doc comment for why it can't be a function);
  // `cloneElement` merges this site's extra className onto a COPY of it, so the mobile
  // bar and the desktop row each get their own clone rather than sharing one node.
  // `locked && !primaryAction` only matters if a locked caller forgot to supply it; in
  // practice the locked page always does.
  function buildPrimaryAction(extraClassName: string): ReactNode {
    if (!primaryAction) {
      return locked ? null : defaultPrimaryAction(extraClassName);
    }
    if (!isValidElement<{ className?: string }>(primaryAction)) return primaryAction;

    const existingClassName =
      typeof primaryAction.props.className === 'string' ? primaryAction.props.className : '';
    return cloneElement(primaryAction, {
      className: [existingClassName, extraClassName].filter(Boolean).join(' '),
    });
  }

  return (
    <CourtDetailGalleryProvider
      images={images}
      heroImageUrl={heroImageUrl}
      courtName={courtName}
      courtLabel={displayName}
    >
      {/* TASK_59: `overHero` stays, so this wrapper adds back the nav-offset top padding
          at md+ only — the gallery is no longer full-bleed under the floating pill there. */}
      <div className="md:pt-[var(--nav-offset)]">
        {/* Desktop-only Back link, above the grid (TASK_59 desktop spec: ~26px below it). */}
        <div className="mx-auto hidden w-full max-w-[1240px] md:block md:px-14">
          {desktopBackControl}
        </div>

        <div className="mx-auto w-full max-w-[1240px] md:grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:items-start md:gap-x-12 md:px-14 md:pb-20">
          <CourtDetailGalleryHero backControl={backControl} />

          {/* The "white card" — a real box at mobile (background/rounded top/negative
              margin overlap onto the hero), `display:contents` at md+ so its children
              become direct grid items of the container above instead. See the file
              header for why this is the mechanism, not a mobile/desktop fork. */}
          <div className="relative -mt-4 rounded-t-[20px] bg-paper pb-[112px] md:contents">
            {/* Right column: info panel, spanning all four left-column rows. */}
            <div className="px-5 pt-5 md:col-start-2 md:row-start-1 md:row-span-4 md:px-0 md:pt-0">
              {infoPanelTop}

              {/* Desktop inline action row (TASK_59) — hidden on mobile, which gets the
                  floating bar below instead. */}
              <div className="mt-7 hidden gap-2.5 md:flex">
                {buildPrimaryAction('flex-1')}
                <CourtDetailShareButton courtName={displayName} className={DESKTOP_CIRCLE} />
                <CourtSaveButton
                  courtId={courtId}
                  courtSlug={courtSlug}
                  initialSaved={initialSaved}
                  signedIn={signedIn}
                  state={saveState}
                  presentation="icon"
                  courtLabel={displayName}
                  className={[DESKTOP_CIRCLE, heartColor].join(' ')}
                />
                <SaveToCollectionMenu
                  courtId={courtId}
                  collections={collections}
                  initialMemberCollectionIds={memberCollectionIds}
                  signedIn={signedIn}
                  presentation="icon"
                  className={DESKTOP_CIRCLE}
                />
              </div>

              {/* Desktop-only duplicate of the review/unlock card — see the prop's doc
                  comment. The mobile-only instance sits after `children` below. */}
              <div className="mt-7 hidden md:block">{reviewOrUnlockCard}</div>
            </div>

            {/* Mobile-only divider between the description and the location section
                (today's prototype rule) — at md+ those two live in different grid
                columns, so a horizontal rule between them no longer makes sense. */}
            <div className="mx-5 my-5 h-px bg-hairline md:hidden" />

            {children}

            {/* Mobile-only review/unlock card, the end of the content stack. */}
            <div className="mt-5 px-5 md:hidden">{reviewOrUnlockCard}</div>
          </div>
        </div>
      </div>

      {/* Floating glass action bar (TASK_59), mobile only — replaces the old docked
          sticky footer. `sticky`, NOT `fixed`: a fixed bar would pin itself over the
          shared site Footer that AppShell renders after this subtree, which only AppShell
          could reserve space for — CLAUDE.md §4 rule 4 stays untouched. Safe-area padding
          so it still clears the iOS home indicator. */}
      <div
        className="glass-surface sticky bottom-[18px] z-30 mx-4 flex items-center gap-2 rounded-pill p-[7px] pb-[calc(7px+env(safe-area-inset-bottom))] shadow-[0_16px_40px_rgba(15,15,15,0.18),0_2px_10px_rgba(15,15,15,0.08)] md:hidden"
      >
        {buildPrimaryAction('flex-1 rounded-pill !h-12')}
        <CourtDetailShareButton courtName={displayName} className={MOBILE_CIRCLE} />
        <CourtSaveButton
          courtId={courtId}
          courtSlug={courtSlug}
          initialSaved={initialSaved}
          signedIn={signedIn}
          state={saveState}
          presentation="icon"
          courtLabel={displayName}
          className={[MOBILE_CIRCLE, heartColor].join(' ')}
        />
        <SaveToCollectionMenu
          courtId={courtId}
          collections={collections}
          initialMemberCollectionIds={memberCollectionIds}
          signedIn={signedIn}
          presentation="icon"
          // Opens UPWARD — a downward menu from a bottom bar would fall off-screen.
          menuPlacement="above"
          className={MOBILE_CIRCLE}
        />
      </div>
    </CourtDetailGalleryProvider>
  );
}
