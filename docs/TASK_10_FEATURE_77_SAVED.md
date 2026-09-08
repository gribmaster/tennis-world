# TASK 10 / FEATURE 77 — Saved screen redesign

**Model: Opus 5, reasoning effort: high.**

Task:
Rebuild `/saved` to the v2 prototype. Presentation only — no new model, endpoint or
capability.

Context:
- Read `CLAUDE.md` first — §4 (pending/loading) and §5 (navigation). Then
  `docs/FEATURE_71_DESIGN_V2_INTAKE.md` §2.6 and §8, and
  `docs/FEATURE_19_SAVED_PAGE_LAYOUT.md` for what the screen was built to do.
- Prototype: `SavedScreen`. Strip the base64 first — recipe in
  `docs/TASK_07_FEATURE_74_HOME.md`.
- `/saved` is PRIVATE. `app/saved/page.tsx` uses `getRepositoriesForRequest()` +
  `loadOrSignIn`, so a logged-out visitor is redirected to `/signin?redirectTo=/saved`.
  **Preserve that exactly** — it is auth behavior, not layout.

## TWO DECISIONS ALREADY MADE — do not re-open

1. **Three tabs, not two.** The prototype shows Courts and Collections; the real screen also
   has **Wishlist Map**, and it stays (intake §8 Q2, decided). Restyle the tab control to the
   prototype's chip language and make it hold three.

2. **The Collections tab shows the user's OWN collections** — `UserCollectionDTO` from
   `getSavedCollections()`, the folders a user creates and fills with courts. It does NOT
   show bookmarked editorial collections; that capability does not exist in this product and
   is not being built (decided). The prototype drew editorial podborki here; the card
   treatment carries over, the meaning does not. Put a comment on the grid saying so, or the
   next reader will "fix" it toward the prototype.

## The collection card has no cover image field — handle it

`UserCollectionDTO` is `{ id, name, count, slug, coverImageUrls?: string[] }`. There is no
single cover image; `coverImageUrls` is a handful of member courts' hero images, and it is
**optional and can be empty** — a freshly created folder has no courts yet.

So the card's image comes from that array, and the empty case must be designed, not crashed
into: a new folder with zero courts must render as a deliberate empty-state card (its name,
"0 courts", and a treatment that reads as intentional), never a broken image, a stretched
1px placeholder, or a blank box. Say what you chose.

## Requirements

Take every number from the stripped prototype. Existing tokens and `globals.css` primitives
only — no new palette, type scale or button system.

1. **Header.** The serif "Saved" display heading, the subtitle line, and the "N saved" count
   for the active tab.

2. **The sort control.** The prototype shows "Recently added ↓" on the Courts tab with no
   behavior behind it. Either make it real — a client-side sort over the already-fetched
   array, using an ordering key that actually exists (check whether the saved reads expose a
   created/added timestamp before promising "recently added"; if they do not, offer an
   ordering you CAN honour, such as name) — or omit it. **Do not render an inert control**
   (`docs/PHASE_1_PLACEHOLDER_CTA_AUDIT.md` exists for exactly this). Report the choice.

3. **Courts tab.** Full-bleed image cards at the prototype's height, with the bottom
   gradient, the surface chip top-left, the unsave control top-right, and the name, location
   and tag chips over the image.
   - Whole card navigates ⇒ `PendingCardLink`.
   - The unsave control is a real mutation nested in a card region. `SavedCourtsGrid` already
     implements exactly this as a **sibling overlay button** with the §4 triad — reuse or
     follow it rather than inventing a third variant, and keep it a sibling so a click on it
     can never be a click on the card's anchor.
   - Removing the last saved court must land on a real empty state, not an empty grid.
     `SavedEmptyState` already exists — restyle it, do not duplicate it.

4. **Collections tab.** The prototype's two-column grid: image, the "N COURTS" pill, the
   serif name, and the corner control. Whole card navigates to
   `/saved/collections/{slug}` ⇒ `PendingCardLink`.
   The corner control in the prototype is an unsave heart. For a user's OWN folder that is
   wrong — the destructive action on a folder is delete, which is a different, heavier
   action. Either wire it to a real capability the repository already exposes, or omit it.
   Report which, and do not render it inert.

5. **"Dream List" CTA card.** The prototype's promo card at the end of the Courts tab, with
   the tilted image pair. Its button navigates to `/collections` ⇒ `PendingLink`.

6. **Wishlist Map tab.** Restyle its chrome to match the new tabs, but leave its behavior and
   its map rendering ALONE. The map surface is blocked on the Leaflet → Google Maps
   migration and is not this feature's business.

7. **Pending primitives.** Cards and rows navigate ⇒ `PendingCardLink` / `PendingLink`
   (§4 rules 1, 9). The unsave control is an async mutation ⇒ the §4 triad, with optimistic
   state rolled back on failure and `pending` cleared in an unconditional `.finally()`
   (§4 rule 7). Tab switching is purely local UI ⇒ no pending primitive, no spinner
   (§4 rule 10). Element dimensions must not change while pending (§4 rule 5).

8. **`/saved` is a top-level nav route** — no Back button (§5).

Do not change:
- The Prisma schema, migrations, seed, anything under `apps/api/**` or
  `packages/contracts/**`. No new model, no new endpoint, no new repository method. If the
  screen seems to need one, that is a signal to omit the control, not to build it.
- The auth flow on this page: `getRepositoriesForRequest()`, `loadOrSignIn`, the
  `redirectTo` target. Untouched.
- `apps/web/src/components/filters/**`, `features/map/**`, `features/home/**`,
  `features/collections/**`.
- `AppShell`, `AppHeader`, `BottomNavigation`, `nav-items.ts` — the tab bar is Feature 84.
- No package installs. No git commit or push.

Testing:
- `pnpm --filter @tennis/web typecheck`, `build`, `pnpm lint`.
- `pnpm --filter @tennis/web verify:ux-pending-states` — 90 checks. This screen has both
  navigation and a mutation in the same card; it is the one most likely to trip the harness.
- `pnpm --filter @tennis/web verify:saved-court-toggle` — the unsave path.
- `pnpm --filter @tennis/web verify:persisted-saved-flow` and `verify:user-saved-http` — these
  cover the saved reads/writes end to end; run them since this screen is their UI.
- `pnpm verify:api-parity` — should still be 42/42. You are not touching the API.
- Manual at 390px: all three tabs; unsaving a court without navigating; unsaving the last
  court reaching the empty state; a collection with zero courts rendering deliberately; the
  Dream List CTA reaching `/collections`.

Report back:
1. What you did with the sort control, and the ordering key you used if you kept it.
2. What you did with the collection card's corner control, and why.
3. The zero-court collection card treatment.
4. Whether you reused `SavedCourtsGrid`'s unsave button and `SavedEmptyState`, or replaced
   them, and why.
5. Every pending primitive used, and which controls you judged purely local.
6. Files changed, and pass/fail counts for all six checks.
