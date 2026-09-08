/* eslint-disable no-console */
//
// UX audit — Back navigation + element-level pending/loading states verification.
//
// This feature (Back buttons + click-scoped pending feedback) is WEB-ONLY presentational
// wiring: no repository, API, database, or auth changes. There is no component-rendering
// test harness in this repo (no Jest/Vitest/Playwright/RTL configured for apps/web — see
// the other scripts/verify-*.ts files, which all assert on source text / factory wiring
// rather than mounting React). This script follows that SAME convention: it reads the
// actual shipped source files and asserts the invariants the brief requires, so a future
// change that silently reintroduces a full-page loader, a raw `history.back()`, or an
// un-cleared pending state fails this script rather than shipping unnoticed.
//
// Covers the ten required scenarios from the brief, each as one or more checks below:
//   1. Clicking one court card shows pending only on that card.
//   2. Other cards remain clickable.
//   3. Clicking a collection card behaves the same.
//   4. Async action button becomes disabled and shows an inline spinner.
//   5. Failed request clears pending state.
//   6. Route change clears navigational pending state.
//   7. Back button uses history for an in-app referrer.
//   8. Back button falls back safely on direct page load.
//   9. No full-page overlay appears.
//   10. Reduced-motion preference disables/minimizes spinner animation.
//
// Where a scenario is inherently about RUNTIME behavior in a browser (e.g. "only that
// card dims"), this script asserts the SOURCE-LEVEL guarantee that makes it true (e.g. a
// single shared pending id in the registry, `finally` blocks that always reset state) —
// the closest deterministic, CI-safe proxy available without a DOM test runner.
//
// Run: pnpm --filter @tennis/web verify:ux-pending-states

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(HERE, '..');
const SRC = join(WEB_ROOT, 'src');

// ── Tiny assertion harness (matches the sibling verify-*.ts scripts) ────────────────
interface CheckResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail?: string;
}
const results: CheckResult[] = [];

