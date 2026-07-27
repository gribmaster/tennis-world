'use client';

import { useId, useState } from 'react';
import { PaywallTrigger } from '@/features/paywall';
import { ManageBillingButton } from '@/features/billing';
import { PendingLink } from '@/components/navigation';

// Footer — the shared dark site footer, ported from `files/*.html`'s `Footer`
// component (every prototype screen renders it). Rendered once by `AppShell`, so
// it appears consistently on every screen with no per-page wiring.
//
// Desktop (md+): unchanged multi-column layout, always fully visible.
// Mobile/tablet (< md): a compact collapsed state (brand+copyright row, key
// legal/support links row, expand control) that reveals the remaining columns
// on demand — same link set as desktop, just progressively disclosed. This is a
// single component with responsive rendering (no separate mobile footer file).
//
// PRESENTATIONAL only (Phase 1). It owns layout/typography + local chrome copy; it
// does NOT fetch, hold state beyond the mobile expand/collapse toggle, or import
// `@tennis/mock-data`. The link labels are page chrome (same latitude
// HomePaywallBand / MapFilterBar take for local copy).
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

// The Company column's Privacy/Terms/Contact are the "most important legal and
// support links" surfaced directly in the mobile collapsed state (row 2), per the
// client brief. Pulled from COLUMNS (not redeclared) so the two views can never
// drift out of sync with each other.
const COMPANY_COLUMN = COLUMNS.find((column) => column.title === 'Company')!;
const MOBILE_QUICK_LINKS = COMPANY_COLUMN.links.filter((link) =>
  ['Privacy', 'Terms', 'Contact'].includes(link.label),
);

/**
 * Render a column link — the shared Paywall trigger for the membership "Unlock" links,
 * the ManageBillingButton for "Restore" (opens the Stripe Customer Portal), a plain <a>
 * for external/mailto links, or a real <Link> for internal routes.
 */
function FooterLinkItem({ link, className }: { link: FooterLink; className: string }) {
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
    <PendingLink href={link.href} className={className}>
      {link.label}
    </PendingLink>
  );
}

export function Footer() {
  const year = new Date().getFullYear();
  const [expanded, setExpanded] = useState(false);
  const mobileLinksId = useId();

  const desktopLinkClass =
    'block text-left text-[14px] leading-[1.8] text-bone/65 transition-colors hover:text-bone';
  const mobileQuickLinkClass =
    'inline-flex items-center py-0.7 text-[13px] text-bone/70 transition-colors hover:text-bone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bone/50 rounded-sm';
  const mobileExpandedLinkClass =
    'block py-1.5 text-[13px] leading-[1.6] text-bone/65 transition-colors hover:text-bone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bone/50 rounded-sm';

  return (
    <footer className="bg-ink text-bone">
      {/* ── Mobile/tablet (< md): compact collapsed-by-default footer ── */}
      <div className="container-page py-5 md:hidden">
        {/* Row 1: brand + copyright */}
        <div className="flex justify-between">
          <div className="serif flex items-baseline gap-2 text-[15px] tracking-[0.08em] text-bone">
            <span>TENNIS · WORLD</span>
            <span className="text-bone/40">&middot;</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4">
            {MOBILE_QUICK_LINKS.map((link) => (
              <FooterLinkItem key={link.label} link={link} className={mobileQuickLinkClass} />
            ))}
          </div>
        </div>

        {/* Row 3: expand control */}
        <div className="flex justify-between items-end">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={mobileLinksId}
            onClick={() => setExpanded((value) => !value)}
            className="mt-3 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.08em] text-bone/70 transition-colors hover:text-bone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bone/50 rounded-sm"
          >
            {expanded ? 'Less' : 'More links'}
            <ChevronIcon
              className={`transition-transform duration-200 motion-reduce:transition-none ${
                expanded ? 'rotate-180' : ''
              }`}
            />
          </button>
          <span className="text-[11px] tracking-[0.04em] text-bone/50">&copy; {year}</span>
        </div>

        {/* Expanded content: every remaining column, densely grouped in a 2-col grid.
            The outer div drives the collapse/expand animation via a CSS grid-rows trick
            (0fr → 1fr) rather than the `hidden` attribute, since a plain `hidden` loses to
            the inner `.grid` utility's `display: grid` (both are plain, non-!important
            class rules, and `.grid` sorts after the UA `[hidden]` rule in the compiled
            stylesheet, so `hidden` alone would not actually hide a grid child). `inert`
            drops the collapsed content from tab order and assistive tech while collapsed,
            without fighting that same specificity issue. The divider/top padding live on
            this outer div (not the inner grid) so the collapsed 0fr row truly reaches
            zero height instead of being floored by the inner content's own padding. */}
        <div
          id={mobileLinksId}
          inert={!expanded}
          className={`grid overflow-hidden border-bone/10 transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
            expanded ? 'grid-rows-[1fr] mt-3 border-t pt-4 opacity-100' : 'grid-rows-[0fr] border-t-0 pt-0 opacity-0'
          }`}
        >
          <div className="grid min-h-0 grid-cols-2 gap-x-6 gap-y-4">
            {COLUMNS.map((column) => (
              <div key={column.title}>
                <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-bone/45">
                  {column.title}
                </div>
                {column.links.map((link) => (
                  <FooterLinkItem
                    key={link.label}
                    link={link}
                    className={mobileExpandedLinkClass}
                  />
                ))}
              </div>
            ))}
            <div className="col-span-2 text-[11px] text-bone/30">v 1.0</div>
          </div>
        </div>
      </div>

      {/* ── Desktop (md+): unchanged original layout ── */}
      <div className="container-page hidden pb-12 pt-16 md:block">
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
                <FooterLinkItem key={link.label} link={link} className={desktopLinkClass} />
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

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      className={className}
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
