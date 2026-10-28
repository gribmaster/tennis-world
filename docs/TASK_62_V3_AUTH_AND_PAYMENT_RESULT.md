# TASK 62 — Redesign v3: Sign-in / Sign-up / Verify + Billing result (`/billing/return`)

**Model: Sonnet 5, reasoning effort: medium.** The last v3 task. Two small restyles, one deliberate removal (the inert Apple button), and one change to the layout shell of the auth pages. There is no new data, no new route and no change to any auth or billing behaviour.

Read `docs/REDESIGN_V3_PLAN.md` first. TASK_55–61 are done and assumed. This task also closes the sequence: when it is done, update the plan's task list.

## Goal

- **Auth (`/signin`, `/signup`, `/verify`):** the v3 `AuthGateScreen`. Same content and flow as today (the v3 gate is ours almost word for word), with v3's field and button shapes, type sizes and spacing. Desktop gets the pill nav above it; mobile keeps the standalone chrome.
- **Billing result (`/billing/return`):** the v3 `PurchaseSuccessScreen` / `PurchaseFailedScreen`. `BillingReturn` already has most of v3 (it was ported from the v2 prototype). This task brings its desktop layout, type scale and actions up to v3.

Reference (read the named functions; ignore the demo scaffolding and the scripted "payment fails first, then retry succeeds" flow, plan §Reference files):

- desktop: `new design/redesign v3/tennis_world_desktop_standalone4.html`: `AuthGateScreen` (~502), `PurchaseSuccessScreen` (~957), `PurchaseFailedScreen` (~983);
- mobile: `tennis_world_v17_standalone.html`: `AuthGateScreen` (~865), `PurchaseSuccessScreen` (~1403), `PurchaseFailedScreen` (~1453).

## Decisions already made (do not re-litigate)

