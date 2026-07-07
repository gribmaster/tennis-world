'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createPortal } from 'react-dom';

// CreateCollectionModal — the Phase-1 "New collection" dialog. Ported from the
// CreateCollectionModal prototype in files/saved.html: a compact bone panel with a
// single "Collection name" field and a primary "Create Collection" CTA.
//
// MOCK-ONLY (Phase 1 — hard rules / Decision #11): on submit it calls the caller's
// `onCreate(name)` (which talks to the mock SavedRepository seam, Feature 34). There is
// NO backend, NO app/api, NO auth/session, NO localStorage, NO persistence — the created
// folder lives in the mock's in-memory state and the caller mirrors it into local UI
// state for the session. Phase 4 swaps in the auth-backed `POST /v1/me/collections`.
//
// State: fully controlled (`open` + `onClose`). Open/close state lives in
// CreateCollectionTrigger (mirroring PaywallTrigger / ConsultationTrigger), not here and
// not in any global store. The single name field IS local here (a controlled form is not
// app state) and resets every time the modal (re)opens.
//
// Accessibility (mirrors PaywallModal / ConsultationModal):
//   • role="dialog" + aria-modal="true", labelled by the headline + described by the
//     subhead.
//   • Closes on Escape and on backdrop click; inner dialog stops propagation.
//   • Moves focus into the name field on open and restores it to the trigger on close.
//   • Locks body scroll while open (with cleanup).
//   • Close button carries an aria-label.

export interface CreateCollectionModalProps {
  /** Whether the dialog is open. Controlled by CreateCollectionTrigger. */
  open: boolean;
  /** Called when the user requests close (Escape, backdrop, ✕). */
  onClose: () => void;
  /**
   * Called with the trimmed, non-empty collection name when the user submits. The caller
   * performs the (mock-only) create and any UI mirroring; this component only collects
   * and validates the name.
   */
  onCreate: (name: string) => void;
}

function CloseGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

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

export function CreateCollectionModal({ open, onClose, onCreate }: CreateCollectionModalProps) {
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameFieldRef = useRef<HTMLInputElement>(null);
  // Remember what had focus before opening so we can restore it on close.
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const [name, setName] = useState('');

  // Reset the field every time the modal (re)opens, so the entered name never outlives a
  // single session-with-the-modal. (No persistence — hard rule.)
  useEffect(() => {
    if (open) setName('');
  }, [open]);

  // Close on Escape + lock body scroll while open + manage focus (same as the other modals).
  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move focus into the dialog. Prefer the name field; fall back to the dialog container.
    (nameFieldRef.current ?? dialogRef.current)?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Restore focus to whatever opened the modal (the trigger button).
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  // Render nothing when closed, and guard against SSR (portal needs a DOM).
  if (!open || typeof document === 'undefined') return null;

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Required-name guard: do nothing on an empty/whitespace-only name (the submit button
    // is also disabled in this state, this just backs it up).
    const value = name.trim();
    if (!value) return;
    onCreate(value);
  }

  return createPortal(
    // Backdrop — click closes (simple backdrop dismissal, matching the other modals).
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      {/* Dialog. stopPropagation so clicks inside don't bubble to the backdrop. */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="relative w-full max-w-[440px] bg-bone px-7 py-7 text-ink outline-none"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="display-m text-ink">
            New collection
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 shrink-0 p-1 text-stone transition-colors hover:text-ink"
          >
            <CloseGlyph />
          </button>
        </div>

        <p id={descId} className="body-m mt-2 text-stone">
          Give your collection a name. You can add courts to it anytime.
        </p>

        <form className="mt-6" onSubmit={handleSubmit} noValidate>
          <label className="eyebrow mb-2 block text-stone" htmlFor={`${titleId}-name`}>
            Collection name
          </label>
          <input
            ref={nameFieldRef}
            id={`${titleId}-name`}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Summer in Italy"
            className="body-m h-[52px] w-full border border-hairline bg-paper px-4 text-ink outline-none transition-colors placeholder:text-stone/60 focus:border-ink"
          />

          {/* PRIMARY CTA — disabled until the trimmed name is non-empty (prototype:
              `disabled={!name.trim()}`). */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="btn btn-primary mt-5 w-full justify-center gap-2"
          >
            Create Collection
            <ArrowGlyph />
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
