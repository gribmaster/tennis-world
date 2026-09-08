# TASK 13 / FEATURE 80 — Review submission (collection only, no display)

**Model: Opus 5, reasoning effort: high.** New model, new migration, new endpoint, new web
seam — small surface, but it is a write path and it touches the schema.

Task:
Let a signed-in user submit a review for a court, and add the prototype's "Played here?"
card that opens the form. **Store reviews; display nothing.**

Context:
- Read `CLAUDE.md` first: §4 (pending/loading), §6 (auth), §8 (Prisma — binds hard here),
  §9. Then `docs/FEATURE_71_DESIGN_V2_INTAKE.md` §3 "D4" and §8.
- Prototype: `CourtDetailScreen`'s "Played here? Leave a review" card. Strip the base64
  first — recipe in `docs/TASK_07_FEATURE_74_HOME.md`.

## DECIDED — do not re-open

1. **Collection only.** No star ratings, no averages, no review counts, no review list —
   nowhere in the app. The prototype's `Stars` component and its "4.6 (128)" numbers are
   dropped entirely (intake §8 Q7 and §4). The stored data is for later use.
   Collect a rating VALUE in the form (that is the point of collecting), but render no
   aggregate anywhere.
2. **Submission requires sign-in**, while `Review.userId` is **nullable** at the schema
   level — the same shape `ConsultationRequest` already uses, so anonymous submission stays
   possible later without a migration. Do not invent a new convention for this.

## MIRROR THE CONSULTATION MODULE — it is the template

`ConsultationRequest` is the closest existing thing and it is complete end to end. Read all
of it before writing anything, and follow its shape rather than inventing a parallel one:

- `apps/api/src/consultations/` — controller / dto / mapper / module / service
- `packages/contracts/src/consultation.ts` — a `…SubmitSchema` (the request body) plus the
  full record schema
- `apps/web/src/domain/consultation/` — interface + mock + http implementations
- `apps/web/src/features/consultation/` — `ConsultationModal`, `ConsultationTrigger`,
  `consultation-copy.ts`

Where you deviate from that shape, say why in your report.

## Requirements

1. **Schema.** A `Review` model. At minimum: its own id, a nullable `userId` relation, a
   required `courtId` relation, the rating value, the review text, a moderation `status`
   with a sensible default (`ConsultationRequest.status` defaults to `"new"` — follow it),
   and `createdAt`.
   Decide and justify: (a) whether one user may leave more than one review per court, and
   how the schema enforces your answer given `userId` is nullable; (b) what indexes the
   read patterns will actually need — remember nothing reads these yet, so do not
   speculatively index.

2. **Migration.** One migration, back-safe, authored with `prisma migrate diff` and applied
   with `prisma migrate deploy`. **`prisma migrate dev` hangs in this shell — do not run
   it** (§8). Never edit an applied migration. Nothing runs against staging or production.

3. **Contracts.** A new `packages/contracts/src/review.ts` following `consultation.ts`:
   a submit schema for the request body with real validation (rating bounds, text length
   limits — pick defensible numbers and state them), plus the record schema. Export it from
   the package index.

4. **API module.** A new `reviews` module: `POST /v1/reviews` (or the path you judge
   correct — say why). It is **authenticated**: use the existing `AuthGuard`, the same one
   `me` and `billing` use. Reject an unauthenticated request cleanly; do not silently accept
   an anonymous review just because the column allows null.
   Validate that the court exists and is published before accepting a review for it.
   The service is the only writer. No email, no CRM, no webhook — those are not in scope.

5. **Rate limiting — decide.** `billing` has an in-memory per-user limiter
   (`billing-rate-limit.*`); consultations have none. A review endpoint is an authenticated
   write that a bored user could hammer. Decide whether to reuse that limiter shape here,
   and justify either answer. Do not add a new dependency for it.

6. **Web seam.** `apps/web/src/domain/reviews/` — interface plus mock and http
   implementations, wired through the factory in `domain/index.ts`. The mock accepts and
   stores in memory (it is a mock seam, exactly as `MockConsultationRepository` is);
   the http implementation posts to the endpoint through the authenticated transport.

7. **UI — the "Played here?" card and its form.** Card on Court Detail per the prototype:
   the icon, "Played here?", the sub-line, and the button.
   - **Unlocked branch only.** A viewer who cannot see where the court is has not played
     there. Do not put it in the locked branch. Say if you disagree, but do not build it.
   - The form is a modal mirroring `ConsultationModal`: labelled dialog, focus trapped,
     Escape closes, background scroll locked, focus restored — the same bar `FilterSheet`
     met in Feature 73.
   - **Signed out:** the button routes to `/signin?redirectTo=/courts/{slug}`, exactly as
     `CourtSaveButton` does. Do not open a form that will fail on submit.
   - Submit is an async mutation ⇒ the §4 triad: local pending state, `disabled`,
     `aria-busy`, `InlineSpinner`, `pending` cleared in an unconditional `.finally()`,
     and a real error state on failure. Never leave the control stuck.
   - Success: a calm confirmation. Do not claim the review is published — it is not
     displayed anywhere.

8. **Nothing reads reviews.** No endpoint returns them, no page fetches them, no aggregate
   appears. If you find yourself adding a GET, stop — that is a later feature with its own
   moderation questions.

Do not change:
- The entitlement gate, the exact-location endpoint, `locked` derivation, or anything
  Feature 78/79 built beyond adding the card to the unlocked branch.
- Billing, Stripe, the webhook, `/billing/return`.
- Auth: no new auth framework, no change to the session cookie or to magic-link/Google
  behavior (§6). Reuse `AuthGuard`.
- Existing responses, status codes or route paths for `/v1/courts*`, `/v1/collections*`,
  `/v1/articles*`, `/v1/countries`, `/v1/me/*`.
- `apps/web/src/components/filters/**`, and the other redesigned screens.
- No package installs. No git commit or push. No migration against staging or production.

Testing:
- `pnpm --filter @tennis/api prisma:generate`, `pnpm typecheck`, `pnpm build`, `pnpm lint`.
- `pnpm verify:api-parity` — must stay **42/42**. Reviews are write-only and touch no read
  DTO, so any change in this number means you altered a public read by accident.
- `pnpm --filter @tennis/web verify:ux-pending-states` — 90 checks; you are adding a
  mutation control to a redesigned screen.
- `pnpm --filter @tennis/web verify:web-exact-location` — proves the card did not disturb
  the gate on the page it now lives on.
- Exercise the endpoint by hand: an authenticated POST that succeeds, an unauthenticated
  POST that is rejected, a POST for a non-existent court, and one that violates your
  validation bounds. Paste the status codes.

Report back:
1. The `Review` model as written, plus your answers on multiple-reviews-per-court and
   indexes.
2. The migration file name and its back-safe sequence.
3. The endpoint path, its guard, and the status codes for the four cases you exercised.
4. Your rate-limiting decision and its justification.
5. The validation bounds you chose for rating and text.
6. Confirmation that nothing anywhere reads or displays a review, rating or count.
7. The modal's accessibility handling, and the §4 triad on the submit control.
8. Files changed, and pass/fail counts for every check.
