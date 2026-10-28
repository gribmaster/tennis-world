// Single source of truth for the v3 floating pill nav (TASK_55) — one list, shared by
// the single AppHeader pill on mobile and desktop (there is no separate bottom tab bar
// or desktop-only list anymore).
//
// `href` is the CANONICAL route used for active-state matching. The Profile item's
// actual link target still depends on `signedIn` (AppHeader computes that), but its
// nav-items href stays `/profile` so the table below reads the same for both states.

export interface NavItem {
  href: string;
  label: string;
}

/** The four v3 nav items: Atlas · Courts · Collections · Profile. */
export const PRIMARY_NAV: readonly NavItem[] = [
  { href: '/', label: 'Atlas' },
  { href: '/map', label: 'Courts' },
  { href: '/collections', label: 'Collections' },
  { href: '/profile', label: 'Profile' },
] as const;

// Extra pathname prefixes that should also light up a given nav item, beyond its own
// route — e.g. Court Detail (`/courts/…`) lights up "Courts" (`/map`), and the
// Profile item also covers Saved and every auth screen.
const EXTRA_ACTIVE_PREFIXES: Readonly<Record<string, readonly string[]>> = {
  '/map': ['/courts'],
  '/profile': ['/saved', '/signin', '/signup', '/verify'],
};

/**
 * Is `href` the active route for the current `pathname`? Exact match for the Atlas
 * route; prefix match for every other item, plus that item's extra prefixes above.
 */
export function isActiveRoute(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  if (pathname === href || pathname.startsWith(`${href}/`)) return true;
  const extras = EXTRA_ACTIVE_PREFIXES[href];
  return extras?.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ?? false;
}
