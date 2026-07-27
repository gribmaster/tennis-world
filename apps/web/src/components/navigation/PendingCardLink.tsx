'use client';

import { useId } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import Link from 'next/link';
import { InlineSpinner } from '@/components/ui';
import { useNavigationPendingRegistry } from './NavigationPendingProvider';

// PendingCardLink — the whole-card navigation wrapper for CourtCard / CollectionCard /
// ArticleCard / SavedCollectionRow / MapCourtRow, i.e. any "the whole tile is a link"
// pattern. Same click-tracking model as PendingLink (single shared pending id, cleared on
// route change or a safety-net timeout), but renders an unobtrusive absolute-positioned
// overlay + slight content dimming INSIDE the card instead of an inline spinner, so:
//   • the card's own dimensions never change (overlay is `absolute inset-0`, doesn't
//     participate in layout),
//   • only the clicked card dims/shows a spinner — every other card stays fully opaque
///    and clickable (verified by the shared single-pending-id registry),
//   • the card's existing content (image, gradient, badges) is preserved underneath.
//
// This does NOT replace the card's markup — it's a thin <Link> substitute a card component
// wraps ITS existing JSX with, exactly like the `<Link href={href}>{card}</Link>` pattern
// CourtCard/CollectionCard/ArticleCard already use. Swap that Link for this component and
// nothing else about the card's internals changes.

const NAV_START_TIMEOUT_MS = 4000;

export interface PendingCardLinkProps {
  href: string;
  children: ReactNode;
  /**
   * REQUIRED display + layout classes for this link (e.g. `"block"`, or
   * `"flex items-center gap-5"` for a row). This component only ever adds `relative`
   * (a non-`display` positioning class, so it never fights the caller's own `display`
   * utility over which one "wins" in Tailwind's generated stylesheet order) plus the
   * pending-state opacity/transition — every layout concern stays with the caller,
   * exactly as it was when these were plain `<Link>`s.
   */
  className: string;
  ariaLabel?: string;
  /** Explicit id for the shared pending registry. Defaults to a stable generated id. */
  pendingId?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}

export function PendingCardLink({
  href,
  children,
  className,
  ariaLabel,
  pendingId,
  onClick,
}: PendingCardLinkProps) {
  const autoId = useId();
  const id = pendingId ?? autoId;
  const { pendingId: activePendingId, start, clear } = useNavigationPendingRegistry();
  const isPending = activePendingId === id;

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (isPending) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
    if (event.defaultPrevented) return;

    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }

    start(id);
    window.setTimeout(() => clear(id), NAV_START_TIMEOUT_MS);
  }

  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      aria-busy={isPending || undefined}
      aria-disabled={isPending || undefined}
      onClick={handleClick}
      // `relative` so the overlay below can size itself to exactly this box; NOT `block` —
      // the caller's className supplies `display` (block, or flex for a row), so this never
      // fights it over which utility wins in Tailwind's generated stylesheet order. The
      // dimming (`opacity-90`) is applied HERE, directly on the real box that wraps the
      // card, rather than on an extra inner wrapper — children that rely on
      // absolute-positioning against this element (next/image `fill`, a card's internal
      // `absolute inset-x-*` overlays) are completely unaffected.
      className={['relative transition-opacity', isPending ? 'opacity-90' : '', className]
        .filter(Boolean)
        .join(' ')}
      style={isPending ? { pointerEvents: 'none' } : undefined}
    >
      {children}

      {isPending ? (
        <span
          aria-hidden
          className="absolute inset-0 z-20 flex items-center justify-center bg-ink/15 text-paper backdrop-blur-[1px]"
        >
          <InlineSpinner className="scale-[1.6]" />
        </span>
      ) : null}
    </Link>
  );
}
