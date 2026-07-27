import { useId } from 'react';
import { ConsultationTrigger } from '@/features/consultation';
import { ManageBillingButton } from '@/features/billing';
import { PendingLink, useNavigationPendingRegistry } from '@/components/navigation';
import { InlineSpinner } from '@/components/ui';

// ProfileMenuRow — one settings/menu row, ported from profile.html's menu list rows.
//
// PRESENTATIONAL primitive + a couple of behavioral rows. A row is a label (+ optional
// right-aligned value) with a chevron, or — for the final "Sign Out" row — a clay-toned
// label with no chevron. Behaviors by `action`:
//   • `'consult'` — opens the shared Consultation modal (presentational only), matching
//     the prototype's `onConsult`;
//   • `'portal'`  — opens the hosted Stripe Customer Portal (Feature 67 — the
//     "Subscription & Purchases" row). Renders a <ManageBillingButton> styled as a row;
//     a logged-out click routes to /signin, a failure shows a calm inline error;
//   • `'link'` (default) — a Next <Link> when a real `href` is given (Privacy → /privacy,
//     Terms → /terms, Sign In → /signin), otherwise an inert "#" placeholder for the few
//     rows with no destination yet (Notifications/Language/Help, Sign Out).
// The page/list supplies the row's content; this primitive owns layout/typography.

export interface ProfileMenuRowProps {
  label: string;
  /** Optional right-aligned value (e.g. "English" on the Language row). */
  value?: string;
  /** Clay-toned variant with no chevron — used for the "Sign Out" placeholder. */
  tone?: 'default' | 'danger';
  /**
   * Row behavior. `'link'` (default) is a link row; `'consult'` opens the shared
   * Consultation modal (the "Contact Concierge" row); `'portal'` opens the hosted Stripe
   * Customer Portal (the "Subscription & Purchases" row — Feature 67). A `'link'` row
   * points at `href` when given (a real route), otherwise at "#" (an inert placeholder).
   */
  action?: 'link' | 'consult' | 'portal';
  /**
   * Real destination for a link row (e.g. "/privacy", "/terms", "/signin"). When omitted,
   * the link row is an inert "#" placeholder (no real target exists yet in Phase 1).
   */
  href?: string;
  /** Source label passed to the consultation modal (future analytics only). */
  source?: string;
}

function ChevronGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function ProfileMenuRow({
  label,
  value,
  tone = 'default',
  action = 'link',
  href,
  source,
}: ProfileMenuRowProps) {
  const isDanger = tone === 'danger';
  const pendingId = useId();
  const { pendingId: activePendingId } = useNavigationPendingRegistry();
  const isPending = activePendingId === pendingId;

  const rowClass = `flex h-14 w-full items-center justify-between border-b border-hairline px-1 text-left ${
    isDanger ? 'text-clay' : 'text-ink'
  }`;

  // The trailing chevron slot doubles as the pending spinner slot for link rows — a
  // navigation click swaps THAT glyph for a spinner in place, so the row's `justify-between`
  // layout (label ↔ trailing cluster) never shifts to accommodate a third element.
  const rowContent = (
    <>
      <span className="body-l">{label}</span>
      {!isDanger ? (
        <span className="flex items-center gap-2 text-stone">
          {value ? <span className="body-m">{value}</span> : null}
          {isPending ? <InlineSpinner label={`Loading ${label}…`} /> : <ChevronGlyph />}
        </span>
      ) : null}
    </>
  );

  // "Contact Concierge" → open the shared Consultation modal (presentational only).
  // ConsultationTrigger renders a <button>, styled here to match a menu row.
  if (action === 'consult') {
    return (
      <ConsultationTrigger source={source} className={rowClass}>
        {rowContent}
      </ConsultationTrigger>
    );
  }

  // "Subscription & Purchases" → open the hosted Stripe Customer Portal (Feature 67).
  // ManageBillingButton renders a <button> styled as a row; it handles loading (disables),
  // the logged-out → /signin redirect, and a calm inline error under the row on failure.
  if (action === 'portal') {
    return (
      <ManageBillingButton className={rowClass} ariaLabel={label}>
        {rowContent}
      </ManageBillingButton>
    );
  }

  // Link rows with a real destination (Privacy/Terms/Sign In) use PendingLink so a click
  // shows pending feedback (chevron → spinner, via `rowContent`'s own `isPending` read
  // above) on THIS row only, cleared once the route changes (or on a safety-net timeout if
  // navigation never actually starts). `spinnerPosition="none"` suppresses PendingLink's
  // own automatic spinner since `rowContent` already renders one in the chevron slot.
  if (href) {
    return (
      <PendingLink href={href} pendingId={pendingId} className={rowClass} spinnerPosition="none">
        {rowContent}
      </PendingLink>
    );
  }

  return (
    // Phase 1: inert placeholder. No auth/logout/settings target exists yet for these
    // rows, so they link to "#". Phase 4 wires real destinations (account, subscription,
    // Sign Out, etc.).
    <a href="#" className={rowClass}>
      {rowContent}
    </a>
  );
}
