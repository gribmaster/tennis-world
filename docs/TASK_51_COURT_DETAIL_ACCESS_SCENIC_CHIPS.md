# TASK 51 — Court Detail: add Access + Scenic chips to the Experience chip row

**Model: Sonnet 5, reasoning effort: low.**

## Context

The single court page's Experience chip row (`CourtDetailTagStrip.tsx`) currently
renders ONLY `court.tags` (the closed "Experience" vocabulary — Sea View, Beach
Club, Mountains, etc.). Checked against the original design prototype
(`new design/tennis_world_v2_standalone.html`, `CourtDetailScreen`, ~line 1062):

```js
<div className="h-scroll" style={{padding:'0 20px',gap:8}}>
  {court.labels.map(l=>(
    <Label key={l} type="exp">{l}</Label>
  ))}
</div>
```

In the prototype's (simplified) demo data model, `court.labels` is one flat array
mixing Experience tags together with the court's access classification and a
"Scenic" flag (e.g. one demo court: `labels:['Sea View','Beach Club','Resort','Scenic','Private']`)
— all rendered identically as `.chip-exp` pills in one scrolling row. The real app
schema correctly split these into typed fields (`tags: CourtTag[]`,
`access: AccessType`, `isScenic: boolean`) rather than one loose string array, but
`CourtDetailTagStrip` was only ever wired to `tags` — the access/scenic chips from
the prototype's row were never carried over. This task closes that gap.

**Scope check — this is Court Detail (the single court page) only.** Cards
elsewhere (Home Featured/Editor's Cut, Collection grids, Saved) have their own
separate, deliberate "location/tags only, not surface/access" rule (see
`courtCategoryTags()`'s doc comment, Task 35) — that rule is untouched by this
task. Do not add access/scenic chips to any card component.

## No backend/contract change needed

`access` and `isScenic` are already on `CourtSummarySchema` (and therefore
`CourtDTO`, which extends it) — confirmed in `packages/contracts/src/court.ts`.
Both are always-public fields (no entitlement gating, unlike `lat`/`lng`), exactly
like `tags` already is. This is a frontend-only change.

## The change

### `apps/web/src/features/court-detail/CourtDetailTagStrip.tsx`

```tsx
import type { AccessType, CourtTag } from '@tennis/contracts';

export interface CourtDetailTagStripProps {
  /** The court's Experience tags, in canonical vocabulary order. May be empty. */
  tags: CourtTag[];
  /** The court's access classification — always present, rendered as its own chip. */
  access: AccessType;
  /** Whether this court is flagged scenic — adds a "Scenic" chip when true. */
  isScenic: boolean;
}

export function CourtDetailTagStrip({ tags, access, isScenic }: CourtDetailTagStripProps) {
  // Access is always present, so this row is never empty (unlike the old
  // tags-only version, which could legitimately render nothing for a
  // no-tags court). Kept as a plain array so every chip — tag, access,
  // Scenic — shares one `.chip-exp` treatment and one scroll row, matching
  // the prototype's single flat `labels` list.
  const labels: string[] = [...tags, access, ...(isScenic ? ['Scenic'] : [])];

  return (
    <ul className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-[2px] md:px-0">
      {labels.map((label) => (
        <li key={label} className="shrink-0">
          <span className="inline-flex items-center whitespace-nowrap rounded-pill bg-ink/[0.06] px-2.5 py-[5px] text-[12px] font-medium text-graphite">
            {label}
          </span>
        </li>
      ))}
    </ul>
  );
}
```

- Drop the old `if (tags.length === 0) return null` early return — `access` is a
  required, always-populated enum on every court, so the combined `labels` array
  can never be empty now. (If you want a defensive `if (labels.length === 0) return
  null` left in for safety, that's fine — it just won't ever trigger in practice.)
- Order: existing Experience tags first (unchanged from today), then the access
  chip, then "Scenic" last if `isScenic` — matches the prototype's own ordering
  closely enough (tags, then access-like values, then Scenic) without trying to
  force an exact 1:1 replay of its demo array (the prototype's demo data isn't
  schema-accurate — e.g. one example court lists BOTH "Resort" and "Private" as if
  access were multi-valued, but the real schema's `access` is a single enum value
  per court, so only one access chip will ever show).
- Update the file's header comment: it currently says "the court's Experience tags
  as a horizontally scrolling chip row" and "PRESENTATIONAL: tags are
  always-public descriptive metadata... This component receives no coordinates and
  no lock state" — extend it to describe the access + Scenic additions and why
  (prototype fidelity, this task), and note both new fields are equally
  always-public / not lock-gated, same as tags already are.

### `apps/web/src/app/courts/[slug]/page.tsx` — both `renderUnlocked()` and `renderLocked()`

Pass the two new required props at both call sites:

```tsx
<CourtDetailTagStrip
  tags={court.tags}
  access={court.access}
  isScenic={court.isScenic}
/>
```

Both fields are always-public (not part of the locked/unlocked entitlement split),
so they're passed identically in both branches — same treatment `tags` already
gets today (shown regardless of lock state).

## Do not touch

- `courtCategoryTags()` / `courtDisplay()` (`components/court/court-display.ts`) —
  the CARD-level "location/tags only" rule (Task 35) is separate and unrelated;
  don't touch it or any card component (Home Featured/Editor's Cut, Collection
  grids, Saved, Map).
- `TAG_PHRASE_MAP` / the content importer — unrelated; that governs how `tags`
  itself gets populated at import time, not how the detail page renders it plus
  access/scenic.
- Anything about `surface` — it already has its own separate pill next to the
  title/location (`SurfaceLabel`/meta-chip) and stays exactly as is; this task
  doesn't touch it or duplicate it into the chip row.
- The chip visual style itself (`.chip-exp` / `bg-ink/[0.06]` treatment) —
  unchanged; access/scenic chips use the exact same styling as tag chips, no new
  chip variant.

## Testing

- On any Court Detail page (locked or unlocked reading), the Experience chip row
  now also shows the court's access classification (e.g. "Resort", "Private",
  "Club", "Academy") and, if the court is flagged scenic, a "Scenic" chip at the
  end — alongside its existing Experience tags, all in the same horizontally
  scrolling row.
- A court with zero Experience tags still shows a row now (just the access chip,
  plus Scenic if applicable) — confirm this doesn't look broken/empty-ish for such
  a court (e.g. `mouratoglou-tennis-academy`, which currently has no tags).
- Locked and unlocked readings both show the same access/scenic chips for the same
  court — neither is masked or omitted based on lock state.
- No change to any card component's chip display anywhere else in the app.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean.

## Report

Confirm both new props are required (not optional/defaulted) and wired at both
`renderUnlocked()`/`renderLocked()` call sites, confirm no card component was
touched, and confirm the old empty-row early return was removed or is provably
dead code now. No git commit or push unless asked.
