'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PendingButton, useElementPending } from '@/components/navigation';

// EditProfileModal — the profile edit bottom sheet (Feature 81/82), ported from the v2
// prototype's ProfileScreen edit modal (`new design/tennis_world_v2_standalone.html`
// lines 1476-1513).
//
// TWO FIELDS ONLY — Name (editable) and Email (read-only):
//   • Name   → the only field `PATCH /v1/me` accepts. Saved via `onSave`, an async
//     mutation the §4 triad governs: `useElementPending` + disabled + aria-busy +
//     InlineSpinner, cleared in an unconditional `.finally()`, with a real error state.
//   • Email  → shown but NOT an <input>; there is no write path for it (changing the
//     login email would break magic-link sign-in until a re-verification flow exists —
//     TASK_14 decision). Rendered as inert, legibly-labelled static text, not a
//     disabled input pretending to be editable.
//
// NO AVATAR CONTROL — `PATCH /v1/me` has no image field and there is no upload storage
// (TASK_14 point 1). The prototype's avatar-cycle button is deliberately omitted, not
// faked.
//
// ACCESSIBILITY — mirrors FilterSheet.tsx's dialog mechanics exactly (that file's header
// comment is the canonical description): role="dialog" + aria-modal, labelled by the
// title, a Tab/Shift+Tab focus trap, Escape-to-close, focus moved in on open and
// restored to the opener on close, and a body-scroll lock while open. Portal-rendered to
// `document.body` for the same stacking-context reasons FilterSheet is.
//
// DRAFT STATE: the name field seeds a local draft from the current `name` prop each time
// the modal opens (not on every prop change — same reasoning as FilterSheet's `state`
// draft), so an unsaved edit is discarded on close/Escape/backdrop click.

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function CloseGlyph() {
  return (
    <svg
      width="16"
      height="16"
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

export interface EditProfileModalProps {
  open: boolean;
  name: string;
  email?: string;
  onClose: () => void;
  /** Persist the new name (PATCH /v1/me). The caller closes the modal on success. */
  onSave: (name: string) => Promise<void>;
}

export function EditProfileModal({ open, name, email, onClose, onSave }: EditProfileModalProps) {
  const titleId = useId();
  const nameInputId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const [draftName, setDraftName] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useElementPending();

  useEffect(() => {
    if (open) {
      setDraftName(name);
      setError(null);
    }
    // Intentionally keyed on `open` only — see FilterSheet's identical draft-seeding note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const sheet = sheetRef.current;
      if (!sheet) return;
      const focusable = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !sheet.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    (closeButtonRef.current ?? sheetRef.current)?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  const handleSave = useCallback(async () => {
    const trimmed = draftName.trim();
    if (!trimmed) {
      setError('Name cannot be empty.');
      return;
    }
    setError(null);
    try {
      await run(() => onSave(trimmed));
      onClose();
    } catch {
      setError('We couldn’t save your changes just now. Please try again.');
    }
  }, [draftName, onSave, onClose, run]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-ink/40 md:items-center md:p-6"
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="relative max-h-[85vh] w-full overflow-y-auto rounded-t-[20px] bg-paper px-5 pb-8 pt-5 outline-none md:max-w-[420px] md:rounded-[20px]"
      >
        <div aria-hidden className="mx-auto mb-5 h-1 w-9 rounded-sm bg-mist" />

        <div className="mb-6 flex items-center justify-between">
          <h2 id={titleId} className="text-[17px] font-semibold text-ink">
            Edit profile
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close edit profile"
            className="-mr-1 flex items-center justify-center p-1.5 text-stone transition-colors hover:text-ink"
          >
            <CloseGlyph />
          </button>
        </div>

        <div className="mb-4">
          <label
            htmlFor={nameInputId}
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-caption text-stone"
          >
            Name
          </label>
          <input
            id={nameInputId}
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            disabled={pending}
            className="h-12 w-full rounded-md border border-mist/40 bg-bone px-3.5 text-[15px] text-ink outline-none focus-visible:border-ink disabled:opacity-60"
          />
        </div>

        {/* Email — READ-ONLY: no write path exists (PATCH /v1/me accepts `name` only),
            and changing a login email would break magic-link sign-in for that address
            until a re-verification flow exists. Presented as legible static text (not a
            disabled input pretending to be an editable field). */}
        {email ? (
          <div className="mb-6">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-caption text-stone">
              Email
            </span>
            <div className="flex h-12 w-full items-center justify-between rounded-md border border-mist/30 bg-mist/10 px-3.5">
              <span className="body-m truncate text-graphite">{email}</span>
              <span className="ml-2 shrink-0 text-[10px] uppercase tracking-caption text-stone">
                Not editable
              </span>
            </div>
            <p className="body-s mt-1.5 text-stone">
              Your email is your sign-in address and can’t be changed here.
            </p>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="body-s mb-4 text-clay">
            {error}
          </p>
        ) : null}

        <PendingButton
          pending={pending}
          pendingLabel="Saving…"
          onClick={() => void handleSave()}
          fullWidth
        >
          Save changes
        </PendingButton>
      </div>
    </div>,
    document.body,
  );
}
