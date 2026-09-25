'use client';

import type { ReactNode } from 'react';
import type { UserCollectionDTO } from '@tennis/contracts';
import { CourtDetailGalleryProvider, CourtDetailGalleryHero } from './CourtDetailGallery';
import { CourtDetailShareButton } from './CourtDetailShareButton';
import { CourtSaveButton, useCourtSaveState } from './CourtSaveButton';
import { SaveToCollectionMenu } from './SaveToCollectionMenu';
import type { CourtImageDTO } from '@tennis/contracts';

// CourtDetailShell — the client shell for the v2 Court Detail screen
// (design_v2_stripped.html `CourtDetailScreen`). It exists for exactly two reasons, both
// of them state-sharing:
//
//   1. The gallery's active image is read by the hero band AND by the "Gallery" thumbnail
//      strip, which the v2 layout separates by several sections. `CourtDetailGalleryProvider`
//      wraps the whole body so both read one index.
//   2. The save control appears TWICE — a circular control over the hero and the square
//      control in the sticky footer bar. Both render from ONE `useCourtSaveState()` here,
//      so they can never disagree. The mutation logic itself is CourtSaveButton's,
//      unchanged (CLAUDE.md §4 triad: `disabled` + `aria-busy` + `InlineSpinner`, and the
//      1:1 glyph swap keeps both controls' boxes fixed while pending).
//
// SHARED BY BOTH READINGS (Feature 79). This was `CourtDetailUnlockedShell` in Feature 78,
// when only the unlocked page had the v2 layout. Feature 79 gives the LOCKED page the same
// hero, the same gallery, the same Back / save / share chrome and the same sticky footer,
// so the shell was RENAMED (not forked) and given two small, purely presentational seams:
//
//   • `locked` — the reading to render. It is a PROP, never derived here; see below.
//   • `primaryAction` — the sticky footer's right-hand action. The unlocked page leaves it
//     undefined and gets the built-in "Get directions" link; the locked page passes the
//     paywall trigger ("Unlock to get directions", prototype line 1184), because that
//     control is a modal opener rather than a link and the paywall feature owns it.
//   • `courtLabel` — the DISPLAYED court name, used for the save/share controls'
//     accessible names. On the locked page that is the masked placeholder, so the mask
//     cannot leak through the accessibility tree (the same rule Feature 74's
//     `HomeCourtSaveHeart` follows). `courtName` stays the REAL name and is used only for
//     the gallery's image alt text, which is not a masked surface.
//
// IT OWNS NO DATA AND NO GATE. `locked`, `directionsUrl`, `signedIn`, the saved state and
// the collections all arrive as PROPS from `app/courts/[slug]/page.tsx`, which is still the
// only repository boundary on this screen and still the only place the entitlement is
// derived (Feature 64). Nothing here calls the exact-location endpoint, reads `isLocked` as
// a gate, or receives a coordinate — the sticky footer's primary action takes the opaque
// server-built `directionsUrl` as a string and puts it in an href.
//
// The page body itself is passed in as `children` and stays SERVER-rendered — only the
// hero chrome, the footer bar and the gallery state are client. The BackButton is also
// passed in from the page (`backControl`) so its harness-asserted `fallbackHref="/map"` /
// label `Courts` pairing lives in page.tsx, per CLAUDE.md §5.

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
   * a non-entitled viewer or in mock mode — the footer's primary action then falls back to
   * the same inert placeholder the pre-redesign page used. NEVER a raw coordinate.
   */
  directionsUrl: string | null;
  /**
   * Which reading to render. Computed ONCE at the page level from the protected
   * exact-location read (Feature 64) and passed down — this component never derives it,
   * never reads `court.isLocked`, and never calls the endpoint. It only chooses which
   * sticky-footer action is shown when `primaryAction` is omitted.
   */
  locked?: boolean;
  /**
   * The sticky footer's right-hand primary action. Omitted ⇒ the built-in
   * "Get directions" control below (the unlocked reading). The LOCKED page passes the
   * paywall trigger instead: it is a modal opener, not a link, and the paywall feature
   * owns that control (CLAUDE.md §7 — no checkout, no plan key, no Stripe here).
   */
  primaryAction?: ReactNode;
  /** The shared BackButton, owned by page.tsx (CLAUDE.md §5). */
  backControl: ReactNode;
  /** The server-rendered page body that sits under the hero. */
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
  children,
}: CourtDetailShellProps) {
  // The name the CONTROLS announce. Falls back to the real name, so the unlocked page is
  // byte-identical to Feature 78.
  const displayName = courtLabel ?? courtName;
  // ONE save state, two buttons. See the header note.
  const saveState = useCourtSaveState({ courtId, courtSlug, initialSaved, signedIn });

  return (
    <CourtDetailGalleryProvider
      images={images}
      heroImageUrl={heroImageUrl}
      courtName={courtName}
      courtLabel={displayName}
    >
      <CourtDetailGalleryHero
        backControl={backControl}
        actions={
          <>
            <CourtSaveButton
              courtId={courtId}
              courtSlug={courtSlug}
              initialSaved={initialSaved}
              signedIn={signedIn}
              state={saveState}
              presentation="icon"
              courtLabel={displayName}
              // 36×36 circle (prototype line 1023). `text-clay` when saved mirrors the
              // prototype's `#E85D4A` using the existing clay token, no new palette.
              className={[
                'grid h-9 w-9 place-items-center rounded-pill bg-ink/40 backdrop-blur-[8px] transition-colors hover:bg-ink/55 disabled:opacity-70',
                saveState.saved && signedIn ? 'text-clay' : 'text-paper',
              ].join(' ')}
            />
            {/* Share the PUBLIC page URL. Its title/label use the DISPLAYED name so a
                masked title is not leaked into a share sheet or the a11y tree. */}
            <CourtDetailShareButton courtName={displayName} />
          </>
        }
      />

      {/* The white content card, overlapping the hero by the prototype's 16px with its
          20px top corners (line 1051). `-mt-4` pulls it up; `relative` lifts it above the
          hero's overlay so the rounded edge reads. The 100px bottom pad is the prototype's
          own `paddingBottom:100` (line 1051), clearing the fixed action bar below. */}
      <div className="relative -mt-4 rounded-t-[20px] bg-paper pb-[100px]">{children}</div>


      {/* Sticky footer bar (prototype line 1179): the save control + the primary action.
          `position:sticky`, NOT `fixed`. Fixed would pin it over the shared site Footer that
          AppShell renders after this subtree — and only AppShell could reserve space below
          that Footer, which this feature must not touch. Sticky keeps the bar pinned for the
          whole court article (the part of the page where its actions apply) and releases it
          into the flow at the Footer, leaving the Footer fully readable.
          On mobile it stacks above the 56px + safe-area tab bar (AppShell's own
          BottomNavigation offset); at md+ the tab bar is hidden so it sits at the viewport
          edge. It is a bottom BAR spanning the content column, never a `fixed inset-0`
          blocking overlay — CLAUDE.md §4 rule 4 is untouched. */}
      <div className="sticky bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 flex gap-3 border-t border-hairline bg-bone/95 px-5 py-3 backdrop-blur-[20px] md:bottom-0 md:px-[clamp(20px,4vw,64px)]">
        <div className="mx-auto flex w-full max-w-container gap-3">
          <CourtSaveButton
            courtId={courtId}
            courtSlug={courtSlug}
            initialSaved={initialSaved}
            signedIn={signedIn}
            state={saveState}
            presentation="icon"
            courtLabel={displayName}
            // 52×52 square (prototype line 1180), the `.btn-secondary` outline.
            className="btn btn-secondary !h-[52px] w-[52px] shrink-0 !px-0"
          />

          {/* Add-to-Collection — the real app is ahead of the prototype here (intake §2.3);
              it keeps its own behaviour and joins the footer rather than being dropped. */}
          <SaveToCollectionMenu
            courtId={courtId}
            collections={collections}
            initialMemberCollectionIds={memberCollectionIds}
            signedIn={signedIn}
            presentation="icon"
            // Opens UPWARD — a downward menu from a sticky footer would fall off-screen.
            menuPlacement="above"
            className="btn btn-secondary !h-[52px] w-[52px] shrink-0 justify-center !px-0"
          />

          {/* Primary action. The LOCKED page supplies its own (`primaryAction`) — the
              paywall trigger, "Unlock to get directions" (prototype line 1184). Otherwise:
              entitled ⇒ the REAL server-built deep link; else the same inert placeholder as
              before this redesign. No coordinate is ever assembled here, and a locked page
              never renders a directions link — there IS no `directionsUrl` for it. */}
          {primaryAction ?? (locked ? null : directionsUrl ? (
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary justify-center gap-2"
            >
              <PinGlyph />
              Get directions
            </a>
          ) : (
            <a href="#" className="btn btn-primaryjustify-center gap-2">
              <PinGlyph />
              Get directions
            </a>
          ))}
        </div>
      </div>
    </CourtDetailGalleryProvider>
  );
}
