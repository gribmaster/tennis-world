'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PRIMARY_NAV, TAB_NAV, isActiveRoute } from './nav-items';

// AppHeader — fixed top bar, ported from the prototypes' `Nav` component
// (home.html / map.html). Behavior:
//   • On a hero page (transparent over a full-bleed hero) it starts transparent
//     with light text, then fades to a blurred bone background once scrolled.
//   • On non-hero pages it's always the blurred bone bar.
// Desktop shows the primary nav + saved/profile icons + an optional "Unlock Map"
// CTA; mobile collapses to a hamburger dropdown. The bottom tab bar
// (BottomNavigation) carries primary navigation on mobile instead.
//
// All copy/labels come from the shared nav config — no hardcoded route lists here.

const WORDMARK = 'TENNIS · WORLD';

export interface AppHeaderProps {
  /**
   * Whether this page renders a full-bleed hero behind the header. When true the
   * header is transparent-over-hero until scrolled. Defaults to false.
   */
  overHero?: boolean;
  /**
   * Whether the user has unlocked full access. When false, the "Unlock Map" CTA
   * shows. Phase 1 has no real entitlement system, so the shell defaults to
   * locked; a real value flows in from the user repository in a later feature.
   */
  unlocked?: boolean;
  /**
   * Whether the visitor has an active session (Feature 57). Decides where the user icon
   * points: `/profile` when signed in, `/signin` when not. Defaults to false (logged-out)
   * — public pages render the logged-out header unless a page derives + passes the real
   * value (the private Profile/Saved pages do, since they only render when authenticated).
   * Deriving it on every public page would add a `GET /v1/me` per render; that broader
   * wiring is a documented follow-on.
   */
  signedIn?: boolean;
}

export function AppHeader({
  overHero = false,
  unlocked = false,
  signedIn = false,
}: AppHeaderProps) {
  const profileHref = signedIn ? '/profile' : '/signin';
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // "navOver" = the transparent, light-text state shown only over a hero before
  // the user scrolls.
  const navOver = overHero && !scrolled;
  const solid = !navOver;

  const headerClass = [
    'fixed inset-x-0 top-0 z-40 transition-all duration-300',
    solid ? 'bg-bone/95 shadow-[0_1px_0_theme(colors.hairline)] backdrop-blur-xl' : 'bg-transparent',
  ].join(' ');

  const linkColor = (active: boolean) =>
    navOver
      ? active
        ? 'text-bone'
        : 'text-bone/80 hover:text-bone'
      : active
        ? 'text-ink'
        : 'text-stone hover:text-ink';

  const iconColor = navOver ? 'text-bone/85 hover:text-bone' : 'text-stone hover:text-ink';

  return (
    <header className={headerClass}>
      <div className="container-page flex h-[72px] items-center justify-between gap-8">
        {/* Wordmark */}
        <Link
          href="/"
          aria-label="Tennis World — home"
          className={`serif text-[18px] font-normal tracking-wordmark ${navOver ? 'text-bone' : 'text-ink'}`}
        >
          {WORDMARK}
        </Link>

        {/* Desktop primary nav */}
        <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
          {PRIMARY_NAV.map((item) => {
            const active = isActiveRoute(item.href, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`eyebrow transition-colors ${linkColor(active)} ${
                  active && !navOver ? 'border-b border-current pb-px' : ''
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Desktop right cluster: saved / profile icons + Unlock CTA */}
        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/saved"
            aria-label="Saved"
            className={`p-2 transition-colors ${iconColor}`}
          >
            <BookmarkIcon />
          </Link>
          <Link
            href={profileHref}
            aria-label={signedIn ? 'Profile' : 'Sign in'}
            className={`p-2 transition-colors ${iconColor}`}
          >
            <UserIcon />
          </Link>
          {!unlocked ? (
            <Link
              href="/map"
              className={[
                'btn',
                navOver ? 'btn-over-image' : 'btn-primary',
                '!h-10 !px-5 !text-[11px] !tracking-[0.1em]',
              ].join(' ')}
            >
              Unlock Map
            </Link>
          ) : null}
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className={`p-2 transition-colors md:hidden ${navOver ? 'text-bone' : 'text-ink'}`}
        >
          {menuOpen ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>

      {/* Mobile dropdown — full nav (primary + saved/profile) for parity with the
          prototype's mobile menu. */}
      {menuOpen ? (
        <div className="border-t border-hairline bg-bone px-6 pb-6 pt-4 md:hidden">
          {TAB_NAV.map((item) => {
            const active = isActiveRoute(item.href, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`body-l block border-b border-hairline py-3.5 ${
                  active ? 'text-ink' : 'text-graphite'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          {!unlocked ? (
            <Link href="/map" className="btn btn-primary mt-5 w-full">
              Unlock Full Access
            </Link>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}

// ── Inline icons (no icon-library dependency; stroke = currentColor) ─────────
function BookmarkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M6 4h12v16l-6-4-6 4z" strokeLinejoin="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" strokeLinecap="round" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}
