# Saved-Court Flow — Audit & Local Smoke Test

**Context:** Manual local testing of auth + persistence found that magic-link login, logout,
user collections, and add-to-collection all worked, but **no standalone "Save court" / heart
action existed in the UI**. This document records the audit of the saved-court flow and the
fix, plus the observed local smoke-test result.

**Data source:** `NEXT_PUBLIC_DATA_SOURCE=api` (protected `/v1/me/*` endpoints, session-backed).

---

## 1. Audit — root cause

The standalone save/unsave feature was **half-built**: the API shipped it (Feature 54), but the
web repository boundary + UI were deferred ("a later feature wires the real toggle") and never
delivered, leaving the working endpoints **unreachable from the app**.

| Layer | State BEFORE this fix |
|---|---|
| API `GET/POST/DELETE /v1/me/saved-courts` | ✅ Fully implemented, auth-guarded, idempotent, coordinate-masked (Feature 54) |
| Web `SavedRepository` interface | ❌ Only `getSavedCourts()` (read) + collection-folder methods — **no `saveCourt`/`unsaveCourt`/`isCourtSaved`** |
| `HttpSavedRepository` / `MockSavedRepository` | ❌ Never called `POST`/`DELETE /v1/me/saved-courts` |
| `CourtCard` heart | ⚠️ Present but **visual-only** (`showSaved`/`saved`, no `onClick`) |
| Court Detail action bar | ❌ Had "Add to Collection" menu; **no standalone save** |
| `/saved` Courts tab | ✅ Rendered `getSavedCourts()`; hearts hardcoded filled, non-interactive |

**Answers to the audit questions:**

- **Standalone save/unsave in the API?** — Yes, fully (Feature 54). No change needed.
- **Standalone save/unsave in the web repository?** — No. The interface never exposed it.
- **UI button present but hidden/unclear?** — The heart was present but purely decorative.
- **Missing from CourtCard, Court Detail, or both?** — Both (no interactive save on either),
  because the repository method that would back it did not exist.

Collection membership worked because *that* path was fully wired (Features 34–37, 56–58).

---

## 2. Fix (uses the existing repository boundary — no UI redesign)

- **`SavedRepository` interface** (`apps/web/src/domain/saved/saved.repository.ts`): added
  `saveCourt(courtId)`, `unsaveCourt(courtId)`, and the read `isCourtSaved(courtId)`.
- **`HttpSavedRepository`**: `saveCourt` → `POST /me/saved-courts {courtId}`; `unsaveCourt` →
  `DELETE /me/saved-courts/:courtId`; `isCourtSaved` derives from the saved-courts list.
- **`MockSavedRepository`**: same three methods against the in-memory saved list (mock mode
  stays functional; idempotent; only real+published courts save; no lat/lng leak).
- **`CourtSaveButton`** (new client island, `features/court-detail/`): heart/bookmark button via
  `getClientRepositories()`, optimistic toggle, `AuthRequiredError` → roll back + `/signin`.
  Mirrors the existing `SaveToCollectionMenu` auth pattern. A logged-out click routes to
  `/signin?redirectTo=/courts/{slug}`.
- **Court Detail** (`CourtDetailCtaPanel` + `courts/[slug]/page.tsx`): server-fetches
  `isCourtSaved(court.id)` in the same protected-read block (degrades to signed-out on 401) and
  renders the Save button in the CTA column above the Add-to-Collection menu.
- **`/saved` Courts tab** (`SavedCourtsGrid`): now a small client island — each saved card gets
  an interactive Unsave control (`unsaveCourt`) that optimistically removes it. **`CourtCard`
  itself is unchanged** (still presentational) — the control is a sibling overlay, so the card's
  use elsewhere (Home/Map/related) is unaffected.

**Constraints honored:** existing repository boundary only (no mock/http imports in components);
no hardcoded court data in JSX; collection behavior preserved; exact coordinates still masked
server-side (every court read uses the public summary select); no `apps/web/app/api` routes; no
Stripe/password-auth changes.

---

## 3. Automated verification

| Harness | Result |
|---|---|
| `pnpm --filter @tennis/web typecheck` | ✅ pass |
| `pnpm --filter @tennis/web lint` | ✅ no warnings or errors |
| `pnpm --filter @tennis/web build` | ✅ pass (16/16 pages) |
| **`verify:saved-court-toggle`** (new) | ✅ **11/11** — save → reload → present → unsave → reload → gone; idempotent both ways; masking; logged-out 401 |
| `verify:user-saved-http` (existing) | ✅ 17/17 — collection behavior intact |
| `verify:persisted-saved-flow` (existing) | ✅ 21/21 — persisted saved/user flow intact |

The new harness drives the same `getRepositories('api', auth)` factory the app uses. Obtain a
bearer token via the magic-link flow (see the script header), then:

```
AUTH_BEARER_TOKEN=<accessToken> pnpm --filter @tennis/web verify:saved-court-toggle
```

---

## 4. Manual smoke test — observed result (api mode)

Stack: Postgres (docker) on `15432`, API on `127.0.0.1:18001`, web on `127.0.0.1:18000`.

| Step | Expected | Observed |
|---|---|---|
| Log in via magic link | Session established | ✅ `/auth/verify` → 200, session cookie set |
| Open a court detail page (not saved) | Save button reads "Save Court", `aria-pressed=false` | ✅ |
| Save the court | Button flips to "Saved" | ✅ server re-render shows `Saved` + `aria-pressed="true"` |
| Open `/saved` → Courts tab | Court appears with an Unsave control | ✅ card + "Unsave Grand Hotel Tremezzo" present |
| Unsave the same court | Removed from the list | ✅ `/saved` shows 0 occurrences after unsave |
| Re-open the court page | Button reads "Save Court" again | ✅ `Save Court` + `aria-pressed="false"` |
| Add the same court to a user collection | Collection flow still works | ✅ Add-to-Collection menu unchanged; `verify:user-saved-http` 17/17 |
| Logged-out visitor on the public court page | Save button shows; click → `/signin` | ✅ button rendered, `aria-pressed` omitted; Add-to-Collection intact |
| Logged-out visitor on `/saved` (private) | Redirect to `/signin` | ✅ `307 → /signin?redirectTo=/saved` |

**Result: PASS.** Standalone save/unsave now works from a visible heart/bookmark on Court
Detail, saved courts appear and can be removed from the `/saved` Courts tab, existing
collection behavior is preserved, and unauthenticated users are prompted to sign in consistently
with existing auth behavior.

> Note: the court **id** (`tremezzo`) differs from its web **slug** (`grand-hotel-tremezzo`) —
> save/unsave APIs key off the id (`CourtSummaryDTO.id`); the `/courts/[slug]` route uses the slug.
