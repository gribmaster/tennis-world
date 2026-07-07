'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { UserCollectionDTO } from '@tennis/contracts';
import { getMutationSavedRepository } from '@/lib/repositories.client';
import { AuthRequiredError } from '@/lib/repositories';
import { CreateCollectionModal } from '@/features/user-collections';

// SaveToCollectionMenu — the Court Detail "Add to Collection" dropdown, ported from the
// `SaveToCollectionMenu` prototype in files/home.html / files/map.html. It lets the user
// add/remove the current court from their wishlist folders, and create a new folder from
// inside the menu.
//
// REPOSITORY (Feature 57): membership changes go through the SavedRepository
// (`toggleCourtInCollection`, `createUserCollection`). In MOCK mode this is the in-memory
// seam (Feature 34 — no backend/auth/persistence); in `api` mode it is the protected
// `/v1/me/*` endpoints, reached via `getMutationSavedRepository()` whose saved repo sends the
// httpOnly session cookie with `credentials:'include'` (the browser can't read the cookie
// from JS, so it lets fetch attach it) — OR, in STAGING DEMO MODE (Feature 76, no cookie),
// routes the write through a server action so the demo secret stays server-side. The UI is
// identical across modes.
//
// LOGGED-OUT (Feature 57): Court Detail is PUBLIC. For a logged-out visitor in `api` mode
// the server's protected reads 401'd, so `signedIn` is false and `collections` is empty.
// The menu then does NOT mutate — clicking the trigger reveals a "Sign in to save courts"
// prompt linking to /signin, never a silent failed backend call. (In mock mode `signedIn`
// is always true.) A SESSION that expires mid-use surfaces as `AuthRequiredError` from a
// mutation; we roll back the optimistic update and flip to the signed-out prompt.
//
// CLIENT/SERVER INSTANCE BOUNDARY (mock mode): the mock repo has separate in-memory
// instances on the server and in the browser. The INITIAL checkmark state is computed on
// the server (page.tsx reads `getCollectionIdsForCourt`) and passed in as
// `initialMemberCollectionIds`. After mount, this island holds membership as LOCAL state
// (`memberIds`) and is the single source of truth for the UI — it updates optimistically
// on every toggle and never re-reads the server. In `api` mode the same local-optimistic
// model holds (we don't await/re-read on the happy path); the difference is the write hits
// the real API. This mirrors how Feature 35 mirrors the created folder into local state.
//
// MEMBERSHIP STATE STRATEGY: `UserCollectionDTO` deliberately does NOT carry `courtIds`
// (the seed-only membership is an internal join, not a broadly-exposed wire field). So
// membership for THIS court is sourced narrowly via `getCollectionIdsForCourt(courtId)`
// (server read) → `initialMemberCollectionIds`, then tracked locally as a `Set` of folder
// ids. The menu shows a checkmark when `memberIds.has(collection.id)`.

function BookmarkGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden
    >
      <path d="M6 4h12v17l-6-4-6 4z" />
    </svg>
  );
}

function PlusGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

export interface SaveToCollectionMenuProps {
  /** The court being added to / removed from folders (its `id`, matching COURTS[].id). */
  courtId: string;
  /**
   * The user's wishlist folders (minimal DTOs — no `courtIds`). Fetched on the server in
   * page.tsx via `repositories.saved.getSavedCollections()`. Used as the INITIAL list;
   * folders created from the menu are appended to local state for the session.
   */
  collections: UserCollectionDTO[];
  /**
   * The ids of `collections` that already contain `courtId`, computed on the server via
   * `repositories.saved.getCollectionIdsForCourt(courtId)`. Seeds the menu's checkmark
   * state; after mount, membership is tracked locally.
   */
  initialMemberCollectionIds: string[];
  /**
   * Whether the visitor is signed in (Feature 57). When false (logged-out visitor in `api`
   * mode on this PUBLIC page), the menu shows a sign-in prompt and performs NO mutation.
   * Always true in mock mode. Defaults to true so existing callers/tests are unaffected.
   */
  signedIn?: boolean;
  /** Optional class names applied to the trigger button. */
  className?: string;
}

