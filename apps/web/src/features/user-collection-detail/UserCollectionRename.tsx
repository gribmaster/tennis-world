'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getClientRepositories } from '@/lib/repositories.client';

// UserCollectionRename — the inline rename control for a USER wishlist folder
// (`/saved/collections/[slug]`), ported from files/collection.html's
// `CollectionDetailPage` rename affordance (a "Rename" ghost button that swaps the
// title for an inline input + "Save"). This is the small client island that replaces
// the Feature 33 DISABLED placeholder; the rest of the hero stays server-rendered.
//
// REPOSITORY (Feature 57): Save calls `repositories.saved.renameUserCollection(id, name)`
// via `getClientRepositories()`. In MOCK mode that's the in-memory seam (Feature 34); in
// `api` mode it's the protected `PATCH /v1/me/collections/:id` (the browser client repo
// sends the session cookie with `credentials:'include'`). The page that mounts this
// (`/saved/collections/[slug]`) is PRIVATE — a logged-out visitor was already redirected
// to /signin, so an authed session is in hand in `api` mode.
//
// NEW NAME + SLUG FROM THE RETURNED DTO: we take the new name AND slug from the DTO that
// `renameUserCollection` RETURNS (not from a server re-read): the visible title updates
// from `updated.name` immediately, and we `router.replace('/saved/collections/' +
// updated.slug)` so the URL matches the freshly derived slug. (In mock mode the server's
// separate in-memory instance never saw the rename, so the returned DTO is the only
// truth; in `api` mode the rename is persisted and a later reload re-reads it.)
//
// ROUTE NOTE: `renameUserCollection` re-derives the slug from the new name (kept unique),
// so the slug can change. `router.replace` (not `push`) swaps the URL in place so Back
// doesn't return to the now-stale old-slug URL.

export interface UserCollectionRenameProps {
  /** The folder id — the mutation key passed to `renameUserCollection`. */
  collectionId: string;
  /** The current folder name (server-rendered initial value). */
  name: string;
}

export function UserCollectionRename({ collectionId, name }: UserCollectionRenameProps) {
  const router = useRouter();

  // Browser-side repo set: api mode → session-cookie HTTP repo; mock mode → in-memory seam.
  const repositories = useMemo(() => getClientRepositories(), []);

  // The visible folder name. Seeded from the server-rendered `name`; updated from the DTO
  // that `renameUserCollection` returns. Local — not global, not persisted.
  const [currentName, setCurrentName] = useState(name);
  // Whether the inline edit field is showing.
  const [editing, setEditing] = useState(false);
  // The draft value while editing (controlled input).
  const [draft, setDraft] = useState(name);

  const trimmed = draft.trim();
  // Save is disabled while the trimmed name is empty or unchanged from the current name.
  const canSave = trimmed.length > 0 && trimmed !== currentName;

  function openEditor() {
    setDraft(currentName);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setDraft(currentName);
  }

  async function save() {
    if (!canSave) return;
    // api mode → PATCH /v1/me/collections/:id; mock mode → in-memory seam. The returned
    // DTO carries the trimmed name and the (possibly new) slug — both come from the
    // mutation result, so we never re-read on the client.
    const updated = await repositories.saved.renameUserCollection(collectionId, trimmed);
    setCurrentName(updated.name);
    setEditing(false);
    setDraft(updated.name);
    // Keep the URL in sync with the freshly derived slug (client-side history replace).
    router.replace(`/saved/collections/${updated.slug}`);
  }

  if (editing) {
    return (
      <div className="flex flex-1 items-center gap-2.5" style={{ minWidth: 240 }}>
        <label htmlFor="user-collection-rename" className="sr-only">
          Collection name
        </label>
        <input
          id="user-collection-rename"
          // autoFocus the field the user just opened (same pattern as the modals).
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSave) {
              e.preventDefault();
              void save();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          className="display-l min-w-0 flex-1 border-0 border-b-2 border-ink bg-transparent text-ink outline-none"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={!canSave}
          className="btn btn-primary h-10 shrink-0 px-4 text-[11px]"
        >
          Save
        </button>
        <button
          type="button"
          onClick={cancel}
          className="btn btn-ghost h-10 shrink-0 p-0 text-stone"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <>
      <h1 className="display-l text-ink">{currentName}</h1>
      <button
        type="button"
        onClick={openEditor}
        className="btn btn-ghost p-0 text-stone"
      >
        Rename
      </button>
    </>
  );
}
