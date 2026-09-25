# TASK 41 — Fix: free courts must not require membership on Court Detail

**Model: Sonnet 5, reasoning effort: medium.**

## Context / root cause (confirmed by reading the actual current code, not guessed)

Reported symptom: a logged-in test account with no paid membership sees **every**
court's detail page (`/courts/[slug]`) in the "locked" reading — masked name
("Unlock to reveal court name"), blurred description, hidden map — **even for courts
that are marked free** (`court.isLocked === false`).

Root cause, traced end to end:

- `app/courts/[slug]/page.tsx` derives the page's `locked` flag purely from whether
  `GET /v1/me/courts/:slug/exact-location` succeeds for the current viewer:
  `const locked = exactLocation === null;` — this part is correct and needs no change.
- That endpoint is backed by `ExactLocationService.getExactLocation()`
  (`apps/api/src/me/exact-location.service.ts`), which **currently 403s any
  non-entitled viewer for every court, regardless of that specific court's own
  `isLocked` flag** — the entitlement check runs unconditionally after the
  published-court lookup.
- This contradicts how `isLocked` is treated **everywhere else** in the app. On card
  components (`components/court/court-display.ts`'s `courtDisplay()`, used by Home,
  Map, Nearby-courts), the rule is `mask = court.isLocked && !viewerIsEntitled` — a
  free court (`isLocked=false`) is **never** masked, for anyone, entitled or not.
  Only premium courts are masked for a non-entitled viewer.
- Net effect today: a free court's card shows its real name — but clicking through
  lands on a detail page that treats it exactly like a premium court for any viewer
  without an active membership. The card promises one thing, the page shows another.
  This is the bug to fix.

## The fix — one place, the entitlement gate itself (not the page)

Fix it at the source of truth: make `ExactLocationService` only require entitlement
for courts where `isLocked === true`. A free court's real exact location/directions
link is returned unconditionally once the court is confirmed to exist and be
published — no entitlement check for it at all.

**Do not touch `app/courts/[slug]/page.tsx`.** Its existing derivation
(`locked = exactLocation === null`) is already correct — it just needs the endpoint
underneath it to behave correctly. Once the endpoint returns 200 for a free court
regardless of entitlement, `locked` naturally becomes `false` for that viewer, with
zero page-level changes. This keeps entitlement logic in the one place the codebase's
own comments insist it belongs (`EntitlementsService` / this gate), not duplicated
into the page.

### 1. `apps/api/src/courts/courts.mapper.ts`

Add `isLocked: true` to `courtExactLocationSelect`:

```ts
export const courtExactLocationSelect = {
  id: true,
  slug: true,
  status: true,
  isLocked: true,
  lat: true,
  lng: true,
  mapLinkUrl: true,
} satisfies Prisma.CourtSelect;
```

`CourtExactLocationRow`'s type updates automatically (it's derived from this select
via `Prisma.CourtGetPayload`) — no separate type edit needed.

**Do not add `isLocked` to `ExactLocationDTO` or `toExactLocationDTO`'s returned
object.** That function keeps returning exactly `{courtId, slug, lat, lng,
directionsUrl}`, unchanged. `isLocked` is read from the row inside the *service*
only (next step), never serialized onto the wire — the DTO's shape and the contract
schema (`packages/contracts/src/court.ts`, `ExactLocationSchema`) are untouched.

### 2. `apps/api/src/me/exact-location.service.ts`

Change the entitlement check to be conditional on the court's own `isLocked`:

```ts
async getExactLocation(
  userId: string,
  slug: string,
): Promise<ExactLocationDTO> {
  // 1. Court existence (public knowledge) — private exact select, published only.
  const court = await this.prisma.court.findFirst({
    where: { slug, status: PUBLISHED },
    select: courtExactLocationSelect,
  });
  if (!court) {
    throw new NotFoundException(`Court "${slug}" not found.`);
  }

  // 2. Entitlement gate — ONLY for premium content. A free court's exact location is
  //    not paywalled at all; `isLocked` (content classification) decides whether the
  //    gate even applies, matching the mask rule every card already uses
  //    (`court-display.ts`: `mask = court.isLocked && !viewerIsEntitled`). A real,
  //    LOCKED court for a non-entitled user is a 403 (NOT 404 — existence is already
  //    public).
  if (court.isLocked && !(await this.entitlements.isEntitled(userId))) {
    throw new ForbiddenException(
      'An active membership is required to view exact court coordinates.',
    );
  }

  // 3. Free court, or entitled viewer of a locked court → the only payload that
  //    carries exact lat/lng.
  return toExactLocationDTO(court);
}
```

