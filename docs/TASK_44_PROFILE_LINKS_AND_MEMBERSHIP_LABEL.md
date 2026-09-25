# TASK 44 — Profile page: fix Collections/Countries links, drop the active-membership eyebrow label

**Model: Sonnet 5, reasoning effort: medium.**

Three independent fixes on `/profile`. Treat them as separate changes.

## Decisions already made (don't re-litigate these)

- **"Collections" keeps counting the user's OWN wishlist folders** (`getSavedCollections()`,
  `UserCollectionDTO[]`) — the number itself is UNCHANGED. Only its LINK is wrong today
  (it points at `/collections`, the public editorial-collections catalog, which has
  nothing to do with the count shown). Fix the link only.
- **The "My collections" card strip lower on the page stays `SavedCollectionRow` as-is**
  — it already IS "the card from Saved" (the exact card the Saved page's Collections tab
  uses for the user's own folders), so there is nothing to change there. Do not touch
  `ProfileCollectionsStrip.tsx`.

## 1. `/saved` needs URL-based tab deep-linking (new capability, needed by §2)

Today `SavedTabs.tsx` always opens on the Courts tab
(`useState<TabId>('courts')`, hardcoded) — there is no way to link directly into the
Collections or Wishlist Map tab from outside the page. Add that:

### `apps/web/src/features/saved/SavedTabs.tsx`
- Export the `TabId` type (currently local/unexported at line ~106):
  `export type TabId = 'courts' | 'collections' | 'wishlist';`
- Add an optional prop `initialTab?: TabId` to `SavedTabsProps`.
- Seed the state from it: `useState<TabId>(initialTab ?? 'courts')`. Everything else
  about tab switching (still purely local UI, no navigation, no repository call) is
  unchanged.

### `apps/web/src/app/saved/page.tsx`
- Add `searchParams: Promise<{ tab?: string }>` to the page's props (Next 15: async,
  must be awaited — same pattern `app/profile/page.tsx` already uses for its own
  `?checkout=` param).
