# TASK 79 — Court import, part 1: the import API and the "agent kit"

**Model: Sonnet 5, reasoning effort: high.** This adds a bulk-write endpoint behind the admin auth and a set of documents an AI agent will be told to follow, so correctness and honest validation matter more than speed. Read `docs/TASK_73_ADMIN_COURTS_API.md`, `apps/api/src/admin/courts/*` (especially `admin-courts.service.ts` → `create()`, `admin-courts.dto.ts`, `admin-map-link.util.ts`), `apps/api/src/admin/geo/*`, `apps/api/src/courts/court-derived-fields.ts` and `apps/api/scripts/import-courts-from-content.ts` (the token maps `SURFACE_TOKEN_MAP`, `ACCESS_TOKEN_MAP`, the tag phrase map, `content/*/info.txt` samples, `content/coordinates.json`) **before** writing anything.

## Goal

The client does not want to enter courts by hand. She will give an **AI agent** a list of court names, the agent fills a **template** (a JSON file), and an admin **imports** that file. Today the only bulk path is the CLI importer that reads `content/<folder>/info.txt` from disk. We need:

1. **`POST /v1/admin/courts/import`** — validates a JSON file of courts (dry run) and creates them (commit), **all-or-nothing**.
2. **The "agent kit"** under `docs/court-import/`: a JSON Schema, an agent prompt, a worked example, and a short client guide.

The admin UI page for this is **TASK_80** (next). **Out of scope here:** any UI, images/photo handling of any kind (the client adds photos by hand in the admin afterwards), updating existing courts, publishing, a Prisma migration (none is needed — stop and report if you think one is), changes to public API shapes, changes to the CLI importer.

## Decisions already made (do not re-litigate)

1. **Create-only, drafts only, no photos.** Every imported court is created with `status: 'draft'`. A `status` key in the input is an **error** (the agent must not decide publication). No `images`, `imageUrls`, or any file field exists in the template. An existing court is never modified: a slug that already exists is an **error** (not a skip).
2. **All or nothing.** If any court in the file has an error, **nothing is written** — no courts, **no countries, no regions**. Warnings never block. The commit runs in **one** database transaction.
3. **Dry run is the default.** `dryRun` omitted ⇒ `true`. Writing requires an explicit `"dryRun": false`.
4. **`isLocked` defaults to `true`** for imported courts (product decision: all courts are premium by default, matching the content importer). The template may set `isLocked: false` per court. `isFeatured` defaults to `false`.
5. **Single source of truth for rules; no copies.** The import must apply **exactly** the rules the normal admin create applies. Extract from `AdminCourtsService.create()` a small shared function for the part that is pure (derive `slug`, `approxLat/approxLng`, `mapX/mapY`, validate `tags` via `validateAdminTags`, `mapLinkUrl` via `validateMapLinkUrl`, 0/0 check) and use it from both `create()` and the import. **`create()`'s behaviour must stay byte-identical** (all existing checks stay green). Reuse the constants for enums/limits from `admin-courts.dto.ts`; do not retype them.
6. **Validation lives in the API with `class-validator`** (the API does not depend on `zod` at runtime; `@tennis/contracts` is imported **type-only** in `apps/api`). Response shapes go in `packages/contracts/src/admin.ts` as zod schemas + inferred types, as in TASK_73.
7. **Per-item validation, not a whole-request 400.** The request body DTO is only `{ courts: unknown[], dryRun?: boolean }` (`courts`: 1–50 items, otherwise 400). Each item is validated **individually** (`plainToInstance(ImportCourtItemDTO, item)` + `validate(..., { whitelist: true, forbidNonWhitelisted: true })`) so one bad court yields a precise per-court error list instead of failing the whole request, and the report always covers every item. An item that is not a plain object (`null`, string, array) is an item error, never a 500. Keys `__proto__`, `constructor`, `prototype` anywhere in an item are an item error.

## The template (item shape)

Per court (all strings are trimmed; plain text only — HTML is not interpreted anywhere, but reject `<`…`>` tags in `name`/`setting`/`blurb` with a clear error):

