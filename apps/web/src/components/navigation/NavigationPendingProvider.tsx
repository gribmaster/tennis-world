'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

// NavigationPendingProvider — the tiny app-wide seam that guarantees exactly ONE clicked
// navigational element (card / link / menu item / Back button) shows its pending spinner
// at a time, and that it always clears once the route actually changes.
//
// Why a context at all (vs. purely-local state per element): a click on a card/link starts
// a Next.js App Router transition whose completion is only observable app-wide, via
// `usePathname`/`useSearchParams` changing. A single element's local `useState` has no way
// to learn "the route changed, clear yourself" without either (a) every element re-deriving
// pathname/searchParams itself (fine, and IS what `usePendingNavigation` below does), or
// (b) a global "this id is pending" register so a stale click can't leave TWO elements
// spinning (e.g. a slow first click, then the user goes elsewhere via the browser back
// button — the first element must stop being "the" pending one). This is intentionally the
// ONLY global state this feature introduces (no redux/zustand/etc — a single id + a small
// pub/sub over pathname changes).
//
// Mounted ONCE near the root (AppShell) — every PendingLink/PendingCardLink reads/writes the
// same "currently pending id" through `useNavigationPendingRegistry`.

interface NavigationPendingContextValue {
  /** The id of the element currently showing pending nav state, or null if none. */
  pendingId: string | null;
  /** Claim the pending slot for `id`. No-op guard is the caller's responsibility. */
  start: (id: string) => void;
  /** Clear the pending slot, but only if it's still owned by `id` (avoids clearing a
   *  newer click's pending state after an older async catch/finally fires late). */
  clear: (id: string) => void;
}

const NavigationPendingContext = createContext<NavigationPendingContextValue | null>(null);

export function NavigationPendingProvider({ children }: { children: ReactNode }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Deliberately `usePathname()` ONLY, not `useSearchParams()`: the latter requires a
  // Suspense boundary in the App Router (Next throws a build error / forces client-side
  // rendering otherwise — see BillingReturn.tsx's own `<Suspense>` wrapper for the same
  // constraint). AppShell mounts this provider at the root of nearly every page, so pulling
  // `useSearchParams()` in here would de-opt every route from static rendering. A pathname
  // change is a reliable-enough "navigation completed" signal for clearing a nav spinner —
  // the rare query-only transition (e.g. a tab param) is expected to clear itself via the
  // element's own click-handler completion, not this global watchdog.
  const pathname = usePathname();

  const previousPathname = useRef(pathname);
  useEffect(() => {
    if (previousPathname.current !== pathname) {
      previousPathname.current = pathname;
      setPendingId(null);
    }
  }, [pathname]);

  const start = useCallback((id: string) => setPendingId(id), []);
  const clear = useCallback((id: string) => {
    setPendingId((current) => (current === id ? null : current));
  }, []);

  const value = useMemo<NavigationPendingContextValue>(
    () => ({ pendingId, start, clear }),
    [pendingId, start, clear],
  );

  return (
    <NavigationPendingContext.Provider value={value}>
      {children}
    </NavigationPendingContext.Provider>
  );
}

/**
 * Read/write access to the single shared "which navigational element is pending" slot.
 * Falls back to a harmless local-only stand-in if no provider is mounted (keeps every
 * consumer safe to use in isolation — e.g. component tests — without wrapping in the
 * provider), though AppShell always mounts one in the real app.
 */
export function useNavigationPendingRegistry(): NavigationPendingContextValue {
  const ctx = useContext(NavigationPendingContext);
  if (ctx) return ctx;
  // No-op fallback: still lets an element show ITS OWN pending state (the id just isn't
  // shared globally), so links keep working even if rendered outside the provider.
  return { pendingId: null, start: () => {}, clear: () => {} };
}
