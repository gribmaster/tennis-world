'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { UserCollectionDTO } from '@tennis/contracts';
import { getClientRepositories } from '@/lib/repositories.client';
import { CreateCollectionModal } from './CreateCollectionModal';

// CreateCollectionTrigger — the reusable control that opens the CreateCollectionModal.
// This is the single client island for the create-collection flow: it OWNS the open/close
// state locally (one `useState`, mirroring PaywallTrigger / ConsultationTrigger — no global
// store, no localStorage), renders a button, and renders the modal alongside it.
//
// REPOSITORY (Feature 57): on submit it calls `repositories.saved.createUserCollection(name)`
// via `getClientRepositories()`. In MOCK mode that's the in-memory seam (Feature 34); in
// `api` mode it's the protected `POST /v1/me/collections` (the browser client repo sends
// the session cookie with `credentials:'include'`). The created folder is handed back to
// the parent via `onCreated` so the parent mirrors it into the visible list.
//
// Where this runs: the Saved page (the only mount today). That page is PRIVATE — a
// logged-out visitor was already redirected to /signin before this island renders, so an
// authed session is in hand here in `api` mode; we don't add a sign-in branch (unlike the
// public Court-Detail menu). A `AuthRequiredError` from an expired session propagates from
// `handleCreate` (the modal stays open); broadening that to an inline prompt is a possible
// follow-on, but the redirect-guarded page makes it a rare edge.
//
// Why the client repo helper is used directly from this client component:
//   • `@/lib/repositories.client` is a sanctioned access point (the ESLint import-boundary
//     allows the lib/repositories* files; it does not import a concrete repo or mock data).
//   • In `api` mode it returns a browser-auth'd HTTP repo; in mock mode the in-memory seam.
//     The returned `UserCollectionDTO` carries a server-derived, unique slug. The parent
//     mirrors it into local UI state, so the new row is visible immediately without a
//     server re-read.

export interface CreateCollectionTriggerProps {
  /** Button content. Use this for custom markup (icon + label). */
  children?: ReactNode;
  /**
   * Convenience label, used as the button content when `children` is omitted, and as the
   * button's accessible name when `children` is non-text (e.g. icon-only).
   */
  label?: string;
  /** Class names applied to the trigger button (e.g. `btn btn-primary`). */
  className?: string;
  /**
   * Source of the trigger for FUTURE analytics (e.g. "saved"). NOT sent anywhere in
   * Phase 1 — accepted only so the eventual analytics wiring has a single place to read it.
   */
  source?: string;
  /**
   * Called with the created folder after a successful (mock-only) create, so a parent can
   * mirror it into the visible collections list. Optional — when omitted the create still
   * runs against the mock seam, it just isn't reflected in any local list.
   */
  onCreated?: (collection: UserCollectionDTO) => void;
}

export function CreateCollectionTrigger({
  children,
  label,
  className,
  source,
  onCreated,
}: CreateCollectionTriggerProps) {
  // `source` is intentionally unused in Phase 1 (no analytics yet); referenced here so it
  // isn't flagged as an unused prop and to document the future wiring point.
  void source;

  // Browser-side repo set: api mode → session-cookie HTTP repo; mock mode → in-memory seam.
  const repositories = useMemo(() => getClientRepositories(), []);

  // The ONLY state in this island. Local on purpose: not global, not persisted.
  const [open, setOpen] = useState(false);

  async function handleCreate(name: string) {
    // Create through the sanctioned client repo. In `api` mode this is the protected
    // POST /v1/me/collections; the returned DTO carries the server-derived slug + count.
    const created = await repositories.saved.createUserCollection(name);
    onCreated?.(created);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // When children are non-text (icon-only), `label` supplies the accessible name.
        aria-label={children && label ? label : undefined}
        aria-haspopup="dialog"
        className={className}
      >
        {children ?? label}
      </button>

      <CreateCollectionModal
        open={open}
        onClose={() => setOpen(false)}
        onCreate={handleCreate}
      />
    </>
  );
}
