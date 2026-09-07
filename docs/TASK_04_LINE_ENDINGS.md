# TASK 04 — Normalize line endings + fix the .env.example gitignore rule

**Model: Sonnet 5, reasoning effort: medium.** Mechanical repo hygiene, no design judgment.

Task:
Stop the repository producing thousands of lines of fake diff from CRLF/LF churn, and
stop `.gitignore` excluding the env templates the rulebook depends on. Do this BEFORE
Feature 72 is committed, so its commit carries only its real 268 lines.

Context:
- Repo root: D:\work\tennis. Read `CLAUDE.md` §10 (git rules) before touching anything.
- **The problem, measured:** Feature 72's raw `git diff --stat` reports ~2,000 changed
  lines. `git diff --stat --ignore-all-space --ignore-cr-at-eol` reports **268 insertions
  across 13 files**. The difference is 12 files that were rewritten LF → CRLF as a side
  effect of being edited on Windows. Examples: `apps/web/scripts/verify-api-parity.ts`
  shows 944 changed lines but has exactly **1** real change; `mock-saved.repository.ts`
  shows 574 but has **2**.
- **Root cause:** there is no `.gitattributes` in the repo and `core.autocrlf` is unset,
  so nothing normalizes line endings on checkout or commit. This will recur on every one
  of the ~15 remaining redesign features, and on a redesign — where whole screens get
  rewritten — an unreadable diff is a real review hazard, not a cosmetic annoyance.
- The 12 CRLF-rewritten files: `apps/api/prisma/schema.prisma`, `apps/api/prisma/seed.ts`,
  `apps/api/scripts/import-courts-from-content.ts`, `apps/api/src/courts/courts.controller.ts`,
  `courts.dto.ts`, `courts.mapper.ts`, `courts.service.ts`,
  `apps/web/scripts/verify-api-parity.ts`,
  `apps/web/src/domain/courts/mock-court.repository.ts`,
  `apps/web/src/domain/saved/mock-saved.repository.ts`,
  `packages/contracts/src/court.ts`, `packages/mock-data/src/courts.ts`.
  Verify this list yourself rather than trusting it — the check is:
  worktree file has CRLF (`file <path>`) while `git show HEAD:<path>` does not.

## Requirements

1. **Add `.gitattributes` at the repo root.** Normalize text to LF in the repository.
   At minimum a `* text=auto eol=lf` baseline, plus explicit `binary` / `-text` entries
   for the binary types actually present so they are never mangled: `*.png`, `*.jpg`,
   `*.jpeg`, `*.webp`, `*.ico`, `*.pdf`, `*.zip`, `*.woff`, `*.woff2`. Check the repo for
   any other binary extension before finalizing the list (`new design/` holds a 3 MB HTML
   file — that is text, leave it as text).
   Add a short header comment saying why the file exists, matching the commenting style
   the repo already uses in `prettier.config.js` / `tailwind.config.ts`.

2. **Make the LF rule explicit in Prettier too.** `packages/config/prettier.config.js`
   currently sets `semi`, `singleQuote`, `trailingComma`, `printWidth`, `tabWidth` and
   does NOT set `endOfLine`. Add `endOfLine: 'lf'` so the formatter states the rule rather
   than relying on a default. This is the only change to that file.

3. **Renormalize the working tree.** Convert the CRLF files back to LF so the diff shows
   only real changes. Use git's own renormalization (`git add --renormalize .`) rather
   than hand-editing files or running a `sed` sweep — it applies the new `.gitattributes`
   rules consistently and cannot corrupt a binary.
   **Afterwards, prove it worked:** `git diff --stat` (raw, no ignore flags) must report
   the same ~268 lines that `--ignore-all-space --ignore-cr-at-eol` reported before. Put
   both numbers in the report.

4. **Fix the `.env.example` exclusion.** `.gitignore` currently contains a bare
   `.env.example` line, and **no `.env.example` file is tracked** (`git ls-files | grep
   env.example` returns nothing) — yet `CLAUDE.md` §3 names them as the env templates and
   `apps/api/.env.example`, `apps/web/.env.example` and the root `.env.example` all exist
   on disk. The rulebook points at files a fresh clone would not get.
   Remove the `.env.example` exclusion so templates can be tracked, keeping `.env`,
   `.env.local` and `.env.*.local` excluded exactly as they are.
   **Then, before staging a single template, read all three files end to end and confirm
   each contains only shapes, placeholders and comments — no real secret, key, token,
   password, price id, or connection string with credentials** (CLAUDE.md §3). Report what
   you checked. **If ANY of them contains a real value, do not track that file** — leave it
   ignored, and report exactly which file and which key so a human can sanitize it. Do not
   sanitize it yourself; do not guess whether a value is real.

5. **Do not commit.** Leave everything staged-or-unstaged in the working tree and let me
   review. CLAUDE.md §10: commit and push only when explicitly asked.

Do not change:
- Any file's actual content beyond line endings. Requirements 1, 2 and 4 add or edit three
  small config files; requirement 3 changes only line endings. **No source logic changes,
  no formatting/reflowing of code, no Prettier rewrite pass over the repo** — `endOfLine`
  is a config edit, not an invitation to run `pnpm format` across every file. If running
  the formatter would reflow code, do not run it.
- Feature 72's real changes. They are correct and under review; this task must leave that
  268-line diff intact and readable, not absorb, revert or reformat any part of it.
- `.gitignore`'s other entries. Only the `.env.example` line goes.
- No package installs, no git commit, no push, no database or Stripe work.

Testing:
- `pnpm typecheck` and `pnpm build` — must still pass. A line-ending change is not
  supposed to break anything; this proves it didn't.
- `pnpm lint` — confirms no formatter/linter now disagrees with the tree.
- Do NOT run the `verify:*` harnesses for this task; nothing behavioral changed.

Report back:
1. `git diff --stat` totals **before and after** renormalization, and the
   `--ignore-all-space --ignore-cr-at-eol` total for comparison. The three numbers should
   tell a clear story.
2. The final `.gitattributes` contents.
3. The confirmed list of files that were CRLF and are now LF.
4. For each of the three `.env.example` files: whether you read it in full, whether it is
   clean, and whether it is now trackable. Name any file you refused to track and why.
5. Pass/fail for typecheck, build and lint.
