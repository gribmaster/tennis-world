import Image from 'next/image';
import { PendingLink } from '@/components/navigation';

// SavedDreamListCta — the promo card that closes the Saved → Courts tab (Feature 77),
// from the prototype's SavedScreen (tennis_world_v2_standalone.html:1247–1258).
//
// NEW component (the intake calls it out as new in §2.6). It promotes the Collections
// surface from inside Saved, which is why it lives on the Courts tab rather than the
// Collections tab — it is an invitation to go somewhere the visitor is not already.
//
// Prototype geometry, from the file:
//   • card `background:'var(--ivory)'`, `borderRadius:12`, `padding:'16px'`, `gap:12`,
//     `alignItems:'center'`, `border:'1px solid rgba(184,184,182,0.3)'` (line 1248) — the
//     border colour is `--mist` at 30%, i.e. the `mist/30` token, not a new value.
//   • eyebrow "Create your": `fontSize:12`, `color:'var(--gold)'`, `fontWeight:600`,
//     `marginBottom:4` (line 1250).
//   • title "Dream List": serif `fontSize:22`, `fontWeight:400`, `lineHeight:1.1` (1251).
//   • body: `fontSize:12`, `color:'var(--stone)'`, `marginTop:4`, `lineHeight:1.4` (1252).
//   • CTA: `.btn.btn-primary.btn-sm` at `fontSize:11`, `marginTop:10` (line 1253). There is
//     no `.btn-sm` in `globals.css` and this feature does not add one (CLAUDE.md §9 — no
//     new button system); the size is expressed as height/padding/text utilities on the
//     existing `.btn .btn-primary`, exactly as `HomeHero` does for its own small CTA.
//   • image pair, a `70×80` box (line 1255): a `60×70` tile pinned top-right rotated +5°,
//     and a `55×65` tile pinned bottom-left rotated −4°, both `borderRadius:8` (1256–1257).
//
// ── WHERE THE TILTED IMAGES COME FROM ───────────────────────────────────────────────────
// The prototype fills the pair from two arbitrary `IMG` constants. Here they are the hero
// images of two courts the caller ALREADY has in hand (the saved list the tab is rendering)
// — so the card costs no extra fetch, no new prop on the page's repository reads, and no
// new static asset. They are pure decoration: `alt=""` inside an `aria-hidden` box, no
// names, no links. When fewer than two are available the box simply renders what it has,
// and with none it is omitted, so a one-court or empty-ish list never shows a gap where a
// tile should be.
//
// PRESENTATIONAL: no repository, no @tennis/mock-data, no state.
//
// PENDING STATES (CLAUDE.md §4 rule 1): "Explore collections" navigates ⇒ `PendingLink`.
// It is a CTA link, not a whole-card link — the card itself is not clickable, exactly as in
// the prototype, where only the button carries the handler.

/** Prototype tile geometry (lines 1256–1257), in render order: back tile, then front. */
const TILE_CLASSES = [
  'right-0 top-0 h-[70px] w-[60px] rotate-[5deg]',
  'bottom-0 left-0 h-[65px] w-[55px] -rotate-[4deg]',
] as const;

export interface SavedDreamListCtaProps {
  /**
   * Hero image urls for the decorative tilted pair. At most the first two are used; an
   * empty array drops the decoration entirely. Decoration only — never a court identity.
   */
  imageUrls?: string[];
}

export function SavedDreamListCta({ imageUrls = [] }: SavedDreamListCtaProps) {
  const tiles = imageUrls.slice(0, TILE_CLASSES.length);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-mist/30 bg-ivory p-4">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-gold">Create your</p>
        <p className="serif mt-1 text-[22px] font-normal leading-[1.1] text-ink">Dream List</p>
        <p className="mt-1 text-[12px] leading-[1.4] text-stone">
          Save more courts and start planning your next trip.
        </p>
        <PendingLink
          href="/collections"
          className="btn btn-primary mt-2.5 h-9 px-4 text-[11px]"
        >
          Explore collections
        </PendingLink>
      </div>

      {tiles.length > 0 ? (
        <div aria-hidden className="relative h-20 w-[70px] shrink-0">
          {tiles.map((src, index) => (
            <div
              key={src}
              className={`absolute overflow-hidden rounded-md ${TILE_CLASSES[index]}`}
            >
              <Image src={src} alt="" fill sizes="60px" className="object-cover" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
