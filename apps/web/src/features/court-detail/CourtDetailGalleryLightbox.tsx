'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { FALLBACK_IMAGE, useGallery } from './gallery-context';
import { useHorizontalSwipe } from './use-horizontal-swipe';

// CourtDetailGalleryLightbox — Task 18. Opened by CourtDetailGalleryStrip when a "Gallery"
// thumbnail is clicked, at that thumbnail's photo. It is deliberately ISOLATED from the
// hero band's shared `activeIndex`: it reads `slides`/`courtName`/`courtLabel` from
// `useGallery()` but keeps its OWN local `index` (seeded from `initialIndex` on open) and
// never calls the context's `setActiveIndex`. Opening, navigating within, or closing this
// dialog never moves the hero band.
//
// MASKED-NAME INVARIANT: rendered on both the locked and unlocked readings of the page
// (same `CourtDetailGalleryStrip`, both branches of `app/courts/[slug]/page.tsx`). Its own
// dialog label and its Prev/Next/Close buttons use `courtLabel` — the DISPLAYED name,
// masked on the locked page — never the real `courtName`. The image `alt` text keeps using
// the real `courtName`, same as the hero band above: an alt describes the photograph, it
// is not a masked surface.
//
// PURELY LOCAL UI (CLAUDE.md §4 rule 10): this only changes which image is shown. No
// repository, no API call, no mutation — so no pending primitive, no spinner, no
// `disabled` state, same as the dots and thumbnails it sits alongside.
//
// MODAL CONVENTION: structurally ReviewModal's dialog — `createPortal`, `role="dialog"` +
// `aria-modal="true"`, focus moves in on open and is restored to the triggering thumbnail
// on close (captured via `document.activeElement`, the same technique), focus trapped
// (Tab/Shift+Tab cycle), Escape closes, background scroll locked while open, close also via
// the visible ✕ and the backdrop. Bonus: swiping the photo also navigates, via the same
// `useHorizontalSwipe` hook the hero band uses.

/** Selector for everything focusable inside the dialog (used by the focus trap). */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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

function ChevronGlyph({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points={direction === 'left' ? '15 5 8 12 15 19' : '9 5 16 12 9 19'} />
    </svg>
  );
}

export interface CourtDetailGalleryLightboxProps {
  /** Whether the dialog is open. Controlled by CourtDetailGalleryStrip. */
  open: boolean;
  /** The slide index to open on, seeded from the clicked thumbnail's position. */
  initialIndex: number;
  /** Called when the user requests close (Escape, backdrop, ✕). */
  onClose: () => void;
}

export function CourtDetailGalleryLightbox({
  open,
  initialIndex,
  onClose,
}: CourtDetailGalleryLightboxProps) {
  // Read-only: `slides`/`courtName`/`courtLabel` only. `setActiveIndex` is NOT destructured
  // here on purpose — this dialog must never re-point the hero band.
  const { slides, courtName, courtLabel } = useGallery();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // Remember what had focus before opening (the clicked thumbnail) so it can be restored.
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Own local index — seeded from the clicked thumbnail every time the dialog (re)opens.
  const [index, setIndex] = useState(initialIndex);
  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  const hasMultiple = slides.length > 1;
  const goPrev = useCallback(() => {
    setIndex((i) => (i - 1 + slides.length) % slides.length);
  }, [slides.length]);
  const goNext = useCallback(() => {
    setIndex((i) => (i + 1) % slides.length);
  }, [slides.length]);

  // Drag left ⇒ next, drag right ⇒ prev — a bonus that falls out of reusing the hero's hook.
  const onPointerDown = useHorizontalSwipe(hasMultiple, goNext, goPrev);

  // Escape to close, ArrowLeft/ArrowRight to navigate, focus trap, focus move-in/restore,
  // background scroll lock — the same implementation ReviewModal uses (this app's a11y bar).
  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (hasMultiple && event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrev();
        return;
      }
      if (hasMultiple && event.key === 'ArrowRight') {
        event.preventDefault();
        goNext();
        return;
      }
      if (event.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !dialog.contains(active))) {
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

    // Move focus in. The close control is the first tab stop.
    (closeButtonRef.current ?? dialogRef.current)?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Restore focus to whatever opened the dialog (the clicked thumbnail).
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose, hasMultiple, goPrev, goNext]);

  // Render nothing when closed, and guard against SSR (the portal needs a DOM).
  if (!open || typeof document === 'undefined') return null;

  const active = slides[index] ?? slides[0]!;
  // Alt text describes the photograph — the real name, not a masked surface (same rule the
  // hero band above follows).
  const activeAlt = active.alt?.trim() || `${courtName} court image ${index + 1}`;

  return createPortal(
    // Backdrop — click closes (same dismissal convention as ReviewModal/PaywallModal).
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-ink/90 p-0 sm:p-6" onClick={onClose}>
      {/* Dialog. stopPropagation so clicks inside don't bubble to the backdrop. `courtLabel`
          (the DISPLAYED name) labels the dialog — never `courtName` — so a locked page's
          masked title cannot leak through the accessibility tree. */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${courtLabel} photo ${index + 1} of ${slides.length}`}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={onPointerDown}
        className="relative flex h-full w-full max-w-[1100px] touch-pan-y items-center justify-center outline-none sm:h-[90vh]"
      >
        {/* Close button (✕) — the dialog's first tab stop. `courtLabel`, not `courtName`. */}
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label={`Close ${courtLabel} photos`}
          className="absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-pill bg-ink/50 text-paper backdrop-blur-[8px] transition-colors hover:bg-ink/65 md:right-4 md:top-4"
        >
          <CloseGlyph />
        </button>

        <div className="relative h-full w-full">
          <Image
            key={active.url}
            src={active.url || FALLBACK_IMAGE}
            alt={activeAlt}
            fill
            priority
            // Matches the dialog's own `max-w-[1100px]` cap so Next doesn't fetch a
            // full-viewport image when the rendered box is narrower than that.
            sizes="(min-width: 1100px) 1100px, 100vw"
            className="object-contain"
          />
        </div>

        {hasMultiple ? (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label={`Previous ${courtLabel} photo`}
              className="absolute left-2 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-pill bg-ink/50 text-paper backdrop-blur-[8px] transition-colors hover:bg-ink/65 md:left-4"
            >
              <ChevronGlyph direction="left" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label={`Next ${courtLabel} photo`}
              className="absolute right-2 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-pill bg-ink/50 text-paper backdrop-blur-[8px] transition-colors hover:bg-ink/65 md:right-4"
            >
              <ChevronGlyph direction="right" />
            </button>
            <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-pill bg-ink/50 px-2.5 py-1 text-[11px] font-medium text-paper backdrop-blur-[8px]">
              {index + 1} / {slides.length}
            </div>
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