| Field | Required | Rule |
|---|---|---|
| `name` | yes | 2–120 chars |
| `slug` | no | `^[a-z0-9]+(?:-[a-z0-9]+)*$`, ≤ 80; generated from `name` with the shared `slugify` when omitted |
| `country` | yes | object `{ name: 2–80, isoCode: 2 letters (case-insensitive, upper-cased), continent: contract enum }` |
| `region` | yes | string 2–80 (a city/area name) |
| `lat`, `lng` | yes | finite numbers, −90..90 / −180..180, not exactly 0/0; **at most 7 decimal places** (reject more — a sign of fake precision) |
| `mapLinkUrl` | no | exactly the existing `validateMapLinkUrl` rules |
| `surface` | yes | `Clay` \| `Hard` \| `Grass` |
| `access` | yes | `Resort` \| `Club` \| `Academy` \| `Private` |
| `indoorOutdoor` | yes | `Indoor` \| `Outdoor` |
| `setting` | yes | 1–120 chars (the short setting phrase shown on cards, e.g. "Hilltop clay courts above the sea") |
| `isScenic` | no | boolean, default `false` |
| `tags` | no | subset of the closed `CourtTag` vocabulary; normalised with `orderCourtTags`; unknown tag → error naming the allowed list |
| `blurb` | yes | 40–4000 chars, 1–6 paragraphs separated by a blank line |
| `isLocked` | no | boolean, default **`true`** |
| `isFeatured` | no | boolean, default `false` |
| `sources` | yes | array of 1–10 `https://` URLs (≤ 500 chars each). **Not stored** (no column) — echoed back in the report and logged only as a count. They exist so a human can check the agent's work |
| `notes` | no | string ≤ 500 (e.g. "coordinates approximate"). Not stored, echoed in the report |

Top level of the **file** (what the UI uploads as the request body): `{ "courts": [ ... ] }`. A bare JSON array is *not* accepted by the API (the UI will wrap it).

## What to build (all under `apps/api/src/admin/courts/` unless stated)

### 1. Endpoint
`POST /v1/admin/courts/import` — `@AdminOnly('admin')` (the controller already applies it), CSRF as for every admin mutation. Declare the route so it cannot be captured by any `:id` route.