export function SaveToCollectionMenu({
  courtId,
  collections,
  initialMemberCollectionIds,
  signedIn = true,
  className,
}: SaveToCollectionMenuProps) {
  const menuId = useId();

  // Build the mutation repo once. In `api` mode its saved repo sends the session cookie
  // (`credentials:'include'`), or routes through a server action in staging demo mode; in
  // mock mode it's the in-memory seam.
  const savedRepo = useMemo(() => getMutationSavedRepository(), []);

  // Flips to false if a mutation hits `AuthRequiredError` (session expired). Seeded from
  // the server-derived `signedIn`. Controls whether the menu shows the sign-in prompt.
  const [authed, setAuthed] = useState(signedIn);

  // Open/close of the dropdown. Local — not global, not persisted.
  const [open, setOpen] = useState(false);
  // Whether the Create-Collection modal is open (reuses the Feature 35 modal).
  const [createOpen, setCreateOpen] = useState(false);

  // The visible folder list. Seeded from the server-fetched `collections`; folders
  // created from the menu are appended here for the session (mock-only, no persistence).
  const [items, setItems] = useState<UserCollectionDTO[]>(collections);
  // Local membership for THIS court: the source of truth for the checkmarks after mount.
  // Seeded from the server read; toggled optimistically. No server re-read.
  const [memberIds, setMemberIds] = useState<Set<string>>(
    () => new Set(initialMemberCollectionIds),
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on outside click + Escape (basic a11y). Only wired while open. Escape also
  // restores focus to the trigger.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Toggle this court in/out of a folder. Optimistic local update first (the menu stays
  // open so the user can toggle several folders in one pass), then the write. In mock mode
  // the write is the in-memory seam; in `api` mode it's the protected endpoint. If the
  // session expired (`AuthRequiredError`), ROLL BACK the optimistic flip and surface the
  // sign-in prompt — we don't leave a checkmark the server rejected.
  const handleToggle = useCallback(
    (collectionId: string) => {
      const wasMember = memberIds.has(collectionId);
      setMemberIds((prev) => {
        const next = new Set(prev);
        if (wasMember) next.delete(collectionId);
        else next.add(collectionId);
        return next;
      });
      void savedRepo
        .toggleCourtInCollection(collectionId, courtId)
        .catch((err: unknown) => {
          if (err instanceof AuthRequiredError) {
            // Roll back the optimistic flip and prompt sign-in.
            setMemberIds((prev) => {
              const next = new Set(prev);
              if (wasMember) next.add(collectionId);
              else next.delete(collectionId);
              return next;
            });
            setAuthed(false);
          }
          // Other errors: the optimistic update already happened (mock mode never
          // throws); we don't surface non-auth network blips here (matches the
          // fire-and-forget prototype behavior).
        });
    },
    [courtId, memberIds, savedRepo],
  );

  // Create-from-menu (matches the prototype, which seeds the new folder WITH the current
  // court — files/home.html `createCollection`: `courtIds: openCourt ? [openCourt.id] : []`).
  // The Create modal calls back here; we create the (empty) folder, add it to the list,
  // toggle the current court into it, and mark it checked. On `AuthRequiredError` we prompt
  // sign-in instead. `await` so a failed create doesn't leave a phantom folder in the list.
  const handleCreate = useCallback(
    async (name: string) => {
      try {
        const created = await savedRepo.createUserCollection(name);
        setItems((prev) => [...prev, created]);
        // Add the current court to the brand-new folder, mirroring the prototype.
        setMemberIds((prev) => new Set(prev).add(created.id));
        void savedRepo.toggleCourtInCollection(created.id, courtId);
        setCreateOpen(false);
      } catch (err) {
        if (err instanceof AuthRequiredError) {
          setCreateOpen(false);
          setAuthed(false);
          return;
        }
        throw err;
      }
    },
    [courtId, savedRepo],
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={
          className ??
          'inline-flex h-9 items-center gap-1.5 border border-hairline bg-transparent px-3.5 text-[12px] text-stone transition-colors hover:text-ink'
        }
      >
        <BookmarkGlyph />
        Add to Collection
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Add to collection"
          className="absolute right-0 top-[calc(100%+8px)] z-[60] w-[260px] border border-hairline bg-paper p-2 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
        >
          {!authed ? (
            // Logged-out (api mode) on this PUBLIC page: prompt sign-in instead of mutating.
            // No backend call is made; the link routes to /signin and returns to this court.
            <div className="px-2.5 py-3">
              <p className="body-s text-stone">Sign in to save courts to your collections.</p>
              <Link
                href="/signin"
                className="btn btn-primary mt-3 w-full justify-center text-[12px]"
              >
                Sign In
              </Link>
            </div>
          ) : items.length === 0 ? (
            <p className="body-s px-2.5 py-3 text-stone">No collections yet.</p>
          ) : (
            items.map((col) => {
              const inCollection = memberIds.has(col.id);
              return (
                <button
                  key={col.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={inCollection}
                  onClick={() => handleToggle(col.id)}
                  className="flex w-full items-center justify-between gap-3 px-2.5 py-2.5 text-left transition-colors hover:bg-bone"
                >
                  <span className="body-m text-ink">{col.name}</span>
                  {inCollection ? (
                    <span
                      aria-hidden
                      className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] bg-ink text-bone"
                    >
                      <CheckGlyph />
                    </span>
                  ) : (
                    <span
                      aria-hidden
                      className="h-[18px] w-[18px] shrink-0 rounded-[4px] border border-stone/50"
                    />
                  )}
                </button>
              );
            })
          )}

          {/* "New collection" — only when signed in (creating a folder is a protected
              write; the signed-out branch shows the sign-in prompt instead). */}
          {authed ? (
            <div className="mt-1.5 border-t border-hairline pt-1.5">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setCreateOpen(true);
                }}
                className="flex w-full items-center gap-2 px-2.5 py-2.5 text-left text-ink transition-colors hover:bg-bone"
              >
                <PlusGlyph />
                <span className="body-m">New collection</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Reuse the Feature 35 Create-Collection modal directly (controlled). We pass our
          own onCreate so the created folder is added to THIS menu's list and the current
          court is toggled into it. */}
      <CreateCollectionModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />
    </div>
  );
}