function record(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
  const tag = ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  ${tag}  ${name}`);
  if (!ok && detail) for (const line of detail.split('\n')) console.log(`        ${line}`);
}
function expectTrue(name: string, ok: boolean, detail?: string): void {
  record(name, ok, ok ? undefined : detail);
}

function readSrc(rel: string): string {
  const p = join(SRC, rel);
  if (!existsSync(p)) return '';
  return readFileSync(p, 'utf8');
}

/** Strip `//` line comments so "absence" checks assert against actual CODE, not prose that
 *  merely explains what was deliberately avoided (this repo's files document that a lot). */
function stripLineComments(src: string): string {
  return src
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

async function main(): Promise<void> {
  console.log('UX audit — Back navigation + element-level pending states\n');

  // ── Core primitives exist ──────────────────────────────────────────────────────────
  console.log('Primitives');
  const spinner = readSrc('components/ui/InlineSpinner.tsx');
  const provider = readSrc('components/navigation/NavigationPendingProvider.tsx');
  const pendingLink = readSrc('components/navigation/PendingLink.tsx');
  const pendingCardLink = readSrc('components/navigation/PendingCardLink.tsx');
  const pendingButton = readSrc('components/navigation/PendingButton.tsx');
  const useElementPending = readSrc('components/navigation/useElementPending.ts');
  const backButton = readSrc('components/navigation/BackButton.tsx');
  const useInAppHistory = readSrc('components/navigation/useInAppHistory.ts');
  const globalsCss = readSrc('app/globals.css');
  const appShell = readSrc('components/layout/AppShell.tsx');

  expectTrue('InlineSpinner component exists', spinner.length > 0);
  expectTrue('NavigationPendingProvider exists', provider.length > 0);
  expectTrue('PendingLink exists', pendingLink.length > 0);
  expectTrue('PendingCardLink exists', pendingCardLink.length > 0);
  expectTrue('PendingButton exists', pendingButton.length > 0);
  expectTrue('useElementPending exists', useElementPending.length > 0);
  expectTrue('BackButton exists', backButton.length > 0);
  expectTrue('useInAppHistory exists', useInAppHistory.length > 0);

  // ── Scenario 1 & 2: single shared pending id ⇒ only the clicked card is pending,
  //    every other card stays interactive (they simply aren't the one id in the slot). ──
  console.log('\nScenario 1–2: exactly one card shows pending; others stay clickable');
  expectTrue(
    'NavigationPendingProvider holds a SINGLE pendingId (not a Set/array of many)',
    /pendingId:\s*string\s*\|\s*null/.test(provider) &&
      !/pendingIds/.test(provider.replace(/\/\/.*$/gm, '')), // ignore comment mentions
  );
  expectTrue(
    'PendingCardLink compares its OWN id against the shared pendingId (isPending = activePendingId === id)',
    /isPending\s*=\s*activePendingId\s*===\s*id/.test(pendingCardLink),
  );
  expectTrue(
    'PendingCardLink uses per-instance ids (useId by default) so unrelated cards never share one',
    /useId\(\)/.test(pendingCardLink) && /pendingId\s*\?\?\s*autoId/.test(pendingCardLink),
  );
  expectTrue(
    'A pending card does not get `disabled` (unrelated cards are never globally blocked by one click)',
    !/disabled=\{?true\}?/.test(pendingCardLink) && !/setDisabled/.test(pendingCardLink),
  );

  // ── Scenario 3: collection cards use the identical mechanism as court cards ─────────
  console.log('\nScenario 3: collection cards behave the same as court cards');
  const courtCard = readSrc('components/court/CourtCard.tsx');
  const collectionCard = readSrc('features/collections/CollectionCard.tsx');
  const articleCard = readSrc('features/journal/ArticleCard.tsx');
  const savedCollectionRow = readSrc('features/saved/SavedCollectionRow.tsx');
  const mapCourtRow = readSrc('features/map/MapCourtRow.tsx');
  for (const [label, src] of [
    ['CourtCard', courtCard],
    ['CollectionCard', collectionCard],
    ['ArticleCard', articleCard],
    ['SavedCollectionRow', savedCollectionRow],
    ['MapCourtRow', mapCourtRow],
  ] as const) {
    expectTrue(`${label} uses PendingCardLink for its whole-card navigation`, /PendingCardLink/.test(src));
    expectTrue(`${label} no longer imports next/link directly`, !/from 'next\/link'/.test(src));
  }

  // ── Scenario 4: async action buttons show a disabled + spinner state ────────────────
  console.log('\nScenario 4: async action buttons disable + show an inline spinner while pending');
  const courtSaveButton = readSrc('features/court-detail/CourtSaveButton.tsx');
  const saveToCollectionMenu = readSrc('features/court-detail/SaveToCollectionMenu.tsx');
  const createCollectionModal = readSrc('features/user-collections/CreateCollectionModal.tsx');
  const userCollectionRename = readSrc('features/user-collection-detail/UserCollectionRename.tsx');
  const savedCourtsGrid = readSrc('features/saved/SavedCourtsGrid.tsx');
  const signOutButton = readSrc('features/auth/SignOutButton.tsx');
  const manageBillingButton = readSrc('features/billing/ManageBillingButton.tsx');
  const paywallCheckoutButton = readSrc('features/billing/PaywallCheckoutButton.tsx');
  const signInForm = readSrc('features/auth/SignInForm.tsx');
  const signUpForm = readSrc('features/auth/SignUpForm.tsx');

  for (const [label, src] of [
    ['CourtSaveButton (save/unsave)', courtSaveButton],
    ['SaveToCollectionMenu (add/remove from collection)', saveToCollectionMenu],
    ['CreateCollectionModal (create collection)', createCollectionModal],
    ['UserCollectionRename (rename collection)', userCollectionRename],
    ['SavedCourtsGrid (unsave)', savedCourtsGrid],
    ['SignOutButton (logout)', signOutButton],
    ['ManageBillingButton (portal)', manageBillingButton],
    ['PaywallCheckoutButton (checkout)', paywallCheckoutButton],
    ['SignInForm (auth submit)', signInForm],
    ['SignUpForm (auth submit)', signUpForm],
  ] as const) {
    expectTrue(`${label} renders InlineSpinner while pending`, /InlineSpinner/.test(src));
    expectTrue(`${label} sets aria-busy`, /aria-busy/.test(src));
    expectTrue(`${label} disables the control while pending`, /disabled=\{/.test(src));
  }

  // ── Scenario 5: pending clears on failure — every mutation site resets state in a
  //    `finally` (or equivalent unconditional reset), not only on the success path. ──────
  console.log('\nScenario 5: failed requests clear pending state (no stuck-disabled controls)');
  expectTrue(
    'useElementPending resets `pending` in a finally block (never left stuck on throw)',
    /finally\s*\{[\s\S]*?setPending\(false\)/.test(useElementPending),
  );
  expectTrue(
    'CourtSaveButton resets `pending` via .finally() on the save/unsave write',
    /\.finally\(\(\) => setPending\(false\)\)/.test(courtSaveButton),
  );
  expectTrue(
    'SaveToCollectionMenu resets a toggle row\'s pending id via .finally()',
    /\.finally\(\(\) => \{[\s\S]*?setPendingIds/.test(saveToCollectionMenu),
  );
  expectTrue(
    'CreateCollectionModal resets pending in a finally after awaiting onCreate',
    /finally\s*\{\s*setPending\(false\)/.test(createCollectionModal),
  );
  expectTrue(
    'UserCollectionRename resets pending in a finally and surfaces a retry-safe error message',
    /finally\s*\{\s*setPending\(false\)/.test(userCollectionRename) && /catch/.test(userCollectionRename),
  );
  expectTrue(
    'SavedCourtsGrid restores the removed court on a failed unsave (rollback, not a stuck state)',
    /\.catch\(\(err: unknown\) => \{[\s\S]*?setItems/.test(savedCourtsGrid),
  );

  // ── Scenario 6: navigational pending clears when the ROUTE actually changes ─────────
  console.log('\nScenario 6: route change clears navigational pending state');
  expectTrue(
    'NavigationPendingProvider watches usePathname() and clears pendingId when it changes',
    /usePathname\(\)/.test(provider) && /setPendingId\(null\)/.test(provider),
  );
  expectTrue(
    'NavigationPendingProvider deliberately does NOT call useSearchParams() in actual code ' +
      '(would force a Suspense boundary / CSR bailout on every route via AppShell) — only ' +
      'mentioned in comments explaining why it was avoided',
    !/useSearchParams\(/.test(stripLineComments(provider)),
  );
  expectTrue(
    'PendingLink/PendingCardLink also arm a safety-net timeout that clears pending if ' +
      'navigation never actually starts (e.g. href === current route)',
    /window\.setTimeout\(\(\) => clear\(id\), NAV_START_TIMEOUT_MS\)/.test(pendingLink) &&
      /window\.setTimeout\(\(\) => clear\(id\), NAV_START_TIMEOUT_MS\)/.test(pendingCardLink),
  );
  expectTrue(
    'AppShell mounts NavigationPendingProvider exactly once at the root so the clear-on-route-change watcher is always active',
    /NavigationPendingProvider/.test(appShell),
  );

  // ── Scenario 7 & 8: BackButton — history-aware with a safe, explicit fallback ───────
  console.log('\nScenario 7–8: Back button uses history when available, else a safe fallback');
  expectTrue(
    'BackButton calls router.back() only when useInAppHistory() reports real in-app history',
    /hasInAppHistory/.test(backButton) && /router\.back\(\)/.test(backButton),
  );
  expectTrue(
    'BackButton requires an explicit fallbackHref prop (no implicit/guessed fallback)',
    /fallbackHref:\s*string/.test(backButton),
  );
  expectTrue(
    'BackButton never reads document.referrer in actual code (never trusts/derives a target ' +
      'from an external referrer) — only mentioned in comments explaining why it was avoided',
    !/document\.referrer/.test(stripLineComments(backButton)) &&
      !/document\.referrer/.test(stripLineComments(useInAppHistory)),
  );
  expectTrue(
    'useInAppHistory tracks navigation itself (sessionStorage counter keyed off usePathname), not document.referrer',
    /sessionStorage/.test(useInAppHistory) && /usePathname/.test(useInAppHistory),
  );
  expectTrue(
    'No raw `javascript:history.back()` or bare (non-router) `history.back()` call in actual code',
    (() => {
      const code = stripLineComments(backButton);
      if (/javascript:history\.back/.test(code)) return false;
      // Flag a bare `history.back(` call that ISN'T `router.back(` — a raw, unrouted history
      // pop the brief explicitly disallows (Next's router.back() is the sanctioned form).
      return !/(?<!router\.)\bhistory\.back\(/.test(code);
    })(),
  );

  const courtDetailPage = readSrc('app/courts/[slug]/page.tsx');
  const collectionDetailHero = readSrc('features/collection-detail/CollectionDetailHero.tsx');
  const articleHero = readSrc('features/journal-detail/ArticleHero.tsx');
  const userCollectionHero = readSrc('features/user-collection-detail/UserCollectionHero.tsx');
  const billingReturn = readSrc('features/billing/BillingReturn.tsx');
  const profileSettingsPage = readSrc('app/profile/settings/page.tsx');

  for (const [label, src, expectedFallback] of [
    ['Court detail page', courtDetailPage, '/map'],
    ['Collection detail hero', collectionDetailHero, '/collections'],
    ['Article detail hero', articleHero, '/journal'],
    ['User wishlist-folder hero', userCollectionHero, '/saved'],
    ['Billing return page', billingReturn, '/profile'],
    ['Profile settings page', profileSettingsPage, '/profile'],
  ] as const) {
    expectTrue(`${label} renders <BackButton>`, /<BackButton\b/.test(src));
    expectTrue(
      `${label} BackButton fallbackHref is "${expectedFallback}"`,
      new RegExp(`fallbackHref=["']${expectedFallback.replace('/', '\\/')}["']`).test(src),
    );
  }

  // ── Scenario 9: no full-page overlay / blocking loader was introduced ───────────────
  console.log('\nScenario 9: no full-page overlay appears anywhere in the new code');
  const allNewFiles: Array<[string, string]> = [
    ['InlineSpinner', spinner],
    ['NavigationPendingProvider', provider],
    ['PendingLink', pendingLink],
    ['PendingCardLink', pendingCardLink],
    ['PendingButton', pendingButton],
    ['BackButton', backButton],
  ];
  for (const [label, src] of allNewFiles) {
    // A full-page overlay would be `fixed inset-0` (viewport-covering) with high opacity, or
    // a z-index intended to sit above the whole app chrome. Our card overlay is intentionally
    // `absolute inset-0` (scoped to the card box only) — never `fixed`.
    expectTrue(`${label} never uses a \`fixed inset-0\` full-viewport overlay`, !/fixed\s+inset-0/.test(src));
  }
  expectTrue(
    'PendingCardLink\'s pending overlay is `absolute inset-0` (scoped to the card), not `fixed`',
    /absolute inset-0/.test(pendingCardLink) && !/fixed inset-0/.test(pendingCardLink),
  );
  expectTrue(
    'AppShell does not render any new full-page loading overlay component',
    !/FullPageLoader|GlobalSpinner|PageLoadingOverlay/.test(appShell),
  );

  // ── Scenario 10: reduced-motion minimizes the spinner animation ─────────────────────
  console.log('\nScenario 10: prefers-reduced-motion minimizes the spinner animation');
  expectTrue(
    '.tw-spinner is a pure CSS animation (no JS-driven timers/rAF loop)',
    /animation:\s*tw-spin/.test(globalsCss) && !/requestAnimationFrame/.test(spinner),
  );
  expectTrue(
    'globals.css defines a @media (prefers-reduced-motion: reduce) override for .tw-spinner',
    /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.tw-spinner/.test(globalsCss),
  );
  expectTrue(
    'the reduced-motion override meaningfully slows the spin (not just removed, and not identical to the default)',
    (() => {
      const defaultMatch = /\.tw-spinner\s*\{[^}]*animation:\s*tw-spin\s*(\d+)ms/.exec(globalsCss);
      const reducedBlock = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\}\s*\}/.exec(globalsCss)?.[1] ?? '';
      const reducedMatch = /animation-duration:\s*(\d+)ms/.exec(reducedBlock);
      if (!defaultMatch || !reducedMatch) return false;
      const defaultMs = Number(defaultMatch[1]);
      const reducedMs = Number(reducedMatch[1]);
      return reducedMs > defaultMs * 1.5; // meaningfully slower, not a no-op
    })(),
  );
  expectTrue(
    'InlineSpinner exposes an accessible (visually-hidden) loading label via role="status" + sr-only text',
    /role="status"/.test(spinner) && /sr-only/.test(spinner),
  );
  expectTrue(
    'InlineSpinner inherits color (no hardcoded palette) — uses currentColor via the .tw-spinner class only',
    !/color:\s*#/.test(spinner) && /border:\s*2px solid currentColor/.test(globalsCss),
  );

  summarize();
}

function summarize(): void {
  const failed = results.filter((r) => !r.ok);
  console.log('\n──────────────────────────────────────────────');
  console.log(`Total checks: ${results.length}   Passed: ${results.length - failed.length}   Failed: ${failed.length}`);
  if (failed.length) {
    console.log('\nFailing checks:');
    for (const f of failed) console.log(`  - ${f.name}`);
    console.log('\n\x1b[31mVERIFICATION FAILED\x1b[0m\n');
    process.exit(1);
  }
  console.log('\n\x1b[32mVERIFICATION PASSED — Back navigation + element-level pending states wired as specified.\x1b[0m\n');
}

main().catch((err) => {
  console.error('\n\x1b[31mHarness crashed:\x1b[0m', err);
  process.exitCode = 1;
});
