# TASK 42 — Real backend: save/heart an editorial Collection (bookmark it to Saved)

**Model: Sonnet 5, reasoning effort: high.** This is a full-stack feature (schema →
API → contracts → web repository → UI), touching many files. Read each "mirror
exactly" pointer below and copy that file's actual current pattern — don't
re-derive the design from scratch.

## Context — reversing a documented "not being built" decision

Earlier in this project, bookmarking an editorial `CollectionDTO` (the "Featured
Collections" / "Curated for You" cards) was explicitly decided AGAINST and
documented in two places:

- `apps/web/src/features/saved/SavedCollectionsGrid.tsx` (header comment)
- `apps/web/src/features/saved/SavedCollectionRow.tsx` (header comment)
- `apps/web/src/features/collections/CuratedCollectionCard.tsx` and
  `CuratedCollectionsList.tsx` (header comments, added in Task 40)

All of these say some version of: "bookmarking an editorial `CollectionDTO` has no
model, no join table, no endpoint, and no repository method in this product, and
is not being built (decided)."

**That decision is now reversed.** The user wants a real heart/save control on
editorial collection cards, backed by a real database table and real API
endpoints — not a mock-only seam. Update every one of those stale comments once
the feature lands (see "Do not forget" at the end) so they don't keep asserting
something no longer true.

**The precedent to mirror, file for file: `SavedCourt` / Feature 54.** This
product already has exactly this feature for courts (standalone save/unsave of a
Court, distinct from folder membership). The individual-court heart
(`SavedCourt` model, `SavedCourtsController`/`SavedCourtsService`,
`saveCourt`/`unsaveCourt` on `SavedRepository`, `HomeCourtSaveHeart.tsx`) is a
complete, working, real-backend feature. This task is that same shape, applied to
`Collection` instead of `Court`. Read the actual current files named below before
writing anything — they are the spec.

## 1. Database — `apps/api/prisma/schema.prisma`

Add a new join model, mirroring `SavedCourt` (around line 361) exactly:

```prisma
model SavedCollection {
  userId       String
  user         User       @relation(fields: [userId], references: [id])
  collectionId String
  collection   Collection @relation(fields: [collectionId], references: [id])
  savedAt      DateTime   @default(now())

  @@id([userId, collectionId])
}
```

Add the back-relation array field to both sides, matching how `SavedCourt` is
wired onto `User` and `Court`:
- `User` model: add a relation field for `SavedCollection[]` (find how
  `SavedCourt` is referenced on `User` today — likely an unnamed back-relation
  array; add the equivalent for `SavedCollection`).
- `Collection` model (around line 211): add a `savedBy SavedCollection[]` relation
  array field alongside its existing `courts CollectionCourt[]` field.

Run the migration the same way this project's other schema changes were applied
(`prisma migrate dev` from `apps/api`, with a clear migration name like
`add_saved_collection`). Do not hand-edit a migration file.

## 2. Contracts — `packages/contracts/src/user.ts`

Add `CollectionIdRefSchema` immediately after `CourtIdRefSchema` (around line
138), same doc-comment style:

```ts
/**
 * Body for `POST /v1/me/saved-collections` — the editorial collection being
 * saved, by id. The matching remove is a path param on a DELETE, so it needs no
 * body.
 */
export const CollectionIdRefSchema = z.object({
  collectionId: z.string(),
});
export type CollectionIdRefDTO = z.infer<typeof CollectionIdRefSchema>;
```

## 3. API — new `apps/api/src/me/saved-collections.*`

Create three files mirroring `saved-courts.controller.ts` /
`saved-courts.service.ts` / `saved-courts.dto.ts` line-for-line, with `Court` →
`Collection` swapped throughout:

### `saved-collections.dto.ts`
Same shape as `saved-courts.dto.ts`, but `SaveCollectionRequestDTO { collectionId }`,
validated against `CollectionIdRefDTO` (the compile-time assertion at the bottom
mirrors `_AssertCourtIdRefParity`).

### `saved-collections.service.ts`
Mirror `SavedCourtsService` exactly:
- `listSavedCollections(userId): Promise<CollectionDTO[]>` — reuses the EXISTING
  public `collectionSelect` / `toCollectionDTO` from
  `apps/api/src/collections/collections.mapper.ts` (a pure function import, same
  as `SavedCourtsService` importing from `courts.mapper.ts` — no `CollectionsModule`
  provider dependency needed). Order by `savedAt desc`. Filter to
  `isPublished: true` (the `Collection` model's equivalent of `Court`'s
  `status: published` — confirm the exact field/value on `Collection`, it's
  `isPublished: Boolean` per the schema, not a `status` enum like `Court`).
- `saveCollection(userId, collectionId): Promise<CollectionDTO>` — verify the
  collection exists AND `isPublished`, 404 otherwise; idempotent `upsert` on the
  composite PK; same P2003→401 handling as `SavedCourtsService.saveCourt`.
- `unsaveCollection(userId, collectionId): Promise<{ ok: true }>` — idempotent
  `deleteMany` on the composite PK, exactly like `unsaveCourt`.

### `saved-collections.controller.ts`
Mirror `SavedCourtsController` exactly:

```
@Controller('me/saved-collections')
@UseGuards(AuthGuard)
export class SavedCollectionsController {
  GET    /v1/me/saved-collections               → 200 CollectionDTO[]
  POST   /v1/me/saved-collections { collectionId } → 201 CollectionDTO
  DELETE /v1/me/saved-collections/:collectionId  → 200 { ok: true }
}
```

Same status-code reasoning as the saved-courts controller's header comment
(201 on both new-save and idempotent re-save; 200 + `{ ok: true }` on unsave,
never a 404 on an unknown/non-saved id).

### `apps/api/src/me/me.module.ts`
Register the new controller + service, same pattern as `SavedCourtsController` /
`SavedCourtsService` are registered today. Update the module's own header comment
block (which currently enumerates Features 54/55/62/63) to mention this addition.

## 4. Mock data seed — `packages/mock-data/src/users.ts`

Add a new export, mirroring `DEFAULT_SAVED_COURT_SLUGS` (line 22):

```ts
/** Default saved editorial-collection slugs — the mock's initial bookmarked set. */
export const DEFAULT_SAVED_COLLECTION_SLUGS: string[] = [
  'coastal-courts',
  'historic-clubs',
];
```

(Pick two real slugs that exist in `packages/mock-data/src/collections.ts`'s
`COLLECTION_SEEDS` — `coastal-courts` and `historic-clubs` both exist there
today; confirm before using them.) Export it from `packages/mock-data/src/index.ts`
alongside the existing `DEFAULT_SAVED_COURT_SLUGS` export.

## 5. Web domain — `apps/web/src/domain/saved/*`

### `saved.repository.ts` (interface)
Add four new methods to `SavedRepository`, documented as a NEW section (mirroring
the existing "Individual saved courts (standalone heart — API-backed)" section at
the bottom of the file):

```ts
// ── Individual saved editorial collections (standalone heart — API-backed) ───

/**
 * The user's saved (bookmarked) editorial collections. Distinct from
 * `getSavedCollections()` above, which returns the user's OWN wishlist folders
 * (`UserCollectionDTO[]`) — this returns editorial `CollectionDTO[]` the user has
 * hearted. In `api` mode → GET /v1/me/saved-collections; in mock mode → the
 * in-memory saved list.
 */
getSavedEditorialCollections(): Promise<CollectionDTO[]>;

/**
 * Whether `collectionId` is in the user's saved editorial collections. Seeds a
 * collection card's initial heart state. Derived from the same source as
 * `getSavedEditorialCollections()`. Read-only; `false` for an unknown/unsaved id.
 */
isCollectionSaved(collectionId: string): Promise<boolean>;

/** Save an editorial collection (idempotent). POST /v1/me/saved-collections in
 * `api` mode; the in-memory saved list in mock mode. */
saveCollection(collectionId: string): Promise<void>;

/** Unsave an editorial collection (idempotent). DELETE
 * /v1/me/saved-collections/:collectionId in `api` mode; the in-memory saved list
 * in mock mode. */
unsaveCollection(collectionId: string): Promise<void>;
```

Import `CollectionDTO` from `@tennis/contracts` at the top of the file (add to
the existing import list).

### `http-saved.repository.ts`
Add the four methods, mirroring `getSavedCourts`/`isCourtSaved`/`saveCourt`/
`unsaveCourt` exactly (same `getJson`/`postJson`/`deleteJson` helpers, same
`this.auth` forwarding). Add the four new routes to this file's own header-comment
route table (the block starting `getSavedCourts() → GET /v1/me/saved-courts`).

### `mock-saved.repository.ts`
Add an in-memory `savedCollections: CollectionDTO[]` field, seeded from
`DEFAULT_SAVED_COLLECTION_SLUGS` resolved against `COLLECTIONS` (the mock-data
export that already carries the derived `count`) — mirror exactly how
`savedCourts` is seeded from `DEFAULT_SAVED_COURT_SLUGS` resolved against
`COURTS` near the top of the class. Add `getSavedEditorialCollections`,
`isCollectionSaved`, `saveCollection`, `unsaveCollection` mirroring
`getSavedCourts`/`isCourtSaved`/`saveCourt`/`unsaveCourt` exactly (same
idempotency-by-presence-check logic, same "unknown/unpublished → no-op" rule for
save). Import `COLLECTIONS` from `@tennis/mock-data` and `CollectionDTO` from
`@tennis/contracts` at the top.

## 6. Web client-side mutation routing

### `apps/web/src/lib/saved-actions.ts`
Add two server actions mirroring `saveCourtAction`/`unsaveCourtAction`:

```ts
/** POST /v1/me/saved-collections — save an editorial collection (idempotent). */
export async function saveCollectionAction(collectionId: string): Promise<void> {
  const repositories = await getRepositoriesForRequest();
  await repositories.saved.saveCollection(collectionId);
}

/** DELETE /v1/me/saved-collections/:collectionId — unsave (idempotent). */
export async function unsaveCollectionAction(collectionId: string): Promise<void> {
  const repositories = await getRepositoriesForRequest();
  await repositories.saved.unsaveCollection(collectionId);
}
```

### `apps/web/src/lib/repositories.client.ts`
In `DemoActionSavedRepository`, add `saveCollection`/`unsaveCollection` delegating
to the two new actions (mirroring `saveCourt`/`unsaveCourt`), and add
`getSavedEditorialCollections`/`isCollectionSaved` to the "Reads → never called on
the client in demo mode" block, throwing via the same `unsupported(...)` helper
(mirroring `getSavedCourts`/`isCourtSaved`).

## 7. UI — the heart control: `apps/web/src/features/collections/CollectionSaveHeart.tsx` (new file)

Mirror `apps/web/src/features/home/HomeCourtSaveHeart.tsx` line-for-line, adapted
for a collection instead of a court:

- Props: `{ collectionId, collectionSlug, collectionLabel, initialSaved, signedIn = true }`
  (same shapes as `HomeCourtSaveHeartProps`, `collectionLabel` playing the role of
  `courtLabel` — the DISPLAYED name, in case a future masking rule ever hides it,
  though editorial collections aren't masked today).
- Same behavior triad: local `pending` state, optimistic flip, rollback in
  `.catch()`, `pending` cleared in `.finally()`, `aria-busy`/`disabled`/
  `<InlineSpinner label="Saving…" />` swapped 1:1 inside a fixed-size box.
- Uses `getMutationSavedRepository().saveCollection(collectionId)` /
  `.unsaveCollection(collectionId)` (same repository accessor, since
  `SavedRepository` now carries both court and collection mutation methods).
- Sign-in redirect target: `/signin?redirectTo=${encodeURIComponent(`/collections/${collectionSlug}`)}`
  (the collection's own detail page, mirroring how `HomeCourtSaveHeart` redirects
  back to the court's own page).
- Visual: same 36×36 `rounded-pill` circle, `bg-ink/35 backdrop-blur-sm`, same
  `HeartGlyph`. Position `absolute right-3 top-3` — both `CollectionCard` and
  `CuratedCollectionCard` have their count pill at `left-2`/`left-2.5 top-2`/
  `top-2.5`, so the top-right corner is free on both.
- **Rendered as a SIBLING of the card's `PendingCardLink`, never nested inside
  it** — same reasoning `HomeCourtSaveHeart`'s header comment gives (a `<button>`
  inside an `<a>` is invalid HTML, and this keeps the click handler simple with no
  `stopPropagation` reliance on bubbling through the anchor). This means
  `CollectionCard.tsx` and `CuratedCollectionCard.tsx` themselves are **not**
  edited — the heart is added at each CALL SITE's wrapping `<li>`, exactly as
  `HomeCourtSaveHeart` is added beside `HomeFeaturedCourts`' card, not inside a
  shared `CourtCard`.

Export it from `apps/web/src/features/collections/index.ts` alongside the other
exports there.

## 8. Wire the heart into the three card-strip components

Per the user's decision: the heart appears everywhere `CollectionCard` or
`CuratedCollectionCard` renders today — `/collections`' Featured strip AND Curated
grid, plus Home's collections teaser strip. Three files change, each the same
shape of edit:

### `apps/web/src/features/collections/FeaturedCollectionsStrip.tsx`
- Add props `savedCollectionIds: ReadonlySet<string>` and `signedIn?: boolean`
  (default `true`, matching `HomeFeaturedCourts`' convention) to
  `FeaturedCollectionsStripProps`.
- Add `relative` to the `<li key={collection.id} className="h-[240px] w-[200px] shrink-0">`
  (→ `"relative h-[240px] w-[200px] shrink-0"`).
- After `<CollectionCard .../>` inside that `<li>`, add:
  ```tsx
  <CollectionSaveHeart
    collectionId={collection.id}
    collectionSlug={collection.slug}
    collectionLabel={collection.name}
    initialSaved={savedCollectionIds.has(collection.id)}
    signedIn={signedIn}
  />
  ```
- Import `CollectionSaveHeart` from `./CollectionSaveHeart`.

### `apps/web/src/features/collections/CuratedCollectionsList.tsx`
- Same shape of change: add `savedCollectionIds`/`signedIn` props, add `relative`
  to `<li key={collection.id}>` (→ `<li key={collection.id} className="relative">`),
  add the same `<CollectionSaveHeart .../>` sibling after `<CuratedCollectionCard .../>`.
- **Update this file's header comment** — the "NO SAVE / BOOKMARK CONTROL —
  DELIBERATE" section is no longer true; replace it with a short note that the
  heart is now wired (mirroring how `HomeFeaturedCourts`/similar files describe
  their save heart) and point at `CollectionSaveHeart.tsx` for the behavior.

### `apps/web/src/features/home/HomeCollectionsTeaser.tsx`
- Same shape of change: add `savedCollectionIds`/`signedIn` props, add `relative`
  to `<li key={collection.id} className="w-[45vw] min-w-[150px] max-w-[190px] aspect-[3/4] shrink-0">`,
  add the same `<CollectionSaveHeart .../>` sibling after `<CollectionCard .../>`.

### `apps/web/src/features/collections/CuratedCollectionCard.tsx`
No code change (per §7, the heart is not nested inside it) — but its header
comment's last paragraph ("Still no save/heart control — bookmarking an editorial
collection has no model...") is now stale. Update it to say the heart is rendered
by the parent list as a sibling overlay, pointing at `CollectionSaveHeart.tsx`.

## 9. Page-level wiring — seed `savedCollectionIds` + `signedIn`

### `apps/web/src/app/collections/page.tsx`
Currently makes two PUBLIC reads (`collections.list()`, `countries.list()`) plus
a lightweight `isSignedIn()` call for the header icon only. Replace the
`isSignedIn()` call with the same protected-read-degrade pattern `app/page.tsx`
already uses for saved courts (see that file's "SAVED STATE + VIEWER ENTITLEMENT"
header block):

```ts
const protectedRepos = await getRepositoriesForRequest();
// ...alongside the existing public Promise.all...
let savedCollectionIds: string[] = [];
let signedIn = true;
try {
  const saved = await protectedRepos.saved.getSavedEditorialCollections();
  savedCollectionIds = saved.map((c) => c.id);
} catch (err) {
  if (err instanceof AuthRequiredError) {
    signedIn = false;
  } else {
    throw err;
  }
}
```

Pass `savedCollectionIds={new Set(savedCollectionIds)}` and `signedIn={signedIn}`
to both `<FeaturedCollectionsStrip>` and `<CuratedCollectionsList>`. Also pass
`signedIn` to `<AppShell>` as it already does today (this replaces the old
`isSignedIn()` call, not adds a second one — don't leave both).

### `apps/web/src/app/page.tsx` (Home)
Extend the EXISTING protected-read `Promise.all` (the one currently reading
`saved.getSavedCourts()` and `user.getCurrentUser()`) with a third parallel call,
`protectedRepos.saved.getSavedEditorialCollections()`, degrading together on the
same `AuthRequiredError` catch (don't add a second try/catch block — one
degrade path for all three protected reads, exactly as the file's own header
comment insists: "both protected reads run together and degrade together... so
this stays two reads total, not three" — update that comment to say three
reads, not two, once this lands). Derive `savedCollectionIds = saved.map(c => c.id)`
the same way `savedCourtIds` is derived. Pass `savedCollectionIds` down through
`HomeExplorer` → `HomeCollectionsTeaser` (check `HomeExplorer.tsx`'s existing
prop-threading for `savedCourtIds`/`signedIn` around line 66/82/198 and mirror it
for the new prop).

### `apps/web/src/app/saved/page.tsx`
Add `repositories.saved.getSavedEditorialCollections()` as a third parallel call
inside the existing `loadOrSignIn(() => Promise.all([...]), '/saved')` block
(alongside `getSavedCourts`/`getSavedCollections`/`getCurrentUser`). Pass the
result as a new `savedEditorialCollections` prop to `<SavedTabs>`.

## 10. Saved page — new section in the Collections tab

Per the user's decision: saved editorial collections get their OWN section inside
the existing Collections tab, alongside (not replacing) the personal-folders
section that's there today.

### New file: `apps/web/src/features/saved/SavedEditorialCollectionsGrid.tsx`
A new component, mirroring `SavedCourtsGrid.tsx`'s structure (lifted
optimistic-unsave state via `unsavedIds`/`onUnsavedChange` props, `relative` `<li>`
+ sibling unsave control, same pending/rollback/finally triad) but rendering
`CollectionDTO[]` with the SAME visual card `CollectionCard` already provides
(reuse it — don't invent a third card look) plus a `CollectionSaveHeart` sibling
per card (which doubles as the unsave control here — clicking a filled heart
unsaves, exactly like the heart everywhere else, so this section does NOT need
its own separate "X" unsave button like `SavedCourtsGrid` has; the heart already
toggles). Grid layout: reuse `SavedCollectionsGrid.tsx`'s own grid breakpoints
(`grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cards-4` — check that file's exact
classes and copy them) so the two sections visually match. Empty state: render
nothing when the list is empty (same "no bare heading over a void" rule
`FeaturedCollectionsStrip`/`CuratedCollectionsList` already follow) — don't add a
new empty-state illustration for this.

### `apps/web/src/features/saved/SavedTabs.tsx`
- Add prop `savedEditorialCollections: CollectionDTO[]` to `SavedTabsProps`.
- Track an optimistic-unsave set for editorial collections the same way `unsavedIds`
  already tracks courts (a second `useState<ReadonlySet<string>>` + matching
  change handler) — do not conflate it with the existing `unsavedIds` (that one is
  scoped to courts by the surrounding code and the Wishlist Map reader).
- Inside the `activeTab === 'collections'` panel, render TWO sections in order:
  1. A "Saved Collections" heading + `<SavedEditorialCollectionsGrid>` (new,
     editorial, only when non-empty — mirror how other sections here skip an
     empty heading).
  2. The existing "Your Folders" heading (add one if none exists today — check
     whether `SavedCollectionsGrid`'s current rendering already implies a
     heading via the tab itself) + the existing `<SavedCollectionsGrid>` call,
     UNCHANGED.
  Check `SavedCollectionsGrid.tsx`'s current props/rendering before adding a
  heading above it, so you don't duplicate one it already renders internally.
- The tab's total `count` (currently `collections.length` where `collections` is
  personal folders only) — decide whether "N saved" on this tab should now count
  BOTH personal folders and saved editorial collections combined, or stay
  folders-only with the editorial section carrying its own separate count. Default
  to combining them (`collections.length + savedEditorialCollections.length`,
  minus this session's editorial-unsave set) since the tab's job is "everything
  under Collections," but say in the report which you chose and why if you
  diverge.

## Do not touch

- `SavedCourt`, `SavedCourtsController/Service`, `CourtSaveButton.tsx`,
  `HomeCourtSaveHeart.tsx` — the precedent, read-only reference; not modified.
- `UserCollection`/`UserCollectionCourt` models, `getSavedCollections()`,
  `getUserCollectionBySlug`, `getCollectionIdsForCourt`,
  `createUserCollection`/`toggleCourtInCollection`/`renameUserCollection` — the
  personal-wishlist-folder feature is completely separate and untouched by this
  task. Do not rename or repurpose any of it.
- `collections.controller.ts` / `collections.service.ts` / `collections.mapper.ts`
  (the PUBLIC `/v1/collections` reads) — only their exported `collectionSelect`/
  `toCollectionDTO` are IMPORTED (read-only) by the new saved-collections service;
  nothing in these files changes.
- `CollectionCard.tsx`, `CuratedCollectionCard.tsx` — no code changes (per §7/§8),
  only `CuratedCollectionCard.tsx`'s stale comment is updated.
- Court Detail, Map, or any court-save-heart code — unrelated to this feature.

## Do not forget

Update the following stale "not being built" comments once the feature lands (they
currently assert something this task makes false):
- `apps/web/src/features/saved/SavedCollectionsGrid.tsx` header comment.
- `apps/web/src/features/saved/SavedCollectionRow.tsx` header comment.
- `apps/web/src/features/collections/CuratedCollectionsList.tsx` header comment
  (§8 above).
- `apps/web/src/features/collections/CuratedCollectionCard.tsx` header comment
  (§8 above).

None of these files' actual CODE needs to change beyond what's specified above —
`SavedCollectionsGrid`/`SavedCollectionRow` stay exactly as they are (they still
correctly render `UserCollectionDTO` only; the comment just needs to stop saying
the editorial feature doesn't exist anywhere in the product, since it now exists
in a different, sibling component).

## Testing

- `POST /v1/me/saved-collections { collectionId }` with a valid published
  collection id → 201 + `CollectionDTO`; repeat → still 201, no duplicate row.
  With an unknown/unpublished id → 404. Without auth → 401.
- `DELETE /v1/me/saved-collections/:collectionId` → 200 `{ ok: true }`, including
  for a never-saved id (idempotent, no 404).
- `GET /v1/me/saved-collections` → the authed user's saved editorial collections,
  most-recently-saved first, `[]` when none.
- On `/collections`: a logged-in user sees a filled heart on any collection
  they've already saved (Featured strip AND Curated grid); clicking an empty
  heart fills it and a refresh of `/saved` shows that collection under the new
  "Saved Collections" section; clicking a filled heart unsaves it. A logged-out
  visitor's heart click routes to `/signin?redirectTo=/collections/{slug}`.
- On Home: the collections teaser strip shows the same real saved state and the
  same save/unsave behavior.
- On `/saved` → Collections tab: both sections render (Saved Collections +
  personal folders); unsaving a card in the new section removes it optimistically
  and the "N saved" count updates; a rollback on failure restores it.
- Mock mode (`NEXT_PUBLIC_DATA_SOURCE` unset/`mock`): the same flows work against
  the in-memory `MockSavedRepository`, seeded with `DEFAULT_SAVED_COLLECTION_SLUGS`.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean across `apps/api` and
  `apps/web`. Run the new Prisma migration and confirm `prisma generate` picked up
  the new `SavedCollection` model (the API won't typecheck against
  `this.prisma.savedCollection` otherwise).

## Report

List every file created/changed, confirm the migration was generated (not
hand-written) and its name, confirm the four stale "not being built" comments
were updated, and state which choice you made for the Collections tab's "N saved"
count (combined vs folders-only) and why. No git commit or push unless asked.