- **Body size:** the Nest default JSON limit (100 kB) is too small for 50 long blurbs. Raise it to **1 MB for this route only** (a route-scoped `express.json({ limit: '1mb' })` mounted for exactly this path, before Nest's default parser; **do not** raise the global limit and do not break the Stripe `rawBody` capture — check `main.ts`). Every other admin route keeps its current limit (assert it). Over 1 MB → **413**.
- **Rate limit:** in-memory per admin, same structure as `admin-image-upload-rate-limit.service.ts`: commits 10 / 10 min, dry runs 60 / 10 min → 429 + `Retry-After`.

### 2. Resolution and validation (DB-dependent parts)
For each valid-shape item, resolve against the database and report **what would happen**:
- **Country:** look up by `isoCode`. Existing → reuse (if the given `name`/`continent` differ from the stored ones: **warning**, never an update). Not existing but the same `name` (case-insensitive) exists under a **different** isoCode → **error**. Otherwise → "create".
- **Region:** by (country, name case-insensitive). Existing → reuse. Otherwise "create" with `lat/lng` = **the court's own `lat/lng`** (document this in the schema description). Two items in the file with the same new region reuse one created region.
- **Slug:** already in the database → error `slug "x" already exists`. Duplicate slug **within the file** → error on the second occurrence naming the first item index. Same `name` + same country as an existing court or an earlier item but a different slug → **warning** (possible duplicate), not an error.
- Items are independent apart from these cross-item rules; an item's errors never hide another item's errors.

### 3. Dry run and commit
- **Dry run** (`dryRun` true/omitted): no writes, no locks. Returns **200** with the report.
- **Commit** (`"dryRun": false`): open one `prisma.$transaction`; first statement takes `pg_advisory_xact_lock` on a constant key for "court import" (serialises imports; countries/regions have no unique constraint on region name, so two parallel imports could otherwise duplicate regions); then **re-run the whole DB-dependent validation inside the lock**; if any item has an error → roll back and return **422** with the same report shape and `ok:false`, nothing written; otherwise create missing countries, missing regions, then courts **in file order** with `seedOrder = max(seedOrder)+1, +2, …`, then return **201** with the report plus the created court ids. Any unexpected database error (including a unique-constraint race) rolls everything back and returns a clean error (409 for unique violations with a message saying to re-run), never a partial write.
- One `logAdminMutation`-style log line per import (admin id, dry/commit, item count, created counts) and one per created court (`court.import`). Never log blurbs or URLs.

### 4. Report shape (contracts, `admin.ts`)
```
AdminCourtImportReport = {
  dryRun: boolean,
  ok: boolean,                       // no item has errors
  summary: { total, valid, invalid, newCountries, newRegions, warnings },
  items: [{
    index: number,
    name: string | null, slug: string | null,
    status: 'ok' | 'error',
    errors:   [{ path: string, message: string }],   // path like "lat", "country.isoCode", "tags[1]"
    warnings: [{ path: string, message: string }],
    resolved: { country: 'existing'|'create'|null, region: 'existing'|'create'|null, isLocked: boolean|null } ,
    sources: string[], notes: string | null,
    courtId?: string                 // only on a successful commit
  }]
}
```
Messages must be written for a **human and for an agent reading them back**: say what is wrong and what is allowed (`surface must be one of: Clay, Hard, Grass`), include the offending value when short.

### 5. The agent kit — `docs/court-import/`
Single source of truth for the client documents (the admin UI will ship copies, see TASK_80):
- `court-import.schema.json` — a **JSON Schema (draft 2020-12)** of the file (`{ courts: [...] }`), hand-written but exact: required/optional per the table, enums, `minLength/maxLength`, number ranges, `additionalProperties: false`, descriptions that tell an agent what to put in each field (including the "region = city/area name", "setting = short phrase", "blurb style" notes, "isoCode = ISO 3166-1 alpha-2", "lat/lng in decimal degrees, WGS84, ≤ 7 decimals").
- `AGENT_PROMPT.md` — the instruction the client pastes into her agent. It must: state the task and that the **only** output is one JSON document valid against the schema (no prose around it); require **web research** for facts; **forbid inventing** (a court whose coordinates cannot be verified from an official page, Google Maps or OpenStreetMap must be **left out of the JSON** and listed in a short separate "could not verify" note after the JSON); define how to get coordinates (from the Google Maps link when available, otherwise the venue's pin on Google Maps/OSM — never the city centre); define each enum with the meaning the content importer gives it (derive surface/access guidance from `SURFACE_TOKEN_MAP`/`ACCESS_TOKEN_MAP` and the existing courts; say what `Resort` vs `Club` vs `Academy` vs `Private` mean here); list the allowed **tags** with one-line meanings (from the tag phrase map) and say tags are optional and to use only what clearly applies; set the **writing style** of `blurb` by quoting the style of the two `content/` examples (evocative but factual, 2 paragraphs, no marketing superlatives, no invented history, English); require `sources` (official site first); say to **leave `isLocked`/`isFeatured` out** unless told; say not to include photos, `status`, `slug` (unless told), or any other field; and give the output language rule (English).
- `example.json` — **two real, correct courts** built from `content/DOMAINE DES ETANGS/info.txt` and `content/MONTE - CARLO COUNTRY CLUB/info.txt`, with coordinates taken from `content/coordinates.json` (`lat`/`lng` of `domaine-des-etangs` and `monte-carlo-country-club`) and the real `map link:` values from the info files, tags/surface/access derived with the importer's own rules (run the importer in its existing dry-run mode to see what it derives, and make the example agree with it). It must pass a dry run (apart from "slug already exists" if those courts are already in the DB).
- `CLIENT_GUIDE.uk.md` — **Ukrainian**, one page for a non-technical person: what to give the agent (prompt + schema file + list of courts), what comes back, how to import in the admin (Courts → Import: check → create drafts), that everything lands as **draft** and **premium (locked)**, that she adds photos by hand and then publishes, what the common errors mean, and the reminder to check coordinates on the map before publishing because an agent can be wrong.

## Testing

New script `apps/api/scripts/verify-admin-court-import.ts` + `"verify:admin-court-import"` in `apps/api/package.json`, in the exact style of `verify-admin-courts.ts` (same `record()`/`expectTrue()` style, own `AdminUser` rows, namespaced fixtures `f79-` / `@tennis.test`, cleanup in a `finally` for courts/regions/countries it created, **fail loudly** if the API is unreachable). You may copy the small helpers it needs; **do not refactor `verify-admin-courts.ts`**. Apply the same skip policy as that harness: skips are counted, the summary prints `Skipped: N`, the run exits non-zero on any skip unless `ALLOW_SKIPS=1`, and **no check may be conditional on database state** (create what you need). Remember the in-memory login limiter: restart the API between runs.

Required checks (at least):
1. **Auth:** no credentials → 401; role ≠ `admin` → 403; cookie-authenticated POST without `X-Tennis-Admin` → 403; Bearer works without it.
2. **Defaults:** body without `dryRun` writes nothing (assert row counts of courts/countries/regions before and after). `"dryRun": false` writes.
3. **Happy path:** a 2-court file with one existing country (new region) and one new country+region → dry run `ok:true` with correct `summary` and `resolved`; commit → 201, courts are `draft`, `isLocked: true`, `isFeatured: false`, `approxLat/approxLng/mapX/mapY` equal the shared functions of the slug and coordinates, `seedOrder` = previous max + 1, +2 in file order, tags in canonical order, new region's `lat/lng` = the court's, new country has the given iso/continent; the courts appear in `GET /v1/admin/courts` and are **absent** from every public court read.
4. **All-or-nothing:** a file with 3 valid courts (one needing a **new country**) and 1 invalid one → commit returns 422, `ok:false`, and **no** court, country or region was created (count before/after). A dry run of the same file reports the 3 valid items as `ok` and the invalid one with its errors.
5. **Idempotency / duplicates:** importing the same file twice → the second commit is 422 with `slug … already exists` on every item and nothing new written; duplicate slug inside one file → error on the second occurrence; same name+country with a different slug → warning only and the import still succeeds.
6. **Concurrency:** two identical commits fired in parallel → exactly one 201, the other 422/409, and the database contains exactly **one** copy of each court and of each new region/country. Repeat 5×. **Prove the test can fail:** temporarily remove the advisory lock and show a duplicate region (or a 5xx) in at least one run (report the numbers), then restore it; if it cannot be made to fail say so and explain.
7. **Per-field validation matrix** (each case is one item in a dry run; assert the exact `path` and that the other items are still reported): missing required fields (each one), unknown extra key, `status` present, `images` present, wrong types, every enum with a bad value, `lat`/`lng` out of range / 0,0 / > 7 decimals / strings, `mapLinkUrl` with the TASK_75/76 reject list (including `https://constructor/x`) and accept list, unknown tag, tag duplicates normalised, name/setting/blurb length limits, `<script>` in blurb, `sources` missing / empty / `http://` / 11 entries / non-URL, slug pattern, iso code lower-case accepted and upper-cased, iso of wrong length, continent invalid, existing-country name mismatch → warning, same name under another iso → error. Items that are `null`, a string, an array, a number → item errors (no 500). `__proto__`/`constructor` keys → item error.
8. **Body/size/limits:** `courts: []` → 400; 51 items → 400; non-JSON → 400; body > 1 MB → 413; a 200 kB body to **another** admin route (e.g. `POST /v1/admin/courts`) is still rejected as before (the limit was not raised globally); 11th commit within the window → 429 with `Retry-After`; dry runs are not counted against the commit limit.
9. **Create parity:** a court created through the import and one through `POST /v1/admin/courts` with the same inputs produce identical derived fields; the existing `create()` behaviour is unchanged (the existing harness stays green).
10. **Logging / no leaks:** one log line per import and per created court; none contains a blurb or a URL; the report contains no `passwordHash`.
11. **Kit drift test (in this harness):** (a) `court-import.schema.json` parses; its `enum` lists for surface/access/indoorOutdoor/continent/tags equal the API's constants; its `required` list and `maxLength`/`minLength`/range numbers match the DTO; every DTO property exists in the schema and vice versa. (b) `example.json` runs through the **dry-run endpoint**: every item is `ok`, or its **only** error is the `already exists` slug error (state which). (c) `AGENT_PROMPT.md` mentions every tag in the vocabulary and every value of `surface`/`access`/`indoorOutdoor` (a grep-style check). (d) `CLIENT_GUIDE.uk.md` exists and is non-empty and contains Cyrillic text.
12. **Regression (run the existing suites, don't re-implement):** `verify:admin-courts` (currently 260 checks, `Skipped: 0`), `verify:court-geo-redaction` 66/66 (comment out `DEV_FORCE_MEMBERSHIP=subscribed` in the local `apps/api/.env` for the run and **restore it**), `verify:effective-entitlement` 155/155 (same flag), `verify:api-parity` 42/42, `verify:api-auth` (all sub-harnesses).

Then `pnpm typecheck`, `pnpm lint`, `pnpm build` (stop `pnpm dev` first; **delete `apps/web/.next` before restarting dev**). Local Postgres only. If `.github/workflows/ci.yml` already runs the other API-backed `verify:*` scripts in a job with a DB and a running API, wire the new one in the same pattern; otherwise do not edit CI and say so.

## Docs
- **CLAUDE.md §11 (Admin API)**: rules for the import — create-only, drafts only, all-or-nothing in one transaction under an advisory lock, dry run is the default, `isLocked` defaults to true, per-item validation, route-scoped 1 MB body limit, no images in the template, the kit lives in `docs/court-import/` and is checked by `verify:admin-court-import`. Add the new harness to the inventory in §2 with its check count. **Append only; do not renumber any section** (see the rule at the end of §10).
- `apps/api/.env.example`: nothing is expected; add only if you introduced an env var.

## Do not touch
`apps/web`, `apps/admin` (TASK_80), the Prisma schema and migrations, the CLI importer's behaviour, the existing public API, image/photo code, the existing admin route paths and response shapes, the limiter code of existing limiters. No new runtime dependency and no new devDependency (if you believe one is unavoidable, stop and report why). No git commit or push unless asked.

## Report
1. Files created/changed (grouped) and the exact route, body limit and rate limits.
2. The report shape as implemented and one real dry-run response (the example file) pasted.
3. How all-or-nothing and the advisory lock work, with the before/after of the concurrency check (including whether it failed without the lock).
4. How the shared create/import function was extracted and the proof `create()` is unchanged.
5. Every deviation or interpretation, and anything about the content importer's token maps that you had to decide (surface/access wording in the prompt).
6. `verify:admin-court-import` check count (with `Skipped: 0`) and the regression table, no unexplained skips.
7. Anything security-relevant noticed (report only).
8. The exact commands run.
