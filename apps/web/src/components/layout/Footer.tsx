import Link from 'next/link';
import { PaywallTrigger } from '@/features/paywall';
import { ManageBillingButton } from '@/features/billing';

// Footer — the shared dark site footer, ported from `files/*.html`'s `Footer`
// component (every prototype screen renders it). Rendered once by `AppShell`, so
// it appears consistently on every screen with no per-page wiring.
//
// PRESENTATIONAL only (Phase 1). It owns layout/typography + local chrome copy; it
// does NOT fetch, hold state, or import `@tennis/mock-data`. The link labels are
// page chrome (same latitude HomePaywallBand / MapFilterBar take for local copy).
//
// LINK STATUS:
//   • "Explore" links point at REAL Phase-1 routes (/map, /collections, /journal).
//   • "Company" links now point at REAL routes too: About → /about, Privacy →
//     /privacy, Terms → /terms (the static pages built in Feature 29), and Contact →
//     a `mailto:` (matching the prototype). None are placeholders anymore.
//   • Membership "Unlock" and "What's included" open the shared Paywall modal
//     (whose primary CTA now starts a real hosted Stripe Checkout — Feature 67).
//   • "Restore" now opens the hosted Stripe Customer Portal (Feature 67 — where a user
//     restores/manages a purchase), via <ManageBillingButton>. A logged-out click routes
//     to /signin; a failure shows nothing extra in the footer (it stays a quiet link).
//     No inert placeholders remain here.

interface FooterLink {
  label: string;
  /**
   * Real internal route (e.g. "/about"), an external link (e.g. a "mailto:"), or
   * "#" for a not-yet-built target (see LINK STATUS).
   */
  href: string;
  /** When true, the link opens the shared Paywall modal instead of navigating. */
  paywall?: boolean;
  /** When true, the link opens the hosted Stripe Customer Portal (Feature 67). */
  portal?: boolean;
}

interface FooterColumn {
  title: string;
  links: FooterLink[];
}

// Copy ported verbatim from the prototype footer. Explore and Company use real
// routes (Company's Contact is a mailto); Membership opens the Paywall modal, with
// "Restore" the only remaining inert placeholder.
const COLUMNS: FooterColumn[] = [
  {
    title: 'Explore',
    links: [
      { label: 'Map', href: '/map' },
      { label: 'Collections', href: '/collections' },
      { label: 'Journal', href: '/journal' },
    ],
  },
  {
    title: 'Membership',
    links: [
      // "Unlock" and "What's included" both open the shared Paywall modal — the
      // modal already lists the membership benefits + the real recurring plan prices, so
      // "What's included" is membership/paywall info, not a static page. "Restore" opens
      // the hosted Stripe Customer Portal (Feature 67), where a returning user
      // restores/manages a purchase.
      { label: 'Unlock', href: '#', paywall: true },
      { label: 'Restore', href: '#', portal: true },
      { label: "What's included", href: '#', paywall: true },
    ],
  },
  {
    title: 'Company',
    links: [
      // Real static routes (Feature 29) + a mailto Contact, matching the prototype.
      { label: 'About', href: '/about' },
      { label: 'Contact', href: 'mailto:hello@tennisworld.app' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
    ],
  },
];

/**
 * Render a column link — the shared Paywall trigger for the membership "Unlock" links,
 * the ManageBillingButton for "Restore" (opens the Stripe Customer Portal), a plain <a>
 * for external/mailto links, or a real <Link> for internal routes.
 */
function FooterLinkItem({ link }: { link: FooterLink }) {
  const className =
    'block text-left text-[14px] leading-[1.8] text-bone/65 transition-colors hover:text-bone';
  if (link.paywall) {
    // Opens the shared Paywall modal (whose primary CTA starts checkout — Feature 67).
    return (
      <PaywallTrigger source="footer" label={link.label} className={className} />
    );
  }
  if (link.portal) {
    // "Restore" → hosted Stripe Customer Portal (Feature 67). A logged-out click routes to
    // /signin; on failure the footer stays quiet (`hideError`) so the tight dark column
    // isn't disrupted — the profile row is the primary place errors surface.
    return (
      <ManageBillingButton className={className} hideError>
        {link.label}
      </ManageBillingButton>
    );
  }
  // External (mailto:) links and the remaining "#" placeholder use a plain <a> — a
  // mailto isn't an internal route, and "#" stays an inert placeholder.
  if (link.href === '#' || !link.href.startsWith('/')) {
    return (
      <a href={link.href} className={className}>
        {link.label}
      </a>
    );
  }
  return (
    <Link href={link.href} className={className}>
      {link.label}
    </Link>
  );
}

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-ink text-bone">
      <div className="container-page pb-12 pt-16">
        {/* Top: wordmark + tagline, then the link columns. */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-10 border-b border-bone/10 pb-12">
          <div>
            <div className="serif mb-4 text-[20px] font-normal tracking-[0.16em] text-bone">
              TENNIS · WORLD
            </div>
            <p className="body-s max-w-[220px] text-bone/50">
              A curated atlas of the world&rsquo;s most beautiful tennis courts.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <div className="eyebrow mb-4 text-bone/45">{column.title}</div>
              {column.links.map((link) => (
                <FooterLinkItem key={link.label} link={link} />
              ))}
            </div>
          ))}
        </div>

        {/* Bottom: copyright + version, ported from the prototype. */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-7">
          <div className="eyebrow text-bone/30">
            &copy; {year} Tennis World &middot; All rights reserved
          </div>
          <div className="eyebrow text-bone/30">v 1.0</div>
        </div>
      </div>
    </footer>
  );
}
