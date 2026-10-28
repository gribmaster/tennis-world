# TASK 63 — Redesign v3 close-out: stale docs, dead code, legal-copy facts, full verify run, responsive QA

**Model: Sonnet 5, reasoning effort: medium.** No new feature and no redesign. TASK_55–62 changed a lot of code in a short time and each was only verified on its own. This task checks that the whole holds together, removes what the redesign left behind, and fixes what is plainly wrong. Where something needs a product or design decision, **report it, don't decide it**.

Read `docs/REDESIGN_V3_PLAN.md` and CLAUDE.md §9 (scope discipline) first. All of TASK_55–62 is committed (`git log` shows nine commits after `2c9fbb6`), so the working tree should start clean.

## Rules for this task

- Touch only what a section below names, or a clear-cut defect found by the QA in §5 inside code that TASK_55–62 wrote or changed. No unrelated refactors, renames, reformatting or visual tweaks (CLAUDE.md §9).
- A defect that needs a design or product choice goes in the report's "Needs a decision" list, not into the code.
- Never accept a skipped harness as a pass (CLAUDE.md §2).
- Do not run `pnpm build` while `pnpm dev` is running; it corrupts `apps/web/.next` (`docs/DESIGN_V2_COMPLETION_SUMMARY.md` §10). Stop dev, wipe `.next`, then build.
- No git commit or push unless asked.

## 1. CLAUDE.md accuracy sweep

CLAUDE.md's own preamble says: when a rule and the code disagree, trust the code and update the file in the same change. TASK_55 removed the bottom tab bar, but §5 still tells readers the opposite.

**Known wrong (fix):** §5's `nav-items.ts` bullet (around lines 283–288) says mobile `TAB_NAV` is five tabs and desktop `PRIMARY_NAV` is four (Home · Map · Collections · Journal), and tells readers not to "restore" Journal to `TAB_NAV`. Neither is true now: `nav-items.ts` exports one `PRIMARY_NAV` of four items (Atlas `/` · Courts `/map` · Collections `/collections` · Profile `/profile`), used by the single floating pill at every width. Saved is not in the nav and lights the Profile item (as do `/signin`, `/signup`, `/verify`); Courts also lights for `/courts/*`. Journal is not in the nav and stays reachable from the Footer. Rewrite the bullet to say exactly that, and keep it a rule ("do not add a second nav or a bottom tab bar; AppShell mounts the one pill"). Also fix the §5 list of top-level pages that must not get a Back button so it matches the four nav routes plus the pages that are still top-level but not in the nav (`/saved`, `/journal`).

**Then check the rest of the file against the code, section by section**, and correct only what is false:
- §1 structure and module lists (features, components, `domain`, `lib`).
- §2 command list and the harness inventory. Every `verify:*` named must exist in a `package.json`, and every check count quoted (`91 checks`, `31 checks`) must match the current harness output.
- §4 primitive table and the "Real usage from the current code" snippets. Each cited file and snippet must still exist and look like that.
- §5 fallbacks. Each entry must match its `BackButton` call (court detail ×2, collection detail ×2, user folder, article, billing return, settings ×2).
- §6/§7 (auth, billing): in particular that §6 mentions the auth pages render the pill nav at md+ only and carry no Apple control (TASK_62 added a line; confirm it is there and accurate).

Report each correction as one line (old claim → new claim). If a rule is out of date but you can't tell what the new truth should be, list it under "Needs a decision" instead of guessing.

## 2. Dead code and stale references left by the redesign

### 2a. Unused files: verify, then delete

Candidates (from a first scan; **each must be proven unused before deleting**):

| File | Why suspect |
|---|---|
| `features/court-detail/CourtDetailFramedGallery.tsx` | "NO LONGER RENDERED (Feature 79)", only its own barrel re-exports it; TASK_59 said delete if nothing imports it |
| `features/court-detail/CourtDetailCtaPanel.tsx` | same note |
| `components/ui/SectionHeader` | `CollectionCourtsGrid` was its last user (TASK_60); the barrel may be the only reference left |
| `components/court/CourtMeta.tsx` | barrel only |
| `domain/saved/saved.types.ts`, `domain/user/user.types.ts`, `lib/verify-repositories.ts` | not imported by path anywhere; **probably** reached through type-only or barrel imports the scan missed, so these are the least likely to be dead, so don't delete without a typecheck-proven reason |

