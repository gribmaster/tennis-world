import type { UserCollectionDTO } from '@tennis/contracts';
import { PaywallTrigger } from '@/features/paywall';
import { ConsultationTrigger } from '@/features/consultation';
import { SaveToCollectionMenu } from './SaveToCollectionMenu';
import { CourtSaveButton } from './CourtSaveButton';

// CourtDetailCtaPanel — the status line + primary/secondary CTAs for Court Detail,
// ported from the right-rail CTA block in the prototype's inline `CourtDetail`.
//
// PRESENTATIONAL only, with ONE exception: the "Add to Collection" menu
// (`SaveToCollectionMenu`, Feature 36) is a client island that talks to the
// SavedRepository (`toggleCourtInCollection` / `createUserCollection`). In mock mode that
// is the in-memory seam (Feature 34); in `api` mode (Feature 57) it is the protected
// `/v1/me/*` endpoints via the browser client repo, and the `signedIn` flag gates it for
// logged-out visitors on this public page. Everything else stays presentational: the
// locked-branch "Unlock Full Access" CTA opens the shared Paywall modal (no checkout — no
// Stripe), and "Request a Consultation" opens the shared Consultation modal (no
// backend/CRM/email).
//
// GET DIRECTIONS (Feature 64): the unlocked branch now renders a REAL directions link when
// the page resolved a `directionsUrl` from the protected exact-location endpoint (an
// entitled viewer) — a server-built Google Maps deep link, opened in a new tab. When
// `directionsUrl` is null (mock mode, or an unlocked court with no exact-location fetch)
// it falls back to the prior inert `href="#"` placeholder, so nothing regresses. The raw
// exact coords never reach this component — only the opaque URL.
//
// The `locked` boolean and `directionsUrl` are computed once at the page level (Feature 11
// §2 / Feature 64); this component only renders from them, never derives them. The
// collection data (`courtId`, `collections`, `memberCollectionIds`) is likewise fetched
// once on the server (page.tsx) and passed in; this component does not fetch.

function ArrowGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export interface CourtDetailCtaPanelProps {
  /** Whether the exact location is locked. Computed at the page level — see Feature 11 §2. */
  locked: boolean;
  /**
   * The server-built directions deep link for an ENTITLED viewer (Feature 64), from the
   * protected exact-location endpoint. `null` when locked, in mock mode, or for an
   * unlocked court with no exact-location fetch — the unlocked "Get Directions" then falls
   * back to an inert placeholder. Never the raw coords, only the opaque URL.
   */
  directionsUrl: string | null;
  /** The current court's id — the court the "Add to Collection" menu / Save button acts on. */
  courtId: string;
  /** The current court's slug — used to build the sign-in return path for the Save button. */
  courtSlug: string;
  /**
   * Whether this court is already in the user's saved courts (server-fetched in page.tsx via
   * `saved.isCourtSaved`). Seeds the standalone Save button's pressed state. `false` for a
   * logged-out visitor (the protected read degraded) — the button then prompts sign-in.
   */
  initialSaved: boolean;
  /** The user's wishlist folders (server-fetched in page.tsx). Drives the menu. */
  collections: UserCollectionDTO[];
  /**
   * Ids of `collections` that already contain `courtId` (server-fetched). Seeds the
   * menu's checkmark state.
   */
  memberCollectionIds: string[];
  /**
   * Whether the visitor is signed in (Feature 57). False only on this PUBLIC page in `api`
   * mode for a logged-out visitor (the protected saved reads 401'd → empty + signed-out).
   * Forwarded to the Add-to-Collection menu, which then prompts sign-in instead of mutating.
   */
  signedIn: boolean;
}

export function CourtDetailCtaPanel({
  locked,
  directionsUrl,
  courtId,
  courtSlug,
  initialSaved,
  collections,
  memberCollectionIds,
  signedIn,
}: CourtDetailCtaPanelProps) {
  return (
    <div>
      {/* Status line */}
      <div>
        <p className="eyebrow mb-2 text-stone">Status</p>
        {locked ? (
          <p className="body-m text-stone">Location locked — membership required</p>
        ) : (
          <p className="body-m flex items-center gap-2 text-moss">
            <span aria-hidden className="h-2 w-2 rounded-pill bg-moss" />
            Full location available
          </p>
        )}
      </div>

      {/* CTAs. The locked "Unlock Full Access" opens the shared Paywall modal (no checkout
          — no Stripe). "Request a Consultation" opens the shared Consultation modal. Get
          Directions (unlocked branch) is the REAL server-built deep link when an entitled
          viewer resolved a `directionsUrl` (Feature 64), else an inert placeholder. */}
      <div className="mt-8 flex flex-col gap-2.5">
        {locked ? (
          // Gold `btn-premium` is the sanctioned paywall button.
          <PaywallTrigger
            source="court-detail"
            className="btn btn-premium w-full justify-center gap-2"
          >
            Unlock Full Access
            <ArrowGlyph />
          </PaywallTrigger>
        ) : directionsUrl ? (
          // Entitled viewer: real directions deep link (server-built), new tab.
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary w-full justify-center gap-2"
          >
            Get Directions
            <ArrowGlyph />
          </a>
        ) : (
          // Unlocked court with no exact-location fetch, or mock mode — inert placeholder.
          <a href="#" className="btn btn-primary w-full justify-center gap-2">
            Get Directions
            <ArrowGlyph />
          </a>
        )}
        <ConsultationTrigger
          source="court-detail"
          className="btn btn-secondary w-full justify-center"
        >
          Request a Consultation
        </ConsultationTrigger>

        {/* Standalone Save (heart) — client island backing the individual saved-courts
            endpoints (POST/DELETE /v1/me/saved-courts). Distinct from the folder menu below;
            spans the CTA column width to match the buttons around it. A logged-out click
            routes to /signin (same as the menu). */}
        <CourtSaveButton
          courtId={courtId}
          courtSlug={courtSlug}
          initialSaved={initialSaved}
          signedIn={signedIn}
          className="btn btn-secondary w-full justify-center gap-2"
        />

        {/* Add-to-Collection menu (Feature 36) — client island, mock-only seam. The
            trigger spans the CTA column width to match the buttons above it; the dropdown
            anchors to it. */}
        <SaveToCollectionMenu
          courtId={courtId}
          collections={collections}
          initialMemberCollectionIds={memberCollectionIds}
          signedIn={signedIn}
          className="btn btn-secondary w-full justify-center gap-2"
        />
      </div>

      {/* Membership note — shown only when locked. Copy is local + presentational
          (no @tennis/mock-data import), mirroring HomePaywallBand. */}
      {locked ? (
        <div className="mt-6 bg-ink p-5 text-bone">
          <p className="eyebrow text-gold">Membership</p>
          <p className="body-m mt-1.5 text-bone/85">
            Unlock exact locations + 120+ courts worldwide.
          </p>
          <p className="serif mt-3 text-[28px] font-light text-bone">
            $29 <span className="eyebrow align-middle text-bone/60">Lifetime</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
