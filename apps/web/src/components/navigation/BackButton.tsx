'use client';

import { useId } from 'react';
import type { MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { InlineSpinner } from '@/components/ui';
import { useNavigationPendingRegistry } from './NavigationPendingProvider';
import { useInAppHistory } from './useInAppHistory';

// BackButton — the ONE reusable Back control for every detail/nested page (court detail,
// collection detail, article detail, the user's own wishlist-folder detail, billing
// return). Replaces the three near-duplicated "← Parent" `<Link>` + local
// `ChevronLeftGlyph` implementations that existed in CollectionDetailHero, ArticleHero,
// and UserCollectionHero — those now compose this component instead of re-implementing
// the glyph/link/copy each time.
//
// Behavior (per the brief):
//   • Uses `router.back()` when the visitor actually navigated here from elsewhere in this
//     app THIS TAB SESSION (tracked by `useInAppHistory`, NOT `document.referrer` — an
//     external referrer must never be used to decide where "back" goes, and a same-origin
//     referrer doesn't by itself prove OUR OWN history stack has a matching entry to pop).
//   • Otherwise (fresh tab, external link, direct load/refresh) falls back to the explicit
//     `fallbackHref` the caller supplies (e.g. `/courts` → `/collections` → the articles
//     list → `/profile` for billing return) — never `history.back()` blindly, which could
//     leave the app or land on an external page.
//   • Never reads/uses `document.referrer` to build a navigation target — only as NOT used
//     at all (avoids the "external referrer" failure mode entirely).
//   • No `javascript:history.back()` — this is a real Next `<Link>`/`router.back()` call.
//
// Element-level pending (Section 2 of the brief): clicking shows a spinner inside THIS
// button only, via the same shared single-pending-id registry PendingLink/PendingCardLink
// use, so it behaves identically to every other navigational element in the app. Layout is
// stable — the glyph slot is reserved whether idle or pending, so the label never shifts.
export interface BackButtonProps {
  /** Where to go if there's no valid in-app history to pop back into. */
  fallbackHref: string;
  /** Visible label. Defaults to "Back". */
  label?: string;
  className?: string;
}

function ChevronLeftGlyph() {
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
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}

const NAV_START_TIMEOUT_MS = 4000;

export function BackButton({ fallbackHref, label = 'Back', className }: BackButtonProps) {
  const router = useRouter();
  const hasInAppHistory = useInAppHistory();
  const id = useId();
  const { pendingId, start, clear } = useNavigationPendingRegistry();
  const isPending = pendingId === id;

  const baseClassName =
    className ??
    'eyebrow inline-flex items-center gap-1.5 text-stone transition-colors hover:text-ink disabled:cursor-default disabled:opacity-70';

  // Fallback path: a plain PendingLink-equivalent <Link> — no JS branching needed, the
  // route-change watcher in the registry clears it once the fallback route loads.
  if (!hasInAppHistory) {
    function handleFallbackClick(event: MouseEvent<HTMLAnchorElement>) {
      if (isPending) {
        event.preventDefault();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
        return;
      }
      start(id);
      window.setTimeout(() => clear(id), NAV_START_TIMEOUT_MS);
    }

    return (
      <Link
        href={fallbackHref}
        onClick={handleFallbackClick}
        aria-busy={isPending || undefined}
        aria-disabled={isPending || undefined}
        className={baseClassName}
        style={isPending ? { pointerEvents: 'none' } : undefined}
      >
        {isPending ? <InlineSpinner label="Going back…" /> : <ChevronLeftGlyph />}
        {label}
      </Link>
    );
  }

  // In-app history path: a real <button> that pops browser history. If, for any reason,
  // the transition never actually leaves this page (e.g. the history entry was replaced
  // out from under us), the safety-net timeout clears the pending state so the button
  // never gets stuck.
  function handleBackClick() {
    if (isPending) return;
    start(id);
    try {
      router.back();
    } catch {
      // router.back() throwing is not expected, but if it ever does, don't leave the
      // button stuck pending — clear immediately and let the caller stay on this page.
      clear(id);
      return;
    }
    window.setTimeout(() => clear(id), NAV_START_TIMEOUT_MS);
  }

  return (
    <button
      type="button"
      onClick={handleBackClick}
      disabled={isPending}
      aria-busy={isPending || undefined}
      aria-disabled={isPending || undefined}
      className={baseClassName}
    >
      {isPending ? <InlineSpinner label="Going back…" /> : <ChevronLeftGlyph />}
      {label}
    </button>
  );
}