Procedure for each: search for real importers (an `import`/`export … from` of that module, not a comment, not the barrel's own re-export). Also check `apps/web/scripts/*.ts`; harnesses `readSrc(…)` some component files by path, and deleting one makes the harness throw (`CourtImage` is read by `verify:map-autofocus`). Delete only when there are zero importers and no harness reads it; remove its barrel export and the "NO LONGER RENDERED" comment with it. If any doubt, keep the file and list it. After deleting, `pnpm typecheck` and `pnpm lint` must stay clean.

`features/map/index.ts` and `MapCourtGrid.tsx` mention `LegacyCourtCard`, but no such file or export exists any more. Confirm that, and reword those two comments if they read as if it still does.

### 2b. Comments that point at files that no longer exist

Only fix comments that send a reader to a deleted file **as though it were live**, for example "mirroring `HomeCourtSaveHeart.tsx` line-for-line" (`CollectionSaveHeart.tsx`), "the same rule `HomeCourtSaveHeart` follows" (`CourtSaveButton.tsx`), "MapFilterBar's identical three controls" (`MapSearchBar.tsx`), `HomeFeaturedCourts` (`PremiumBadge.tsx`), and `CourtCardSaveButton.tsx`'s mention of `UserCollectionCourtSaveHeart`. Reword to the present (the component that exists now, or "formerly X"). Leave dated history notes ("Task 42 …", "superseded in TASK_56") alone. Do this with a grep of the deleted names; don't re-read every file.

## 3. Legal copy: correct only what is factually wrong today

`features/static-pages/legal-content.ts` is self-labelled placeholder copy pending counsel review. Leave it labelled that way, leave structure and tone alone, and change **only claims that are false for the product as it exists today**:

1. Line ~50: "…when you create an account or sign in via **Apple, Google,** or magic link" → remove "Apple," (TASK_62 removed the control; the API has no Apple sign-in).
2. Line ~53: "…processed by our payment provider (e.g. **RevenueCat/App Store/Play Store**)…" → "(Stripe)". Billing is Stripe-only (CLAUDE.md §7); `DESIGN_V2_COMPLETION_SUMMARY.md` §10/§11 item 6 already lists this as wrong.
3. Read the rest of the file once for any other claim about a thing that does not exist (an app-store purchase flow, an Apple sign-in, a payment processor we don't use). The refund paragraph (~line 142) names the App Store / Google Play *and* "our website payment provider"; that is a forward-looking superset, not false, so leave it and mention it in the report.

Report the exact before/after of every edit so it can go to counsel. Add one line to `docs/DESIGN_V2_COMPLETION_SUMMARY.md` §10 and tick §11 item 6 as done.

## 4. Run the whole verification suite against a real API

Previous tasks could only run the source-reading harnesses. Everything that needs an API and a database has been skipped since TASK_55. Run it now.

1. `pnpm db:up` → `pnpm --filter @tennis/api prisma:generate` → `prisma:migrate:deploy` → `db:seed` → start the API (`pnpm --filter @tennis/api dev`, `http://127.0.0.1:18001/v1`). Use the local Postgres only (CLAUDE.md §8: never `db push` / `migrate reset` against staging or production).
2. Mint tokens the way `apps/api/scripts/ci-issue-token.ts` / `verify-exact-location.ts` do, through the real `POST /v1/auth/verify` path: `AUTH_BEARER_TOKEN`, `FREE_BEARER_TOKEN`, and `ENTITLED_BEARER_TOKEN` (with an active `Entitlement` row). **Supplying only some of them silently skips the authed half** (CLAUDE.md §2). Clean up the fixtures after (`ci:clean-auth-fixtures`).
3. Run, from the repo root: `pnpm verify:api-parity`, `pnpm verify:api-auth`, and from `apps/web`: `verify:saved-court-toggle`, `verify:web-exact-location`, `verify:web-billing`, `verify:web-profile`, `verify:persisted-saved-flow`, `verify:user-saved-http`, then `verify:ux-pending-states` and `verify:map-autofocus`. From `apps/api`: `verify:effective-entitlement`, `verify:exact-location`, `verify:billing-checkout`, `verify:billing-rate-limit`, `verify:stripe-webhook`. Start the second, feature-enabled API instance for `verify:staging-demo-auth` and `verify:google-oauth` as `docs/DESIGN_V2_COMPLETION_SUMMARY.md` §7.1 describes. `verify:stripe-e2e` and the real-Stripe checks stay opt-in: skip them and say so.
4. For each failure, decide whether TASK_55–62 caused it. A v3-caused failure with a small, obvious fix (a harness asserting an old class name or file, a changed fallback) → fix it and say what. Anything else → report it with the evidence and **don't change behaviour to make a harness pass**. The 4 known `verify:map-autofocus` failures (MarkerClusterer / zoom-target) are expected; don't touch them.

Report a table: harness · result (N/M) · skipped checks and why.

## 5. Responsive QA of every route

Start `pnpm dev` (web on `http://127.0.0.1:18000`, API on 18001, `NEXT_PUBLIC_DATA_SOURCE=api` so the real masking/entitlement paths are exercised). If the window-resize tool doesn't work in your environment, use an in-page iframe sized to each width (TASK_62 did) and say so.

**Viewer states:** guest · signed-in free · entitled (use the tokens/sessions from §4).
**Widths:** 360 · 390 · 820 · 1280.
**Routes:** `/` · `/map` (and the expanded map modal, the filter sheet) · `/courts/<free slug>` · `/courts/<premium slug>` (and the lightbox, review modal, paywall modal) · `/collections` · `/collections/<slug>` (one with premium courts, one all-free) · `/saved` (all three tabs) · `/saved/collections/<slug>` (empty and non-empty) · `/profile` · `/profile/settings` (and the Edit profile modal) · `/signin` · `/signup` · `/verify` (no token) · `/billing/return?status=cancelled` · and the pages v3 never redesigned: `/about` · `/journal` · `/journal/<slug>` · `/privacy` · `/terms` · the consultation modal.

For each route × state × width check:
1. **No page-level horizontal scroll:** `document.documentElement.scrollWidth <= window.innerWidth`.
2. **Nothing hidden under the floating pill nav** (the fixed pill must not cover a heading, back link or first card), and nothing hidden behind a floating glass action bar (court detail, collection detail) when scrolled to the bottom.
3. **No console errors or hydration warnings**, and no failed image requests (404/400 from `next/image`).
4. **One `<h1>`**, no `<button>` inside `<a>`, no nested interactive elements.
5. Redesigned pages: spot-check against the relevant `TASK_5x/6x` "Testing" section. Don't redo all of it, but look for regressions caused by a *later* task (for example TASK_60 changing `CollectionSaveHeart` or `CollectionCard` and affecting the Saved tab or Home).
6. The pages v3 didn't redesign (about, journal, article, privacy, terms, Footer): they still render inside the new `AppShell`. Confirm the top offset under the pill nav is right and that no leftover bottom padding made for the removed tab bar remains. Fix **only** clear defects there (overlap, overflow, missing offset). Don't restyle them; list anything that merely looks dated under "Needs a decision".
7. The mobile bottom sheet on `/map` (`MapCourtPreview`, `fixed inset-x-0 bottom-0`) against the pill nav and the Footer; one line on how it behaves is enough.

Record defects as: route · state · width · what · fixed / needs-decision. Fix the clear-cut ones in the files that own them; for each fix, name the task whose work it corrects.

## 6. Open product items to list, not to decide

Produce a short list of the editorial and product questions that surfaced during v3 so the owner can pick them up. Facts only, no recommendations:

- **Scale copy.** Occurrences of "120+", "50 countries", "1,000 courts" and similar in `paywall-copy.ts` (both copies), `HomeMembership.tsx`, `AboutPage.tsx`, `CourtDetailCtaPanel.tsx`, `SITE_STATS`: file, line, exact text, and what the database actually contains (`countries.list().length`, number of published courts). TASK_62 deliberately avoided printing numbers; this list is the evidence for that editorial call (`DESIGN_V2_COMPLETION_SUMMARY.md` §11 item 5).
- **Inert controls still in the app** after v3: Google button in `mock` mode, anything else the harness `PHASE_1_PLACEHOLDER_CTA_AUDIT.md` lists that is still inert. Re-run that audit's grep on the current code and state whether each row is still true.
- Anything from §1–§5 you parked under "Needs a decision".

## Do not touch

Billing/Stripe/webhook code, auth endpoints and flows, Prisma schema and migrations, the API, contracts, the map provider code (`CourtMap`, `CourtMapInner`), `FilterSheet` internals, and the visual design of any screen. If §5 suggests a redesign, it goes in the report, not the diff.

## Checks

`pnpm typecheck`, `pnpm lint`, `pnpm build` (with dev stopped), plus the §4 table. Final state: clean typecheck/lint/build, `verify:ux-pending-states` 91/91 (or its current total), `verify:map-autofocus` with only the 4 known failures.

## Report

1. CLAUDE.md corrections, one line each.
2. Files deleted (with the evidence of zero importers) and files kept despite being suspect.
3. Legal-copy edits, exact before/after.
4. The §4 verification table.
5. The §5 defect list (fixed / needs-decision) with the widths and states that were actually tested, and which method was used for resizing.
6. The §6 list.
7. Files changed, and the exact commands run. No git commit or push unless asked.
