# Feature 32 — Editorial Collection Detail Guardrail (no-op)

**Status:** Guardrail / documentation only — **no code, route, contract, repository, or mock-data
change.** This note exists to lock in the editorial-vs-user collection distinction during the
Feature 28 intake (Features 29–37), and to record why the new `files/collection.html` (singular)
prototype must **not** be used to refresh the editorial `/collections/[slug]` screen.
**Companions:** `FEATURE_28_NEW_DESIGNS_INTAKE.md` (§3, §8 Feature 32),
`PHASE_1_PLACEHOLDER_CTA_AUDIT.md`.

---

## 1. Route ↔ prototype mapping (the thing not to get wrong)

| Route | What it is | Source prototype | Status |
|---|---|---|---|
| `/collections` | **Editorial** collections index (curated themes) | `files/collections.html` (plural) | Built (Feature 16). No refresh. |
| `/collections/[slug]` | **Editorial** collection detail (dark hero + courts grid) | `files/collections.html` (plural) | Built (Feature 17). **No refresh — see §3.** |
| `/saved/collections/[slug]` *(future)* | **User wishlist** collection detail (a person's own folder) | `files/collection.html` (**singular**) | **Not implemented.** Future Feature 33. |

Confirmations:

- **`/collections` is editorial collections.** Curated, published themes (Coastal, Desert,
  Hidden…), owned by the editorial team, read-only.
- **`/collections/[slug]` is editorial collection detail.** Dark hero band + the courts that belong
  to the editorial collection.
- **`files/collections.html` (plural) maps to the existing `/collections`** index — no new route.
- **`files/collection.html` (singular) is the USER wishlist collection detail** — a person's own
  folder, with back-to-`saved`, inline **Rename**, per-card **Remove**, and an empty state. It reads
  `?id=` from `USER_COLLECTIONS`, not from the editorial `COLLECTIONS` dataset.
- **`files/collection.html` must map to the future `/saved/collections/[slug]`, NOT to
  `/collections/[slug]`.** Its own back-link returns to `saved.html`, which confirms it lives under
  Saved conceptually.
- **No implementation change is required for editorial collection detail now.**

---

## 2. Why `files/collection.html` must NOT feed the editorial detail

`collection.html` (singular) is a *different domain object* from the editorial collection:

| | Editorial `/collections/[slug]` | User `collection.html` (singular) |
|---|---|---|
| Domain object | `CollectionDTO` (`packages/contracts/src/collection.ts`) | `UserCollectionDTO` (`packages/contracts/src/user.ts`) |
| Data source | editorial `COLLECTIONS` (read-only) | `USER_COLLECTIONS` (user-owned) |
| Repository | `collections` (`CollectionRepository`) | `saved` (`SavedRepository`) |
| Back-link | "All collections" → `/collections` | "← Saved" → `saved.html` |
| Mutability | none (curated) | rename folder, remove courts (mutating) |
| Affordances | dark hero + courts grid | rename input, per-card remove, empty state |

Using `collection.html` to "refresh" `/collections/[slug]` would conflate two domains, two DTOs, and
two repositories behind one route, and would force the editorial page to grow ownership/mutation
affordances (rename/remove) that have no place on curated editorial content. This is explicitly
disallowed by the Feature 28 intake (§3) and by this guardrail. The user-collection detail is a
**separate future route** (`/saved/collections/[slug]`, Feature 33) — not a variation of the
editorial detail.

---

## 3. Is any tiny editorial-detail visual tweak needed? — No.

Comparison of the current editorial implementation against `files/collections.html` (the *correct*
editorial source) and `files/collection.html` (the user source, for contrast):

- `apps/web/src/features/collection-detail/CollectionDetailHero.tsx` already implements the dark
  hero treatment with the collection's own cover image (faded), an **"All collections" back-link**
  in the hero, the `Collection · N courts` eyebrow, the name, and an optional description. This
  already matches the editorial pattern and even carries the back-bar affordance the intake flagged
  as an *optional* polish (`FEATURE_28` §1, §8). No spacing change is warranted.
- `apps/web/src/features/collection-detail/CollectionCourtsGrid.tsx` reuses the shared `CourtCard`
  in a responsive grid with an empty state, mirroring the editorial court-grid treatment.

**Conclusion: no tweak is needed, so no code was changed.** The only "tweak" `collection.html` would
suggest (a back-to-`saved` bar, rename, per-card remove) belongs to the *user* collection detail and
must not be ported onto the editorial screen.

---

## 4. Conclusion

- ✅ `/collections` and `/collections/[slug]` are **editorial** and stay exactly as-is.
- ✅ `files/collection.html` (singular) is the **user wishlist** detail → future
  `/saved/collections/[slug]` (Feature 33), **never** `/collections/[slug]`.
- ✅ **No code change** to editorial collection detail in this feature (documented no-op/guardrail).
- ✅ No new routes, no contract/repository/mock-data changes, no user-collection implementation.

**Next recommended feature:** Feature 33 — User-collection detail layout + route
(`/saved/collections/[slug]`, read path), per `FEATURE_28_NEW_DESIGNS_INTAKE.md` §8.