1. **Remove the inert "Continue with Apple" button** from `SignInForm` and `SignUpForm`. There is no Apple sign-in on the API (CLAUDE.md §6 lists magic link and Google only). `docs/DESIGN_V2_COMPLETION_SUMMARY.md` §7 item 7 already asked to "implement it or make its inert state visible". A dead button on the screen where people sign in is worse than none. Google and magic link stay exactly as they behave today (Google is a real navigation in `api` mode; in `mock` mode it stays the inert dev placeholder). Both `docs/PHASE_1_PLACEHOLDER_CTA_AUDIT.md` (the "Continue with Apple" row, ~line 20, and the inert-controls note, ~line 229) and `docs/DESIGN_V2_COMPLETION_SUMMARY.md` §7 (item 7) list Apple as an open item: add one line to each saying it was removed in TASK_62. Leave the Google rows as they are. `AppleIcon` becomes unused: delete it from `AuthIcons.tsx` and from the `features/auth/index.ts` re-export (today only `SignInForm` and `SignUpForm` import it).
2. **No guest/auth logic changes.** Magic link stays the primary flow, Google stays additive, `redirectTo` handling, the "sent" state, the `/verify` states and `safeRelative` are untouched (CLAUDE.md §6). This is a visual task.
3. **The failed-payment screen is our "Checkout cancelled" state.** A real card failure happens on Stripe's hosted page, not in our app. The only failure-like place that comes back to us is `?status=cancelled`. So v3's "Payment unsuccessful / Something went wrong with your payment" is **not ported**: that text would be false for a visitor who simply pressed back. Keep `Checkout cancelled` and its "No payment was taken…" copy and the three reassurance rows (they are already v3's wording). v3's layout and actions are ported.
4. **No invented numbers.** v3's success screen prints "120+ Countries · 1800+ Courts". Our data says something else (`SITE_STATS`). Use the three qualitative cells instead (see §2).
5. **`/billing/return` keeps `AppShell` and its nav pill, and its `BackButton` to `/profile`.** v3 shows the result screens without a nav only because they are standalone prototype frames. CLAUDE.md §5/§7 and `verify:ux-pending-states` pin the Back fallback.
6. **No paywall-modal redesign.** v3 has no paywall screen (the prototype fakes checkout). `PaywallModal` is untouched.
7. **Background stays `bg-bone`.** The v3 desktop auth/result screens are ivory, same reasoning as TASK_60/61.

## 1. Auth pages (`features/auth`)

### `AuthLayout` and `AuthTopBar`

- Wrap the layout in `NavigationPendingProvider` (the auth pages are not inside `AppShell`, so this is the only provider on the page; CLAUDE.md §4 forbids a second one only when `AppShell` already mounts one).
- md+: render `<AppHeader signedIn={false} />` at the top. Mobile: no pill nav. Put the header in a `hidden md:block` wrapper (a `display:none` ancestor hides the `fixed` pill too) and render `AuthTopBar` as `md:hidden`. `nav-items.ts` already lights the Profile item for `/signin`, `/signup` and `/verify`.
- `AuthTopBar` to v3 mobile: `px-6 pt-[22px]`, wordmark serif **15px**, `tracking-wordmark`, uppercase; "Continue exploring" **10px / 600**, `tracking-[0.08em]`, uppercase, stone. Same two links as today.
- Content column: mobile `px-7 pt-11`; md+ `pt-[calc(var(--nav-offset)+40px)]` and **top-aligned**, not vertically centred (v3 starts about 64px below the nav). Measure it in the browser and say what you used. Column `w-full max-w-[380px]` (was 400). Bottom padding ≈ 80px on desktop, ≈ 48px on mobile.
- Legal line: 10px, `text-mist`, centred, `mt-10` (desktop) / pinned to the bottom with `pb-6` (mobile); the links keep underline and go to `/terms` and `/privacy`.

### `SignInForm` / `SignUpForm` (identical styling; only the copy differs)

Keep all logic, copy and the `fade-in`. Restyle to v3:

| Element | Spec |
|---|---|
| Eyebrow ("Welcome back" / "Join Tennis World") | 11px / 600, `tracking-[0.14em]`, uppercase, stone, `mb-2.5` |
| `<h1>` | serif, weight 400, `leading-[1.15]`, **28px**, `md:text-[32px]` (replaces `display-l`) |
| Subtitle | 13px, `leading-[1.5]`, stone, `mt-2.5`; on mobile `mx-auto max-w-[260px]` |
| Google button | `mt-7`, `h-12 w-full justify-center gap-2 rounded-md border border-ink/50 bg-transparent`, 12px / 600, `tracking-[0.06em]`, uppercase, ink; icon 15px. Keep the real `<a href=buildGoogleSignInUrl(...)>` in `api` mode |
| "or" divider | `my-[22px]`; rules `bg-mist/40`; "OR" 10px, `tracking-[0.1em]`, stone |
| Field label | 10px / 600, `tracking-[0.08em]`, uppercase, stone |
| Field | `mt-1.5 flex h-12 items-center gap-2 rounded-md border border-mist/40 bg-paper px-3.5`, input 14px, mail icon 14px stone. SignUp's name field gets the same box with `mb-4` |
| Submit | keep `btn btn-primary` and its spinner/disabled/`aria-busy` triad; add `mt-3.5 w-full justify-center rounded-pill !h-[50px]`; 12px, `tracking-[0.1em]` (label unchanged: "Send Magic Link" + arrow) |
| Helper line | 11px stone, `mt-2.5`, centred |
| "New to…" block | `mt-6 border-t border-mist/30 pt-6`, text 13px stone, link ink + underline |
| Error | unchanged (`role="alert"`, clay) |

The "sent" state ("Check your inbox" / "Confirm your email") and every `VerifyMagicLink` state keep their copy and structure. Only swap their `display-m` headings for the same serif 28 / `md:32` heading class so the whole flow reads as one, and keep the ink mail circle. Update the `/verify` page's Suspense fallback the same way.

## 2. Billing result (`features/billing/BillingReturn.tsx`, `app/billing/return/page.tsx`)

**Read CLAUDE.md §7 on `BillingReturn` before touching the file.** All six states must still reach the screen through a post-mount `setState`, including `cancelled` (the initial state stays `'checking'` and the effect commits `'cancelled'`). Do not initialise `useState` to a final state. Do not change the poll (6 × 2s), the effect, `runPoll`, the state names or the success redirect behaviour. Only markup, classes and the new actions below change.

### Layout (`ReturnHero`, `ReturnShell`)

- Column: `max-w-[560px] md:max-w-[520px]` for `success`/processing, `md:max-w-[480px]` for the `neutral` tone.
- Hero image: keep on mobile exactly as it is; **`md:hidden`** (v3 desktop has no image). The `-mt-5` overlap moves with it (`md:mt-0`).
- Circle: 56px mobile, `md:h-[60px] md:w-[60px]`, `mb-5 md:mb-[22px]`, glyph 24 (`md:` 26).
- Eyebrow ("WELCOME TO" and the others): 11px / 600, `tracking-[0.12em]`, uppercase, gold.
- Title: success `serif text-[44px] font-light leading-[1.05] md:text-[48px]`; neutral `text-[32px] font-light md:text-[34px]` (replaces `display-l`).
- Body copy: first line 15px graphite (`mt-3`), second 13px stone `leading-[1.6]` (`mt-2`); keep the existing `max-w-[280px]` on mobile and drop it at md+.
- The back control (`BackButton … label="Profile"`) stays at the top of both components, unchanged.

### Success: the "what you've unlocked" row

Add under the body copy (success only; **not** for `processing`): `my-6 flex justify-center gap-6 md:my-8 md:gap-8`, three centred cells:

| Icon (gold, 22px, hidden at md+) | Top line | Caption |
|---|---|---|
| `MapGlyph` | Complete | Atlas |
| pin glyph (small inline SVG, like the others in this file) | Exact | Locations |
| `CollectGlyph` | Curated | Collections |

Top line 18px ink (`md:text-[20px] md:font-semibold`), caption 10px (`md:text-[11px]`) stone. Import the two glyphs from `@/features/saved/saved-glyphs` (TASK_61), the module only, not the `@/features/saved` barrel. No numbers anywhere.

Actions are as today (Explore the map / Saved courts / Go to profile). Match v3: primary full width `mb-3 md:mb-3.5`, the two secondaries `flex-1`, 11px on mobile.

### Cancelled: v3's failed-screen actions, with our copy

Keep the title, body, and reassurance card. The actions become v3's trio:

1. **Try again**: `btn btn-primary w-full justify-center`, opens the existing paywall (`PaywallTrigger source="billing-return"`), so the visitor picks a plan again through the real checkout.
2. **Back to your profile**: `btn btn-secondary w-full justify-center`, the existing `PendingLink` to `/profile` (v3's "Go back").
3. A text line, 12px stone: `Need help? ` + **Contact support →** in clay, 500 weight, opening the existing consultation modal (`ConsultationTrigger source="billing-return"`, as `SettingsMenuCard` uses it).

**Avoid an import cycle.** `features/paywall` already imports `features/billing`, so `BillingReturn` must not import `PaywallTrigger` or `ConsultationTrigger` itself. Build both elements in the **server** page (`app/billing/return/page.tsx`) and pass them in as props: `<BillingReturn tryAgain={<PaywallTrigger … />} support={<ConsultationTrigger … />} />`, both typed `ReactNode` and optional (the cancelled state renders them only when given). The page stays a server component. The classes for the two triggers belong to the page; the cancelled state composes them.

Reassurance rows: unchanged copy. Card `rounded-lg md:rounded-[12px]`, rows `text-[12px] md:text-[13px]`.

### Other states

`processing`, `signed-out`, `error` and `checking`: no copy or logic change. They inherit the new type scale and column widths from the shared components; check that none of them looks broken.

## Do not touch

`PaywallModal` / `PaywallCheckoutButton` / `use-billing-action`, `ManageBillingButton`, `CheckoutStatusBanner` (Profile, TASK_61), `auth-client.ts` and every auth endpoint, the Google OAuth wiring, `SignOutButton`, `AppShell` / `AppHeader` / nav, Footer, the API, Stripe, Prisma. No new env, no new package.

## Docs

- `docs/REDESIGN_V3_PLAN.md`: mark TASK_55–62 as done in the task sequence.
- CLAUDE.md: no §5 change (the Billing return fallback is unchanged). Add one line under §6 noting that the auth pages render the pill nav at md+ only, via `AuthLayout`, and carry no Apple control.
- Refresh the header comments of every file you restyle (several describe v1/v2 geometry and "Apple stays an inert placeholder").

## Testing

Check on **desktop (1280+)**, **tablet (820)** and **mobile (390 and 360)**.

**Auth**
- Mobile: standalone top bar, no pill nav; content 28px gutters; no horizontal scroll at 360. Desktop: pill nav (Profile lit), form top-aligned about where v3 puts it, 380px column.
- `/signin` and `/signup`: no Apple button anywhere. Google (API mode) navigates to the OAuth start route; magic link sends and shows "Check your inbox" / "Confirm your email"; "Use a different email" works; an invalid email shows the error. `?redirectTo=` still survives both flows.
- `/verify`: all four states (verifying, success, error, no-token) read in the same type; the Suspense fallback matches.
- No `<button>` inside `<a>`; the pending spinner still shows on the submit button only.

**Billing result**
- **Cancelled, in a production build** (`pnpm build` then `next start`, not dev): `/billing/return?status=cancelled` renders the real markup, not the "Confirming your membership…" fallback (this is the CLAUDE.md §7 regression to guard). Check: no hero image on desktop, 60px circle, 34px title, reassurance card, `Try again` opens the paywall, `Back to your profile` navigates, `Contact support →` opens the consultation modal.
- Success, processing, signed-out and error need a live session/API (Stripe test mode). If you can't run them, read the code paths and say so. Do **not** fake them by changing the initial state.
- Mobile: the hero image is as before; the three-cell row fits at 360 without wrapping.

**Checks:** `pnpm typecheck`, `pnpm lint`, `pnpm build`, `verify:ux-pending-states` (the Billing return `BackButton` assertion must pass), `verify:map-autofocus` (the 4 known failures stay). If an API is up: `verify:web-billing`, `verify:staging-demo-auth`, `verify:google-oauth` (against the second API instance, per CLAUDE.md §2).

## Report

Files created / changed / deleted. Confirm: no Apple control remains and `AppleIcon` is gone or still used elsewhere (say which); `BillingReturn`'s state init and effect are untouched; the cancelled state was checked in a production build; no new import between `features/billing` and `features/paywall` / `features/consultation`; no number appears on the success screen. Say what top offset you used for the desktop auth column, how the three result cells look at 360, and what you could only verify by reading code. No git commit or push unless asked.
