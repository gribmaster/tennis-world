import type { ReactNode } from 'react';
import { AppHeader } from './AppHeader';
import { BottomNavigation } from './BottomNavigation';
import { Footer } from './Footer';
import { NavigationPendingProvider } from '@/components/navigation';

// AppShell — the shared page chrome: fixed AppHeader on top, the page's <main>,
// the shared Footer, and the mobile BottomNavigation. Every top-level screen
// renders its content inside this shell so header/footer/tab-bar behavior is
// defined in exactly one place.
//
// Spacing:
//   • Standard pages get top padding equal to the 72px header height so content
//     starts below the fixed bar. Hero pages (`overHero`) opt out, letting the
//     full-bleed hero sit under the transparent header.
//   • Bottom padding clears the mobile tab bar (~56px + safe area); removed at
//     md+ where the tab bar is hidden.
export interface AppShellProps {
  children: ReactNode;
  /** Page renders a full-bleed hero behind a transparent header. */
  overHero?: boolean;
  /** Whether the user has unlocked full access (controls the header CTA). */
  unlocked?: boolean;
  /**
   * Whether the visitor has an active session (Feature 57) — forwarded to AppHeader to
   * point the user icon at /profile vs /signin. Defaults to false; the private
   * Profile/Saved pages pass true (they only render when authenticated).
   */
  signedIn?: boolean;
  /**
   * The signed-in user's avatar fields, forwarded to AppHeader's account icon. Only
   * pages that already fetch `getCurrentUser()` for their own content (e.g. Profile)
   * pass this — it is never fetched solely to populate the header icon. Omitted
   * (undefined) elsewhere, where the header falls back to the generic user glyph.
   */
  headerUser?: { name: string; initials: string; avatarUrl?: string | null };
}

export function AppShell({
  children,
  overHero = false,
  unlocked = false,
  signedIn = false,
  headerUser,
}: AppShellProps) {
  return (
    // NavigationPendingProvider mounts ONCE here so every PendingLink/PendingCardLink/
    // BackButton on the page (header nav, bottom nav, cards, back buttons) shares the same
    // single "which one is pending" registry, and so it's automatically cleared when the
    // route changes (it watches `usePathname()`). See its file header for why this is the
    // one piece of shared state this feature introduces.
    <NavigationPendingProvider>
      <div className="flex min-h-dvh flex-col">
        <AppHeader
          overHero={overHero}
          unlocked={unlocked}
          signedIn={signedIn}
          headerUser={headerUser}
        />
        <main
          className={[
            'flex-1',
            overHero ? '' : 'pt-[72px]',
            // Clear the mobile tab bar; it's hidden at md+ so drop the padding there.
            'pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {children}
          <Footer />
        </main>
        <BottomNavigation />
      </div>
    </NavigationPendingProvider>
  );
}
