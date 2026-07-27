'use client';

import { forwardRef, useId } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import Link from 'next/link';
import type { LinkProps } from 'next/link';
import { InlineSpinner } from '@/components/ui';
import { useNavigationPendingRegistry } from './NavigationPendingProvider';

// PendingLink — a thin wrapper around next/link for ROW/MENU-ITEM style navigation
// (profile menu rows, header/bottom-nav items, the Back button, any single-line CTA that
// navigates). It tracks ONLY the clicked instance as pending — every other PendingLink on
// the page stays fully interactive, because the pending id is per-instance (a stable id
// from `useId()` unless the caller supplies one) and the shared registry only ever holds
// ONE id at a time.
//
// Behavior:
//   • On click, immediately claims the pending slot (before the router transition starts).
//   • Clears automatically once the pathname changes (NavigationPendingProvider watches
//     `usePathname()`), so it can't get stuck showing pending on the page it navigated to.
//   • A short safety-net timeout also clears it if the click never actually started a
//     navigation (e.g. `href` equals the current location, or the transition was
//     cancelled) — satisfies "remove the pending state if navigation fails or does not
//     start" without needing a JS navigation-cancel event, which the App Router doesn't
///    expose.
//   • Repeated clicks on an already-pending instance are ignored (`aria-disabled` + a
//     pointer-events guard), matching the "prevent repeated clicks" requirement, without
//     using a real `disabled` attribute that would strip it from the accessibility tree
//     mid-navigation (a link should stay a link).
//
// Layout stability: the spinner is added ALONGSIDE existing children (default: prefixed),
// never replacing them, and reserves its own inline space — it does not resize the link.

// How long to wait before assuming a click never actually started a navigation (e.g. the
// href pointed at the current page, or something threw before the router transition began).
const NAV_START_TIMEOUT_MS = 4000;

export interface PendingLinkProps extends LinkProps {
  children: ReactNode;
  className?: string;
  /** Explicit id for the shared pending registry. Defaults to a stable generated id. */
  pendingId?: string;
  /**
   * Where PendingLink's OWN spinner renders relative to children. Defaults to 'start'.
   * Ignored when `replaceContent` is true. Pass `'none'` when the caller renders its own
   * spinner from `children` based on the shared registry itself (e.g. swapping an icon for
   * a spinner while keeping a label) — this only suppresses PendingLink's automatic one so
   * two spinners don't show at once.
   */
  spinnerPosition?: 'start' | 'end' | 'none';
  /** Accessible/visually-hidden busy label announced while pending. */
  pendingLabel?: string;
  /**
   * For ICON-ONLY links (e.g. a fixed-size header icon button): swap the icon for the
   * spinner entirely instead of showing both side-by-side, keeping the same box size via
   * `aria-label`/className alone (no visible text label to preserve next to an icon).
   */
  replaceContent?: boolean;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}

export const PendingLink = forwardRef<HTMLAnchorElement, PendingLinkProps>(function PendingLink(
  {
    children,
    className,
    pendingId,
    spinnerPosition = 'start',
    pendingLabel = 'Loading…',
    replaceContent = false,
    onClick,
    ...linkProps
  },
  ref,
) {
  const autoId = useId();
  const id = pendingId ?? autoId;
  const { pendingId: activePendingId, start, clear } = useNavigationPendingRegistry();
  const isPending = activePendingId === id;

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    // Ignore re-clicks while this same link's navigation is already pending.
    if (isPending) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
    if (event.defaultPrevented) return;

    // Modified clicks (open in new tab/window, middle-click) leave this page — don't show
    // a pending state that would never clear via our own route-change watcher.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }

    start(id);
    // Safety net: if the pathname hasn't changed after NAV_START_TIMEOUT_MS, the
    // navigation either didn't start or landed on the same route — clear so the control
    // doesn't stay spinning forever.
    window.setTimeout(() => clear(id), NAV_START_TIMEOUT_MS);
  }

  const spinner = isPending ? <InlineSpinner label={pendingLabel} /> : null;

  return (
    <Link
      ref={ref}
      {...linkProps}
      aria-busy={isPending || undefined}
      aria-disabled={isPending || undefined}
      onClick={handleClick}
      className={className}
      style={isPending ? { pointerEvents: 'none' } : undefined}
    >
      {replaceContent && isPending ? (
        spinner
      ) : (
        <>
          {spinnerPosition === 'start' ? spinner : null}
          {children}
          {spinnerPosition === 'end' ? spinner : null}
        </>
      )}
      {/* `spinnerPosition="none"`: neither branch above renders PendingLink's own spinner —
          `children` is expected to render its own, keyed off the same shared registry. */}
    </Link>
  );
});
