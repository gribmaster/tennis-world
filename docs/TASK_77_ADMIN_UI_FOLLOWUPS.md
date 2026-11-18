# TASK 77 — Admin follow-ups: serial photo uploads, restore CLAUDE.md section numbers, clean test leftovers

**Model: Sonnet 5, reasoning effort: medium.** Three small fixes found while verifying the TASK_73/TASK_74 reports against the code. Read `apps/admin/src/components/CourtPhotosPanel.tsx`, `CLAUDE.md` and the migration/source files named below first. Nothing else changes.

## 1. Photo uploads are not sequential (TASK_74 decision) — fix in `apps/admin`

`CourtPhotosPanel` passes `multiple` to Ant Design's `Upload` with a `customRequest`. rc-upload calls `customRequest` for **every selected file immediately**, so a 3-file selection fires 3 concurrent requests despite the comment saying "sequentially". `disabled={uploading}` only blocks *new* selections, and the boolean `uploading` is flipped to `false` by whichever request finishes first. Consequences the owner will see: the spinner stops early, the files land in arrival order rather than selection order, and — the visible one — **the first file to arrive becomes the hero automatically, so which photo is the hero is random**. (The API is safe under concurrency since TASK_75; this is purely a UI-order/UX defect.)

Decisions:
- A tiny pure helper `apps/admin/src/lib/serial-queue.ts`: `createSerialQueue()` returning `enqueue<T>(task: () => Promise<T>): Promise<T>`; tasks run **one at a time in enqueue order**; a rejected task rejects only its own promise and does **not** stop later tasks. No dependency.
- `CourtPhotosPanel` runs each file's preflight + upload through one queue instance (kept in a `useRef`), so files upload in the order the user selected them. Replace the boolean `uploading` with a pending counter (`pending > 0` → button loading + `Upload` disabled) so the spinner lasts until the **last** queued file finishes. `onChanged()` is called once after the queue drains, not once per file. Preflight failures (type/size) still just add their message to the error list without blocking the rest. Keep the per-file error messages exactly as they are.
- Do not change any API call, the error list UI, or anything else in the panel.

Tests (add to `apps/admin/scripts/verify-admin-ui.ts`, same `record()` style, report the new total — currently 41): queue runs tasks strictly in order; **max observed concurrency is 1** (use tasks with staggered delays and a shared counter); a rejecting task does not prevent later tasks; the returned promises settle with each task's own result/error; enqueue after the queue has drained still works. Then a live check if you have a browser tool: select 3 files at once and confirm in the network panel the requests are serial and that the **first selected file is the hero**; if you cannot, say so.

## 2. Restore the CLAUDE.md section numbers

TASK_73 inserted "Admin API" as **§8** and TASK_74 inserted "Admin app" as **§9**, which pushed the old §8 (Database and Prisma rules), §9 (Scope discipline) and §10 (Git rules) down to §10/§11/§12. Those numbers are cited all over the repo and the old numbers are now **wrong**: migration SQL comments (`CLAUDE.md §8` in `20260907120000_add_court_tags`, `20260908120000_add_review`, `20260925120000_add_saved_collection` — **do not edit migration files**, Prisma checksums cover the whole file), `apps/api/src/courts/court-tags.ts` and its compiled copy (§9), `apps/web/src/features/saved/SavedDreamListCta.tsx` and `SavedEmptyState.tsx` (§9), and ~20 historical `docs/TASK_*.md` / `FEATURE_*.md`. Agents following those pointers land in the wrong section.

Decisions:
- **Restore** `## 8. Database and Prisma rules`, `## 9. Scope discipline`, `## 10. Git rules` exactly as they were before TASK_73 (compare with `git show 5dc888d~1:CLAUDE.md` — the heading list there is 1–10).
- **Move** the two new sections to the end: `## 11. Admin API` and `## 12. Admin app` (content unchanged apart from numbers).
- Fix every internal cross-reference inside `CLAUDE.md` that the renumbering touched (e.g. the repo-map line "TS-source main (see §11)" must say §9 again, "⚠ see §10" must say §8 again, "`/v1/admin/*` endpoints in §8" must say §11), and any `§` pointers in `apps/admin/README.md`, `apps/api/.env.example` or admin source comments that cite the renumbered sections. Grep for `CLAUDE.md §`, `CLAUDE.md (§` and bare `§8|§9|§10|§11|§12` in `apps packages docs/TASK_7*.md CLAUDE.md` and resolve each: after your change every citation of §8/§9/§10 must again mean what its author meant (Prisma / scope / git).
- Add one rule at the end of §10 (Git rules) or §9: **"Add new CLAUDE.md sections at the end; never insert before an existing number — section numbers are cited from immutable migration SQL and across the repo."**
- Do **not** touch any file under `apps/api/prisma/migrations/`, and do not rewrite old historical docs (they are correct again once the numbers are restored).

Test: a small script-free check you run by hand and paste into the report — the `grep -n "^## " CLAUDE.md` output (must be 1–12 in order with §8/§9/§10 titled Database/Scope/Git), plus the list of every `CLAUDE.md §N` citation you changed or verified.

## 3. Clean the local test leftovers (local DB only)

The TASK_74 walkthrough left a country "Testland", its region "Test Region" and a draft court "Château de la Messardière Test Court" (plus its uploaded photos under `apps/web/public/uploads/courts/<courtId>/`) in the **local** dev database. Remove exactly those, nothing else, with a one-off throwaway script you do **not** commit: first print the matching rows (ids, names, image count, upload folder) and **abort unless `DATABASE_URL` points at `127.0.0.1`/`localhost` port 15432** (the docker-compose Postgres); delete the court's `CourtImage` rows, the court, the region, the country, then the uploaded folder(s). Print what was deleted. If any of those rows has anything attached that you did not expect (a saved court, a collection link), stop and report instead of deleting.

## Testing / checks

`pnpm --filter @tennis/admin verify:admin-ui` (new total), `pnpm typecheck`, `pnpm lint`, `pnpm build` (stop `pnpm dev` first; delete `apps/web/.next` before restarting dev — the TASK_74 run left dev servers up while builds ran). Re-run `pnpm --filter @tennis/api verify:admin-courts` and **explain why it reported 221 checks in the TASK_74 report when TASK_76 reported 220** with no API change.

## Do not touch

`apps/api` code, migrations, `apps/web`, `packages/*`, the API contract, and anything not named above. No new dependency. No git commit or push unless asked.

## Report

1. Files changed.
2. The queue helper's check results and the live-upload observation (or that it was not observed).
3. `grep -n "^## " CLAUDE.md` after the fix and the list of citations you changed/verified.
4. What was deleted in §3, with the abort-guard output.
5. The 220-vs-221 explanation.
6. New `verify:admin-ui` total; typecheck/lint/build results.
7. The exact commands run.
