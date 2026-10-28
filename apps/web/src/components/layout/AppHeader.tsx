'use client';

import { usePathname } from 'next/navigation';
import { PRIMARY_NAV, isActiveRoute } from './nav-items';
import { PendingLink } from '@/components/navigation';

// AppHeader — the v3 floating "pill" nav (TASK_55; `docs/REDESIGN_V3_PLAN.md`). One
// translucent, blurred, fully-rounded pill float at the top of every screen: no
// wordmark, no icons, no "Unlock Map" CTA, no hamburger — just the four text items
// (Atlas · Courts · Collections · Profile). It floats (stays `fixed`, never docks)
// so the page scrolls underneath it and it reads the same over a hero image or a
// plain background; v2's transparent-over-hero / scrolled-solid states are gone, the
// pill is always the same blurred ivory (`.nav-pill` in globals.css).
//
// Mobile and desktop share one markup; only spacing/width change at `md:` (see the
// task's mobile/desktop table) — there is no separate desktop-only nav or mobile
// dropdown/hamburger/bottom tab bar.

export interface AppHeaderProps {
  /**
   * Whether the visitor has an active session (Feature 57). Decides where the
   * Profile item points: `/profile` when signed in, `/signin` when not. Defaults to
   * false (logged-out) — public pages render the logged-out header unless a page
   * derives + passes the real value (the private Profile/Saved pages do, since they
   * only render when authenticated).
   */
  signedIn?: boolean;
}

export function AppHeader({ signedIn = false }: AppHeaderProps) {
  const pathname = usePathname();

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-3 md:px-0 md:pt-5">
      <nav
        aria-label="Primary"
        className="nav-pill pointer-events-auto flex w-full items-center justify-between shadow-nav md:w-auto md:justify-start"
      >
        {PRIMARY_NAV.map((item) => {
          const href = item.href === '/profile' && !signedIn ? '/signin' : item.href;
          const active = isActiveRoute(item.href, pathname);
          return (
            <PendingLink
              key={item.href}
              href={href}
              spinnerPosition="none"
              pendingLabel={`Loading ${item.label}…`}
              aria-current={active ? 'page' : undefined}
              className={[
                'flex-none whitespace-nowrap rounded-pill px-[14px] py-[9px] text-[13.5px] text-ink transition-colors duration-150 md:px-[22px] md:py-[11px]',
                active ? 'bg-[rgba(184,184,182,0.42)] font-semibold' : 'font-normal',
                'aria-busy:opacity-60',
              ].join(' ')}
            >
              {item.label}
            </PendingLink>
          );
        })}
      </nav>
    </div>
  );
}
