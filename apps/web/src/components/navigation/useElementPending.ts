'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// useElementPending — the shared local-pending-state primitive for ASYNC ACTION controls
// (save/unsave, add/remove-from-collection, create/rename/delete, checkout, portal,
// logout, sign-in/up submits, "Check again"). This is the button-side counterpart to
// PendingLink/PendingCardLink's navigation-pending tracking.
//
// Deliberately NOT built on `useTransition`: React's transition pending flag only lasts as
// long as the synchronous-then-microtask update it wraps, which does not span an actual
// `fetch` awaiting a Railway/Supabase round trip — exactly the case the brief calls out
// ("avoid relying only on useTransition if it does not stay pending for the actual
// network/navigation duration"). Plain `useState` + explicit start/stop around the async
// call stays pending for the real duration of the request.
//
// Usage:
//   const { pending, run } = useElementPending();
//   <button disabled={pending} aria-busy={pending} onClick={() => run(() => save(id))}>
//
// `run` sets pending true synchronously (before the async call starts, so a rapid
// double-click can't race two mutations — the guard is `if (pending) return` inside `run`
// itself), awaits the action, and ALWAYS resets pending to false in a `finally` — including
// on throw — so a failed request never leaves the control stuck disabled. Errors are
// re-thrown after the state resets, so callers keep their own catch/toast logic; nothing is
// swallowed here.
export function useElementPending() {
  const [pending, setPending] = useState(false);
  // Guards against setState after unmount (e.g. the mutation resolves after the user has
  // already navigated away and this control's owner unmounted).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    // Prevent repeated clicks while a previous run of THIS control is still in flight.
    if (pending) return undefined;
    setPending(true);
    try {
      return await action();
    } finally {
      if (mountedRef.current) setPending(false);
    }
  }, [pending]);

  return { pending, run, setPending };
}