Update this file's header comment block — it currently states the FAILURE SEMANTICS
as "real court, not entitled → 403" unconditionally (intake §4.5). Revise it to say
that 403 now only applies when the court itself is premium (`isLocked=true`); a free
court returns 200 for any authenticated viewer regardless of entitlement.

### 3. `apps/api/src/me/exact-location.controller.ts`

Its header comment restates the same failure semantics
("real court, not entitled → 403") — update it to match the corrected rule in step 2,
so the two comments don't drift out of sync. No code change needed in this file (the
controller itself doesn't branch on `isLocked`; only its comment is stale after this
fix).

## Do not touch

- `apps/web/src/app/courts/[slug]/page.tsx` — no change; see above, its existing
  `locked` derivation is already correct once the backend is fixed.
- `apps/web/src/domain/http/http-court.repository.ts`'s `getExactLocation` — its
  401/403 → `null` degrade logic is unaffected and still correct (it just gets called
  less often now, since a free court no longer 403s).
- `apps/web/src/components/court/court-display.ts` (card-level masking) — already
  implements the correct rule; this task brings the detail page in line with it, not
  the other way around.
- `apps/web/src/domain/courts/mock-court.repository.ts`'s `getExactLocation`
  (MOCK data-source mode) — stays returning `null` unconditionally, exactly as
  documented in its own file and in `page.tsx`'s header comment ("In MOCK mode there
  is no auth/entitlement seam, so locked courts stay locked"). This fix only applies
  to `api` data-source mode, matching where the entitlement system itself lives.
- `EntitlementsService` itself — untouched; this task only changes *when* it's
  consulted, not how it computes the answer.
- `courtSummarySelect` / `courtDetailSelect` / `mapPinSelect` and their mappers —
  unrelated, still structurally incapable of carrying coordinates, untouched.
- Any Stripe/billing/webhook code — unrelated to this fix.

## Known follow-up, deliberately NOT in scope here (flag in report, don't fix)

`ExactLocationController` has `@UseGuards(AuthGuard)` at the class level, so a fully
**logged-out** (anonymous, no session at all) visitor still gets a hard 401 before
this service ever runs — for a free court too. That means an anonymous visitor will
still see a free court's detail page in the "locked" reading, even after this fix,
which is still a (smaller) inconsistency with how cards treat anonymous visitors
(cards never mask a free court's name for anyone, logged in or not). Fixing that
fully would mean making this one route's auth optional (a new guard variant that
attaches the viewer if present but doesn't reject when absent) instead of hard-401,
which is a bigger, security-relevant change to a shared auth primitive — out of scope
for this task. The reported bug (a **logged-in** non-member seeing free courts
locked) is fully fixed by the change above; call out this remaining anonymous-visitor
gap in the report so it's a visible, separate decision rather than a silent gap.

## Testing

- With a **logged-in, non-entitled** session (the reported scenario): a free court
  (`isLocked=false`) at `/courts/[slug]` now renders the **UNLOCKED** reading — real
  name, real description, real map/location block, working "Get Directions" link —
  with no membership required. A premium court (`isLocked=true`) still renders the
  **LOCKED** reading exactly as before (masked name, blurred description, hidden map,
  paywall CTA) — confirm this direction didn't regress.
- With an **entitled** session: both free and premium courts render fully unlocked,
  unchanged from today.
- With a **logged-out** session: both free and premium courts still render locked
  (the known, called-out follow-up above) — confirm this is unchanged, not a new
  regression from this task.
- Directly exercise `GET /v1/me/courts/:slug/exact-location` (curl/Postman) with a
  valid session but no entitlement: a free-court slug → 200 with real `lat`/`lng`; a
  premium-court slug → 403. An unknown slug → 404 either way. No auth at all → 401
  (unchanged).
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean (both `apps/api` and `apps/web`).

## Report

Confirm the fix was made in `ExactLocationService` (not by special-casing anything in
`page.tsx`), confirm `isLocked` was added to the private select only and never leaked
into `ExactLocationDTO`'s wire shape, and confirm both the service's and controller's
header comments were updated to match the corrected failure semantics. Explicitly
call out the logged-out-visitor follow-up gap described above as intentionally
deferred, not missed. No git commit or push unless asked.
