'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { TAB_NAV, isActiveRoute } from './nav-items';

// BottomNavigation — the mobile bottom tab bar (design prompt §Information
// Architecture): Home · Map · Saved · Profile. Outlined icons at rest, ink color
// + heavier weight when active; stone when inactive. Mobile only — hidden at md+
// where AppHeader's desktop nav takes over. Sits above the iOS home indicator via
// safe-area padding.
//
// Labels/routes come from the shared nav config — no hardcoded list here.

const ICONS: Record<string, (active: boolean) => ReactNode> = {
  '/': (active) => <HomeIcon active={active} />,
  '/map': (active) => <MapIcon active={active} />,
  '/saved': (active) => <BookmarkIcon active={active} />,
  '/profile': (active) => <UserIcon active={active} />,
};

export function BottomNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-bone/95 backdrop-blur-xl md:hidden"
    >
      <ul className="container-page flex items-stretch justify-around pb-[env(safe-area-inset-bottom)]">
        {TAB_NAV.map((item) => {
          const active = isActiveRoute(item.href, pathname);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex h-14 flex-col items-center justify-center gap-1 transition-colors ${
                  active ? 'text-ink' : 'text-stone'
                }`}
              >
                {ICONS[item.href]?.(active)}
                <span
                  className={`eyebrow ${active ? 'opacity-100' : 'opacity-70'}`}
                  style={{ fontSize: 10 }}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ── Inline icons — outlined at rest, filled accent when active ───────────────
// `active` thickens the stroke and (where natural) fills, per the design prompt's
// "outlined at rest, filled when active" rule.

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 1.8 : 1.5} aria-hidden="true">
      <path d="M4 10l8-6 8 6v9a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" strokeLinejoin="round" />
    </svg>
  );
}

function MapIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 1.8 : 1.5} aria-hidden="true">
      <path d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2z" strokeLinejoin="round" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  );
}

function BookmarkIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 1.8 : 1.5} aria-hidden="true">
      <path d="M6 4h12v16l-6-4-6 4z" strokeLinejoin="round" />
    </svg>
  );
}

function UserIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 1.8 : 1.5} aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" strokeLinecap="round" />
    </svg>
  );
}
