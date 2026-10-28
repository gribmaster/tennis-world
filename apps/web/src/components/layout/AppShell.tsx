import type { ReactNode } from 'react';
import { AppHeader } from './AppHeader';
import { Footer } from './Footer';
import { NavigationPendingProvider } from '@/components/navigation';

// AppShell — the shared page chrome: the floating AppHeader pill nav (TASK_55), the
// page's <main>, and the shared Footer. Every top-level screen renders its content
// inside this shell so header/footer behavior is defined in exactly one place.
//
// Spacing: standard pages get top padding equal to `--nav-offset` (globals.css), the
// space the floating pill reserves, so content starts clear of it. Hero pages
// (`overHero`) opt out, letting the full-bleed hero sit under the pill instead.
//
// There is no mobile bottom tab bar anymore — v3's nav is the single floating pill
// AppHeader renders, used on both mobile and desktop (TASK_55 removed
// `BottomNavigation`).
export interface AppShellProps {
  children: ReactNode;
  /** Page renders a full-bleed hero behind the floating pill nav. */
  overHero?: boolean;
  /**
   * Whether the visitor has an active session (Feature 57) — forwarded to AppHeader to
   * point the Profile item at /profile vs /signin. Defaults to false; the private
   * Profile/Saved pages pass true (they only render when authenticated).
   */
  signedIn?: boolean;
}

export function AppShell({ children, overHero = false, signedIn = false }: AppShellProps) {
  return (
    // NavigationPendingProvider mounts ONCE here so every PendingLink/PendingCardLink/
    // BackButton on the page (nav pill, cards, back buttons) shares the same single
    // "which one is pending" registry, and so it's automatically cleared when the
    // route changes (it watches `usePathname()`). See its file header for why this is the
    // one piece of shared state this feature introduces.
    <NavigationPendingProvider>
      <div className="flex min-h-dvh flex-col">
        <AppHeader signedIn={signedIn} />
        <main className={['flex-1', overHero ? '' : 'pt-[var(--nav-offset)]'].filter(Boolean).join(' ')}>
          {children}
          <Footer />
        </main>
      </div>
    </NavigationPendingProvider>
  );
}
