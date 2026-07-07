// Single source of truth for navigation destinations, shared by AppHeader
// (desktop top nav) and BottomNavigation (mobile tab bar) so the two never drift.
//
// These routes are the Phase 1 screens (Architecture Plan §5). All of them are
// now implemented, so every nav link resolves to a real page; the hrefs are the
// real intended routes, not placeholders.

export interface NavItem {
  /** Stable key + active-state matcher (route prefix). */
  href: string;
  label: string;
}

/** Primary desktop nav (matches home.html / map.html's top Nav). */
export const PRIMARY_NAV: readonly NavItem[] = [
  { href: '/', label: 'Home' },
  { href: '/map', label: 'Map' },
  { href: '/collections', label: 'Collections' },
  { href: '/journal', label: 'Journal' },
] as const;

/** Mobile bottom tab bar (design prompt §Information Architecture). */
export const TAB_NAV: readonly NavItem[] = [
  { href: '/', label: 'Home' },
  { href: '/map', label: 'Map' },
  { href: '/saved', label: 'Saved' },
  { href: '/profile', label: 'Profile' },
] as const;

/**
 * Is `href` the active route for the current `pathname`? Exact match for the
 * home route; prefix match for sections (so /map/anything still lights up Map).
 */
export function isActiveRoute(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
