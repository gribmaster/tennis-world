'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

// useInAppHistory — answers "did the visitor get to THIS page via an in-app navigation
// (so `router.back()` has somewhere safe/relevant to go), or did they land here directly
// (fresh tab, external link, bookmark, reload)?"
//
// Why not just check `document.referrer`: an external referrer is exactly the case we must
// NOT navigate back into (the brief: "never send users to an external referrer"). Checking
// `document.referrer`'s origin is close, but a reload of the SAME page also carries the
// previous page as `document.referrer` in some browsers while `history.state` doesn't
// reflect a real "previous in-app page" the way our own click-tracking does. So instead we
// track it OURSELVES: a `sessionStorage` counter, bumped once per DISTINCT in-app pathname
// change (via Next's `usePathname`), scoped to the current tab. A fresh tab / external
// link / direct load starts the counter at 0 → `hasInAppHistory` is false → BackButton uses
// its explicit fallback route. Once the visitor has navigated at least once inside the app
// (counter >= 2, i.e. this is at least the second distinct in-app route seen this tab),
// `router.back()` is safe and returns to a page THIS app rendered.
//
// `sessionStorage` (not `localStorage`) so it's naturally per-tab and clears itself when
// the tab closes — no stale "has history" flag bleeding into a fresh session.

const STORAGE_KEY = 'tw:in-app-nav-count';

function readCount(): number {
  if (typeof window === 'undefined') return 0;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  const n = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

export function useInAppHistory(): boolean {
  const pathname = usePathname();
  const [hasInAppHistory, setHasInAppHistory] = useState(false);

  useEffect(() => {
    // Bump the counter once for this pathname's mount. A distinct mount of a page in this
    // tab means we either just landed (count goes 0→1) or navigated here from elsewhere in
    // the app (count was already >=1, now >=2).
    const next = readCount() + 1;
    window.sessionStorage.setItem(STORAGE_KEY, String(next));
    setHasInAppHistory(next > 1);
    // Intentionally re-running per pathname change (not just on mount) so a client-side
    // route change updates the flag without a full reload.
  }, [pathname]);

  return hasInAppHistory;
}
