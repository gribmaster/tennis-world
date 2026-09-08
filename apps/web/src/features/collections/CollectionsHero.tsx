// CollectionsHero — the v2 screen header for /collections (Feature 76), rebuilt from
// the prototype's CollectionsScreen (tennis_world_v2_standalone.html:1293–1300).
//
// RESTRUCTURED, not deleted. v1 was a full-bleed dark band with a faded aerial photo
// behind a serif display title (ported from files/collections.html). v2 replaces that
// treatment with a light title + one-line subtitle sitting directly on the bone page
// background — the intake (§2.5) called this out as an accepted visual delta, and it is
// what makes `/collections` read as a landing surface rather than an article header when
// it becomes a bottom-tab destination (Feature 84).
//
// Prototype geometry, from the file:
//   • header row `padding:'52px 20px 0'` (line 1294) — the top inset is supplied here by
//     `pt-8` under AppShell's standard 72px header offset, and the 20px side gutter by
//     `.container-page`.
//   • title: `className="serif display-l"` (line 1295).
//   • subtitle: `fontSize:13, color:'var(--stone)', padding:'4px 20px 0'` (line 1301).
//
// ── THE SEARCH / FILTER GLYPHS ARE DELIBERATELY ABSENT ──────────────────────────────────
// The prototype draws `Ico.search(20)` and `Ico.filter(20)` in this row (lines 1296–1297)
// with NO `onClick` — they are dressing (the intake says so explicitly in §2.5). They are
// omitted rather than rendered, because:
//   • An inert control is exactly the problem `docs/PHASE_1_PLACEHOLDER_CTA_AUDIT.md` was
//     written about. A glyph that looks tappable and does nothing is a bug, not a style.
//   • The shared `FilterSheet` (Feature 73) cannot back them: every dimension it models
//     (surface, access, indoor/outdoor, scenic, experience tags) is a property of a COURT,
//     not of a collection. A collection has `name` / `description` / `count` and nothing
//     to narrow by. Giving them real behaviour would mean adding a collections filter
//     dimension to the shared module — which Feature 76 must not touch.
// The screen therefore ships with no header controls at all. If collection filtering ever
// earns a real dimension, this row is where it goes.
//
// PRESENTATIONAL only: local copy constants, overridable via props. No repository, no
// @tennis/mock-data, no Image (the decorative aerial went with the dark band).

const DEFAULT_TITLE = 'Collections';
const DEFAULT_SUBTITLE = 'Curated tennis destinations around the world.';

export interface CollectionsHeroProps {
  title?: string;
  subtitle?: string;
}

export function CollectionsHero({
  title = DEFAULT_TITLE,
  subtitle = DEFAULT_SUBTITLE,
}: CollectionsHeroProps) {
  return (
    <header className="container-page pt-8">
      <h1 className="serif display-l text-ink">{title}</h1>
      <p className="mt-1 text-[13px] leading-snug text-stone">{subtitle}</p>
    </header>
  );
}
