# TASK 82 — Court import UI: the three TASK_80 amendments that were missed

**Model: Sonnet 5, reasoning effort: medium.** The copy of `docs/TASK_80_COURT_IMPORT_UI.md` you executed was an **earlier draft**: my amended version never reached the repo. The import page you built is accepted as is; this task adds the three things the amended brief required. Read `apps/admin/src/lib/court-import.ts`, `apps/admin/src/pages/CourtImportPage.tsx`, `apps/admin/src/pages/CourtFormPage.tsx` and `apps/admin/scripts/verify-admin-ui.ts` first. Touch nothing else.

## Decisions already made (do not re-litigate)

### 1. Size guard counts the bytes of the request body, not of the pasted text
In `parseImportInput`, after the courts array is extracted, compute `new TextEncoder().encode(JSON.stringify({ courts, dryRun: true })).length`. If it exceeds **1 MB minus a 1 KB margin** (`1024*1024 - 1024`) → `File is too large (max 1 MB).` (the existing pre-parse text-size check may stay as a cheap first guard, also in bytes). Reason: the server limit applies to the body that is actually sent, which is re-serialised (wrapping, whitespace changes) and is in UTF-8 bytes.

### 2. Pasted chat output is tolerated (the agent answers in a chat, the client copies it)
In `parseImportInput`, after BOM removal and trim: if the text starts with a Markdown code fence (```` ```json ```` or a bare ```` ``` ````, optional spaces, Unix or Windows line endings), parse **only the content of the first fenced block**; everything after the closing fence (the agent's `COULD NOT VERIFY:` note) is ignored. Add `fenced: true` to the ok result and show a one-line info note on the page ("Used the first JSON block; text after it was ignored."), next to the existing "wrapped" note. Rules, all returning a clean error (never guessed at): an **unterminated** fence → `The JSON block is not closed (missing closing ```).`; **prose before** the first fence → falls to the normal invalid-JSON message; text that is neither plain JSON nor starts with a fence → normal invalid-JSON message. Line/column in a JSON syntax error must be relative to the **block content**, and the message should say so.

### 3. "Check on map" links in the court form
In `CourtFormPage.tsx`, in the **Exact location** section, next to the lat/lng inputs, show two links when **both** values currently in the form are valid numbers in range (lat −90..90, lng −180..180): **Check on map (OpenStreetMap)** using the existing `osmLink`, and **Open in Google Maps** using a new pure `googleMapsPinLink(lat, lng)` = `https://www.google.com/maps/search/?api=1&query=LAT,LNG` (no space after the comma; numbers rendered with `String()`, never exponent form for the values the form accepts — guard: if `String(n)` contains `e`, return `null`). Both `target="_blank" rel="noopener noreferrer"`; hidden otherwise; they update as the admin types. Put `googleMapsPinLink` in `court-import.ts` next to `osmLink`; the import report table's row for a court with valid lat/lng also gets the Google pin link as a second link (the existing court `mapLinkUrl` link stays).

## Testing

Extend `verify-admin-ui.ts` (pure logic, no browser needed): a body that is under 1 MB in characters but over in UTF-8 bytes (multi-byte text) is rejected; the 1 KB margin boundary (just under accepted, just over rejected); fenced block with and without `json` tag, with CRLF, with trailing `COULD NOT VERIFY:` text → parsed, `fenced: true`; unterminated fence → error; prose before the fence → error; BOM + fence; two fenced blocks → only the first used; a fenced block containing a bare array → wrapped **and** fenced; `googleMapsPinLink` for typical, negative, zero, out-of-range, `NaN`, tiny numbers (`1e-7` → `null`). Then a short real-browser check: paste the repo's `example.json` wrapped in a ```json fence followed by a `COULD NOT VERIFY:` line → Check works and shows the note; open a court form, type coordinates → both links appear, and disappear when lat is 200.

Regression: `pnpm --filter @tennis/admin typecheck`, `lint`, `build`, `verify:admin-ui`; root `pnpm lint`. (Do not spend time on `@tennis/web` typecheck; it is tracked separately.)

## Do not touch

`apps/api`, `apps/web`, `packages/*`, `docs/court-import/`, the kit copy script, any existing check's expectation (additions only). No dependency. No git commit.

## Report

1. Files changed. 2. For each of the three items, what the check/UI now does with one concrete example. 3. Check count before/after. 4. Browser verification result. 5. Anything else noticed. 6. Exact commands run.
