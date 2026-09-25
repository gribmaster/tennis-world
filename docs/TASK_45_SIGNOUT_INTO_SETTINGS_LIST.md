# TASK 45 — /profile/settings: fold Sign Out into the settings row list, as the last row

**Model: Sonnet 5, reasoning effort: low.**

## Context

On `/profile/settings` (`apps/web/src/app/profile/settings/page.tsx`), the page renders,
top to bottom:

```tsx
<SettingsMenuCard user={user} />           {/* 3 rows: Subscription & access, Account
                                                settings, Contact us — one rounded paper
                                                card, hairline dividers between rows */}
<div className="mt-4 flex justify-center gap-4">
  {/* Privacy Policy / Terms of Service links */}
</div>
<div className="mt-8">
  <SignOutButton />                        {/* its OWN separate block/card below that */}
</div>
```

`SignOutButton` currently renders itself with its own standalone row styling
(`h-14 border-b border-hairline px-1`) — a leftover from the OLD `ProfileMenuList` it
used to live in, now visually a separate block sitting under the Privacy/Terms links.

**The ask: Sign Out should be the 4th row INSIDE `SettingsMenuCard`'s row list, right
after "Contact us"** — same card, same hairline-divider treatment as the other rows —
not a separate block below it. The Privacy/Terms links stay exactly where they are,
below the card; only Sign Out moves.

## 1. `apps/web/src/features/auth/SignOutButton.tsx` — accept the row's shared className

Read `apps/web/src/features/profile/SettingsAccountRow.tsx` first — it's the precedent
for a button that needs to slot into `SettingsMenuCard`'s row list: it takes a required
`className` prop from the parent (the parent passes its local `ROW_CLASS` constant) and
renders its own `<span className="flex w-full items-center justify-between">...</span>`
content inside a `<button className={className}>`.

Adapt `SignOutButton` the same way:

- Add a required prop `className: string`.
- Replace the hardcoded outer classes
  (`'flex h-14 w-full items-center justify-between border-b border-hairline px-1 text-left text-clay transition-opacity hover:opacity-70 disabled:opacity-50'`)
  with the passed-in `className`, plus keep `text-clay` and the hover/disabled-opacity
  treatment appended onto it (the danger tone stays — the user only asked to relocate
  the row, not change its color) — e.g.
  `className={[className, 'text-clay transition-opacity hover:opacity-70 disabled:opacity-50'].join(' ')}`.
- Keep the inner content (`InlineSpinner` swap, "Sign Out" / "Signing out…" text)
  unchanged — just make sure it still renders inside the new `className`'s padding
  correctly (`SettingsMenuCard`'s `ROW_CLASS` is `px-4 py-3.5`, replacing the old `px-1`).
- **No chevron** — every other row in the card ends in a `<ChevronGlyph>` (it's
  navigating to something / opening something); Sign Out is a terminal action, not a
  "there's more" affordance, so it should NOT get one. This is a deliberate
  inconsistency with the other rows' trailing chevron, not an oversight — say so in the
  file's comment so a future pass doesn't "fix" it by adding one.
- The staging-demo-mode inert branch (`isDemoMode()` → "Demo mode" row) needs the SAME
  treatment: accept and apply `className` there too, dropping its own hardcoded
  `h-14 border-b border-hairline px-1`, so the row looks consistent with the rest of the
  card in EITHER mode.
- Update this file's header comment — it currently says "Styling mirrors the clay 'Sign
  Out' ProfileMenuRow it replaces" as a STANDALONE-row justification; update it to say
  it's now a row WITHIN `SettingsMenuCard`'s card, styled via the same `className` prop
  `SettingsAccountRow` already takes, per this task.

## 2. `apps/web/src/features/profile/SettingsMenuCard.tsx` — add Sign Out as the 4th row

Add a divider + `SignOutButton` after the existing "Contact us" row:

```tsx
<ConsultationTrigger source="settings" className={ROW_CLASS}>
  <RowContent label="Contact us" />
</ConsultationTrigger>
<div className="h-px bg-hairline" />

<SignOutButton className={ROW_CLASS} />
```

Import `SignOutButton` from `@/features/auth` (already exported there per
`features/auth/index.ts`).

Update this file's header comment — it currently describes the card as "the
/profile/settings three-row card" listing three bullet rows (Subscription & access /
Account settings / Contact us); update the count to four and add a fourth bullet for
Sign Out (→ `SignOutButton`, the same real mechanism Feature 57 already wired, not a
new one).

## 3. `apps/web/src/app/profile/settings/page.tsx` — remove the standalone block

Delete the now-redundant:

```tsx
<div className="mt-8">
  <SignOutButton />
</div>
```

The `SignOutButton` import becomes unused on this page — remove it (it's now only
imported inside `SettingsMenuCard.tsx`). Resulting page order: `SettingsMenuCard`
(now 4 rows, ending in Sign Out) → Privacy/Terms links below it, unchanged.

Update this file's own header comment — the "WHERE EVERY OLD ProfileMenuList ROW ENDED
UP" block's Sign Out bullet currently says "SIGN-OUT SURVIVES here, below the card +
Privacy/Terms links" — that's now wrong; correct it to say Sign Out is the last row
INSIDE `SettingsMenuCard`, above the Privacy/Terms links.

## Do not touch

- `SettingsAccountRow.tsx`, `ManageBillingButton`, `ConsultationTrigger` — unrelated,
  read-only precedent for §1.
- The Privacy Policy / Terms of Service links block — stays exactly where it is, below
  the card, unchanged.
- Sign-out BEHAVIOR (the `api`/mock/demo-mode branching, the logout call, the
  redirect-to-`/signin`-and-refresh) — completely unchanged; this task only moves and
  restyles the row, never touches `handleSignOut`.
- Any other page that might reference `SignOutButton` — it has exactly one call site
  today (this Settings page); confirm that's still true before removing its old
  className-less usage, so nothing else breaks.

## Testing

- `/profile/settings`: the card now shows four rows — Subscription & access, Account
  settings, Contact us, Sign Out — each separated by the same hairline divider, same
  padding/hover treatment. Sign Out is visually the LAST row in the card, still in its
  clay/danger tone, still with no chevron.
- No separate Sign Out block/card remains below the Privacy/Terms links.
- Clicking Sign Out still works exactly as before in every mode: `api` mode logs out
  and redirects to `/signin`; mock mode routes to `/signin` with no session to end;
  staging demo mode still shows the inert "Demo mode" row (now styled to match the
  card) instead of a real sign-out.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean (watch for the now-unused
  `SignOutButton` import removal in `page.tsx`).

## Report

Confirm `SignOutButton`'s two branches (real sign-out + demo-mode inert row) both now
take and apply `className`, confirm no chevron was added to it, and confirm the old
standalone block in `page.tsx` was removed (not left as dead/duplicate markup). No git
commit or push unless asked.