- Parse it into a validated `initialTab`: accept exactly `'courts' | 'collections' |
  'wishlist'`, anything else (missing, typo, unknown value) falls back to `'courts'`
  (today's default) rather than erroring.
- Pass `initialTab={initialTab}` to `<SavedTabs>`.

### `apps/web/src/features/saved/index.ts`
Export the `TabId` type alongside the existing `SavedTabs`/`SavedTabsProps` exports, so
`app/profile/page.tsx`... actually `app/saved/page.tsx` needs it for its own parsing
logic (or just inline the three string literals there without importing the type — either
is fine, prefer importing `TabId` from `@/features/saved` if that's not awkward).

## 2. `ProfileStats.tsx` — fix the Collections and Countries links

Current cells (`apps/web/src/features/profile/ProfileStats.tsx`):

```ts
{ value: savedCourtsCount, label: 'Saved Courts', href: '/saved', ariaLabel: 'View saved courts' },
{ value: collectionsCount, label: 'Collections', href: '/collections', ariaLabel: 'View collections' },
{ value: countriesCount, label: 'Countries', href: '/map', ariaLabel: 'View countries' },
```

Change the last two hrefs to deep-link into the Saved page's matching tab, using §1's
new capability:

```ts
{ value: savedCourtsCount, label: 'Saved Courts', href: '/saved', ariaLabel: 'View saved courts' },
{ value: collectionsCount, label: 'Collections', href: '/saved?tab=collections', ariaLabel: 'View collections' },
{ value: countriesCount, label: 'Countries', href: '/saved?tab=wishlist', ariaLabel: 'View countries' },
```

- **Collections** → lands on the Saved page's Collections tab, "Your Folders" section
  (the SAME `getSavedCollections()` data this stat counts — no more mismatch between
  what the number says and what the link opens).
- **Countries** → lands on the Wishlist Map tab, which plots this same visitor's saved
  courts (the courts `countriesCount` is itself derived from) on a real map, instead of
  the general `/map` browse-everything screen that has no relationship to "your saved
  countries" at all.
- **Saved Courts** stays `/saved` unchanged (already correct — the Saved page's default
  tab is Courts).

Update this file's own header comment, which currently says "There is no dedicated
'countries' route in the app, so Countries points at /map" — that reasoning is now
stale; replace it with a note that both cells deep-link into their matching Saved tab
via the `?tab=` param (§1).

## 3. `ProfileMembershipCard.tsx` — drop the active-membership status eyebrow

Current active-tier card (`membership !== 'free'` branch):

```tsx
<div>
  <div className="eyebrow text-gold">{ACTIVE_STATUS_LABEL[membership]}</div>
  <div className="body-m mt-1 text-bone/90">{ACTIVE_SUBHEAD[membership]}</div>
</div>
```

Remove the `ACTIVE_STATUS_LABEL` eyebrow line entirely — for BOTH values
(`'Active Subscriber'` for `subscription` and `'Lifetime Member'` for `lifetime`), not
just the subscription case. The user's reasoning ("not in the mobile design, there's
already a banner communicating this") is about the eyebrow-status-label concept on this
card generally, not the specific word "subscriber" — a card that still says "Lifetime
Member" here would be the same kind of redundant label left half-removed.

```tsx
<div>
  <div className="body-m text-bone/90">{ACTIVE_SUBHEAD[membership]}</div>
</div>
```

(Drop the `mt-1` on the subhead now that there's no eyebrow above it to space away
from — check visually and adjust if the card's vertical rhythm looks off without it.)

Remove the now-unused `ACTIVE_STATUS_LABEL` constant entirely (don't leave a dead
export/object behind) — confirm nothing else in the file or elsewhere imports it.

**Do NOT touch:**
- The `✦ Active` pill badge (the separate `border-gold`/`text-gold` chip on the right
  side of the card) — that's a distinct element the user did not ask to remove.
- The `Manage` link (`ManageBillingButton`) — unrelated.
- The free-tier ("Choose your membership.") branch of this same component — the user's
  point was specifically about the active/paying-member card, not the free-tier CTA
  card.
- `ACTIVE_SUBHEAD` — stays, only `ACTIVE_STATUS_LABEL` is removed.

## Do not touch

- `ProfileCollectionsStrip.tsx` / `SavedCollectionRow.tsx` — already correct per the
  decision above; no changes.
- `ProfileHeader.tsx`, `ProfileStatLink.tsx` (its own code — only the data it's called
  with changes, in `ProfileStats.tsx`), `EditProfileModal.tsx`, `SettingsMenuCard.tsx`,
  `SettingsAccountRow.tsx` — unrelated.
- `SavedCourtsGrid`, `SavedCollectionsGrid`, `SavedWishlistMap` — their own rendering is
  unchanged; only `SavedTabs`'s initial-tab seed changes (§1).
- `app/profile/page.tsx`'s stat-count derivation
  (`savedCourtsCount`/`collectionsCount`/`countriesCount`) — unchanged, only the hrefs
  those numbers are attached to move (§2).

## Testing

- On `/profile`: clicking "Collections" navigates to `/saved` and opens directly on the
  Collections tab (Your Folders section visible without an extra click); clicking
  "Countries" navigates to `/saved` and opens directly on the Wishlist Map tab; clicking
  "Saved Courts" still opens the Courts tab (default, unchanged).
- Navigating to `/saved` directly (no `?tab=`) still opens on the Courts tab, exactly as
  today. `/saved?tab=collections` and `/saved?tab=wishlist` open on the matching tab.
  `/saved?tab=nonsense` falls back to Courts, not a crash.
- Switching tabs by clicking the in-page tab chips still works exactly as before
  (purely local state, no URL sync needed in that direction — this task only makes the
  INITIAL tab controllable via the URL, it does not make the URL update as the user
  clicks between tabs).
- The active-membership card (subscription and lifetime, check both) no longer shows
  "Active Subscriber"/"Lifetime Member" as a separate eyebrow line above the subhead;
  the `✦ Active` pill and `Manage` link are still there, visually unaffected.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean.

## Report

Confirm `ACTIVE_STATUS_LABEL` was fully removed (not left as dead code), confirm both
active-membership variants (subscription AND lifetime) had their eyebrow removed, and
confirm `/saved?tab=...` correctly opens the matching tab for all three values plus an
invalid one. No git commit or push unless asked.
