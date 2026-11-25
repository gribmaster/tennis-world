# TASK 84 — Verify the PDF-based import kit (no feature work)

**Model: Sonnet 5, reasoning effort: low.** The agent kit in `docs/court-import/` was rewritten from "agent researches the web" to "agent transcribes a client PDF": `AGENT_PROMPT.md`, `CLIENT_GUIDE.uk.md` and `example.json` (now the five courts of the reference PDF) changed; `apps/admin/src/pages/CourtImportPage.tsx` got a one-line intro change and a short hint after each kit link. The schema and the API are untouched. Your job is only to run the checks, and fix a check only if the new files legitimately violate it.

## Do

1. `pnpm --filter @tennis/api verify:admin-court-import` (API running with `COURT_IMAGE_STORAGE=local`, `DEV_FORCE_MEMBERSHIP` irrelevant). The kit drift checks must pass: the schema matches the DTO, **`example.json` dry-runs with every item either `ok` or having exactly one error that contains "already exists"** (the five PDF courts are the same venues as the seeded `content/` courts, so "already exists" is expected on a seeded database), the prompt mentions every tag/surface/access/indoorOutdoor value, the guide contains Cyrillic. Report the total (was 115) and, for `example.json`, the per-item dry-run result you saw (`status` and error messages), against **both** a seeded database and, if cheap, an empty one (e.g. after temporarily using a different slug via `slug` override is NOT allowed — instead just report the seeded result).
2. `pnpm --filter @tennis/admin typecheck`, `lint`, `build` (the build copies the kit into `apps/admin/public/court-import/`), `verify:admin-ui` (was 127). Open **Courts → Import courts** in a browser: the four kit links each show a one-line hint and download the matching file; paste `docs/court-import/example.json` and press Check — the table shows the five rows. Screenshot not required; describe what you saw.
3. Confirm `docs/court-import/example.json` is valid UTF-8 with the accents intact (`Èze-sur-Mer`, `Château de la Messardière`, `Grand-Hôtel du Cap-Ferrat`) and that no file in the kit contains the word "Domaine des Etangs" or "COULD NOT VERIFY" except the prompt/guide where `COULD NOT VERIFY:` is intentional.

## Do not touch

The schema, the API, the harness expectations, `apps/web`. If a check fails because of the new kit content, report the failing check and your proposed fix instead of editing the harness. No git commit.

## Report

Totals of both suites, the `example.json` dry-run result per item, what the page looks like, anything else noticed, exact commands run.
